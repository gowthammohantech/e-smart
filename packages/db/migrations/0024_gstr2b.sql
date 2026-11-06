CREATE TYPE "public"."gstr2b_decision" AS ENUM('accepted', 'notOurs', 'claimLater');--> statement-breakpoint
CREATE TABLE "gstr2b_entries" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"gstin" varchar(15) NOT NULL,
	"period" char(6) NOT NULL,
	"section" varchar(8) NOT NULL,
	"supplier_gstin" varchar(15) NOT NULL,
	"supplier_name" varchar(200),
	"document_type" varchar(3) NOT NULL,
	"number" varchar(40) NOT NULL,
	"match_key" varchar(40) NOT NULL,
	"date" date NOT NULL,
	"place_of_supply" varchar(2),
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"taxable_minor" bigint NOT NULL,
	"igst_minor" bigint DEFAULT 0 NOT NULL,
	"cgst_minor" bigint DEFAULT 0 NOT NULL,
	"sgst_minor" bigint DEFAULT 0 NOT NULL,
	"cess_minor" bigint DEFAULT 0 NOT NULL,
	"itc_available" boolean DEFAULT true NOT NULL,
	"itc_reason" varchar(40),
	"supplier_filed_on" date,
	"original_number" varchar(40),
	"decision" "gstr2b_decision",
	"linked_document_id" varchar(40),
	"decided_by" varchar(40),
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gstr2b_periods" (
	"company_id" varchar(40) NOT NULL,
	"gstin" varchar(15) NOT NULL,
	"period" char(6) NOT NULL,
	"generated_on" date,
	"fetched_at" timestamp with time zone NOT NULL,
	"fetched_by" varchar(40),
	CONSTRAINT "gstr2b_periods_pkey" PRIMARY KEY("company_id","gstin","period")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "itc_claim_period" char(6);--> statement-breakpoint
ALTER TABLE "gstr2b_entries" ADD CONSTRAINT "gstr2b_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gstr2b_periods" ADD CONSTRAINT "gstr2b_periods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gstr2b_entries_period_idx" ON "gstr2b_entries" USING btree ("company_id","gstin","period");