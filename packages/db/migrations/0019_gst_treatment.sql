CREATE TYPE "public"."itc_eligibility" AS ENUM('eligible', 'blocked', 'ineligible');--> statement-breakpoint
CREATE TYPE "public"."msme_type" AS ENUM('micro', 'small', 'medium');--> statement-breakpoint
CREATE TYPE "public"."return_frequency" AS ENUM('monthly', 'qrmp');--> statement-breakpoint
CREATE TYPE "public"."supply_type" AS ENUM('taxable', 'nil', 'exempt', 'nonGst');--> statement-breakpoint
-- contract: a uniqueness guard only, which no code reads; a forward-charge and a reverse-charge row now share a category (Phase 3).
DROP INDEX "document_tax_lines_document_id_tax_category_id_idx";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "return_frequency" "return_frequency" DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_lines" ADD COLUMN "supply_type" "supply_type" DEFAULT 'taxable' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_lines" ADD COLUMN "reimbursement" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_lines" ADD COLUMN "capital_goods" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_lines" ADD COLUMN "itc_eligibility" "itc_eligibility" DEFAULT 'eligible' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_lines" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_lines" ADD COLUMN "cess_rate" numeric(6, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_tax_lines" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "party_gstin" varchar(15);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "party_state_code" varchar(2);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reverse_charge_tax_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reimbursements_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "place_of_supply_state_code" varchar(2);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "supplier_gstin" varchar(15);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "itc_eligibility" "itc_eligibility" DEFAULT 'eligible' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "supply_type" "supply_type" DEFAULT 'taxable' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "reimbursement" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "capital_goods" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "itc_eligibility" "itc_eligibility" DEFAULT 'eligible' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "cess_rate" numeric(6, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "pan" varchar(10);--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "msme_type" "msme_type";--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "udyam_number" varchar(19);--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "document_tax_lines_document_id_idx" ON "document_tax_lines" USING btree ("document_id");