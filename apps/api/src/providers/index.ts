import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '@esmart/db';
import type { Config } from '../config';
import { createAssistantProvider, type AssistantProvider } from './assistant';
import { createComplianceProvider, type ComplianceProvider } from './compliance';
import { createFxProvider, type FxProvider } from './fx';
import { createGstinProvider, type GstinProvider } from './gstin';
import { createMessaging, Outbox, type EmailProvider, type PushProvider, type SmsProvider, type WhatsAppProvider } from './messaging';
import { createOcrProvider, type OcrProvider } from './ocr';
import { createPaymentsProvider, type PaymentsProvider } from './payments';
import { ChromiumPdf, StubPdf, type PdfProvider } from './pdf';
import { AzureBlobStorage, MemoryStorage, S3Storage, type StorageProvider } from './storage';

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
  assistant: AssistantProvider;
};

/**
 * Picks each third-party integration from config. Every one has an
 * in-process stand-in, so development and tests need only Postgres; config
 * refuses the stand-ins when NODE_ENV=production.
 */
export function createProviders(config: Config, log: FastifyBaseLogger | { info: (m: string) => void }, db: Db): Providers {
  const outbox = new Outbox();
  const messaging = createMessaging(config, outbox, (m) => log.info(m));
  return {
    outbox,
    ...messaging,
    storage: createStorage(config),
    pdf: config.PDF_PROVIDER === 'chromium' ? new ChromiumPdf(config) : new StubPdf(),
    compliance: createComplianceProvider(config),
    gstin: createGstinProvider(config, db),
    ocr: createOcrProvider(config),
    fx: createFxProvider(config),
    payments: createPaymentsProvider(config),
    assistant: createAssistantProvider(config),
  };
}

function createStorage(config: Config): StorageProvider {
  switch (config.STORAGE_PROVIDER) {
    case 'azure':
      return new AzureBlobStorage(config);
    case 's3':
      return new S3Storage(config);
    case 'memory':
      return new MemoryStorage(config.PUBLIC_BASE_URL, config.JWT_SECRET);
  }
}

export { MemoryStorage, Outbox };
