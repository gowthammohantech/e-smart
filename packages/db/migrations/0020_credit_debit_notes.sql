CREATE TYPE "public"."note_reason" AS ENUM('discount', 'priceChange', 'taxCorrection', 'deficiency', 'other');--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'creditNote';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'debitNote';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'supplierCreditNote';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'supplierDebitNote';--> statement-breakpoint
ALTER TYPE "public"."numbering_kind" ADD VALUE 'creditNote';--> statement-breakpoint
ALTER TYPE "public"."numbering_kind" ADD VALUE 'debitNote';--> statement-breakpoint
ALTER TYPE "public"."numbering_kind" ADD VALUE 'supplierCreditNote';--> statement-breakpoint
ALTER TYPE "public"."numbering_kind" ADD VALUE 'supplierDebitNote';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "note_reason" "note_reason";--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD COLUMN "tds_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD COLUMN "discount_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD COLUMN "write_off_minor" bigint DEFAULT 0 NOT NULL;