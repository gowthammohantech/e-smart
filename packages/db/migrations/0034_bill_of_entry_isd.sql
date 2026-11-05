ALTER TABLE "documents" ADD COLUMN "bill_of_entry" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "isd_invoice" boolean DEFAULT false NOT NULL;