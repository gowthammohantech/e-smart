import { createHmac } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config';
import { safeEqual } from '../lib/crypto';

export type SignedUrl = { url: string; method: 'PUT' | 'GET'; headers: Record<string, string>; expiresAt: Date };
export type StoredObject = { size: number; contentType: string };

/**
 * Object storage behind pre-signed URLs: the apps upload and download
 * directly, the API only hands out short-lived links and records metadata.
 */
export interface StorageProvider {
  /** A URL the client PUTs the file to. */
  uploadUrl(key: string, contentType: string, ttlSeconds?: number): Promise<SignedUrl>;
  /** A URL the client GETs the file from. */
  downloadUrl(key: string, opts?: { ttlSeconds?: number; filename?: string }): Promise<SignedUrl>;
  /** Server-side write: PDFs, exports. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  head(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

const DEFAULT_TTL = 900;

/** Development and tests: bytes in a Map, URLs served by the API itself. */
export class MemoryStorage implements StorageProvider {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  private sign(method: string, key: string, exp: number, extra = ''): string {
    return createHmac('sha256', this.secret).update(`${method}\n${key}\n${exp}\n${extra}`).digest('base64url');
  }

  verify(method: string, key: string, exp: number, sig: string, extra = ''): boolean {
    return exp * 1000 > Date.now() && safeEqual(sig, this.sign(method, key, exp, extra));
  }

  private url(method: 'PUT' | 'GET', key: string, ttl: number, extra = ''): SignedUrl {
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const q = new URLSearchParams({ exp: String(exp), sig: this.sign(method, key, exp, extra) });
    if (extra) q.set('ct', extra);
    return { url: `${this.baseUrl}/v1/_storage/${encodeURIComponent(key)}?${q}`, method, headers: method === 'PUT' ? { 'content-type': extra } : {}, expiresAt: new Date(exp * 1000) };
  }

  async uploadUrl(key: string, contentType: string, ttlSeconds = DEFAULT_TTL) {
    return this.url('PUT', key, ttlSeconds, contentType);
  }
  async downloadUrl(key: string, opts: { ttlSeconds?: number } = {}) {
    return this.url('GET', key, opts.ttlSeconds ?? DEFAULT_TTL);
  }
  async put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async get(key: string) {
    return this.objects.get(key)?.body ?? null;
  }
  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { size: o.body.length, contentType: o.contentType } : null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }

  /** The routes the signed URLs point at. Registered only in memory mode. */
  routes(app: FastifyInstance) {
    app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    type Q = { exp: string; sig: string; ct?: string };
    app.put<{ Params: { key: string }; Querystring: Q }>('/v1/_storage/:key', async (req, reply) => {
      const { exp, sig, ct = '' } = req.query;
      if (!this.verify('PUT', req.params.key, Number(exp), sig, ct)) return reply.status(403).send();
      await this.put(req.params.key, req.body as Buffer, ct || String(req.headers['content-type'] ?? 'application/octet-stream'));
      return reply.status(200).send();
    });
    app.get<{ Params: { key: string }; Querystring: Q }>('/v1/_storage/:key', async (req, reply) => {
      const { exp, sig } = req.query;
      if (!this.verify('GET', req.params.key, Number(exp), sig)) return reply.status(403).send();
      const o = this.objects.get(req.params.key);
      if (!o) return reply.status(404).send();
      return reply.type(o.contentType).send(o.body);
    });
  }
}

export class S3Storage implements StorageProvider {
  private readonly s3: S3Client;
  constructor(private readonly config: Config) {
    this.s3 = new S3Client({ region: config.S3_REGION, endpoint: config.S3_ENDPOINT, forcePathStyle: config.S3_FORCE_PATH_STYLE });
  }
  async uploadUrl(key: string, contentType: string, ttlSeconds = DEFAULT_TTL) {
    const url = await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: ttlSeconds });
    return { url, method: 'PUT' as const, headers: { 'content-type': contentType }, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }
  async downloadUrl(key: string, opts: { ttlSeconds?: number; filename?: string } = {}) {
    const ttl = opts.ttlSeconds ?? DEFAULT_TTL;
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: key,
        ResponseContentDisposition: opts.filename ? `attachment; filename="${opts.filename}"` : undefined,
      }),
      { expiresIn: ttl },
    );
    return { url, method: 'GET' as const, headers: {}, expiresAt: new Date(Date.now() + ttl * 1000) };
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    try {
      const out = await this.s3.send(new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }));
      return Buffer.from(await out.Body!.transformToByteArray());
    } catch {
      return null;
    }
  }
  async head(key: string) {
    try {
      const out = await this.s3.send(new HeadObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }));
      return { size: out.ContentLength ?? 0, contentType: out.ContentType ?? 'application/octet-stream' };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }));
  }
}
