ALTER TYPE "public"."numbering_kind" ADD VALUE 'selfInvoice';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tan" varchar(10);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tds_section" varchar(8);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tds_rate" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tds_amount_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "self_invoice_number" varchar(40);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "itc_reversed_on" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "itc_reclaimed_on" date;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "tds_section" varchar(8);--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "lower_tds_rate" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "lower_tds_valid_till" date;