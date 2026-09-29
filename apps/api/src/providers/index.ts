import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config';
import { createComplianceProvider, type ComplianceProvider } from './compliance';
import { createFxProvider, type FxProvider } from './fx';
import { createGstinProvider, type GstinProvider } from './gstin';
import { createMessaging, Outbox, type EmailProvider, type PushProvider, type SmsProvider, type WhatsAppProvider } from './messaging';
import { createOcrProvider, type OcrProvider } from './ocr';
import { createPaymentsProvider, type PaymentsProvider } from './payments';
import { ChromiumPdf, StubPdf, type PdfProvider } from './pdf';
import { MemoryStorage, S3Storage, type StorageProvider } from './storage';

export type Providers = {
  /** Messages the log providers "sent". Always present; empty with real providers. */
  outbox: Outbox;
  sms: SmsProvider;
  email: EmailProvider;
  whatsapp: WhatsAppProvider;
  push: PushProvider;
  storage: StorageProvider;
  pdf: PdfProvider;
  compliance: ComplianceProvider;
  gstin: GstinProvider;
  ocr: OcrProvider;
  fx: FxProvider;
  payments: PaymentsProvider;
};

/**
 * Picks each third-party integration from config. Every one has an
 * in-process stand-in, so development and tests need only Postgres.
 */
export function createProviders(config: Config, log: FastifyBaseLogger | { info: (m: string) => void }): Providers {
  const outbox = new Outbox();
  const messaging = createMessaging(config, outbox, (m) => log.info(m));
  return {
    outbox,
    ...messaging,
    storage: config.STORAGE_PROVIDER === 's3' ? new S3Storage(config) : new MemoryStorage(config.PUBLIC_BASE_URL, config.JWT_SECRET),
    pdf: config.PDF_PROVIDER === 'chromium' ? new ChromiumPdf(config) : new StubPdf(),
    compliance: createComplianceProvider(config),
    gstin: createGstinProvider(config),
    ocr: createOcrProvider(config),
    fx: createFxProvider(config),
    payments: createPaymentsProvider(config),
  };
}

export { MemoryStorage, Outbox };
