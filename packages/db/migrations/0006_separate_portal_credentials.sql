CREATE TYPE "public"."compliance_portal" AS ENUM('einvoice', 'ewaybill');--> statement-breakpoint
ALTER TABLE "compliance_credentials" ADD COLUMN "portal" "compliance_portal" DEFAULT 'einvoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "compliance_credentials" DROP CONSTRAINT "compliance_credentials_pkey";--> statement-breakpoint
ALTER TABLE "compliance_credentials" ADD CONSTRAINT "compliance_credentials_pkey" PRIMARY KEY("company_id","portal");--> statement-breakpoint
ALTER TABLE "compliance_settings" ADD COLUMN "ewb_username" varchar(100);--> statement-breakpoint
-- Until now one login served both portals. Keep that working: every stored login becomes the e-way bill's too,
-- and can then be changed on its own.
INSERT INTO "compliance_credentials" ("company_id", "portal", "environment", "gsp_provider", "client_id_encrypted", "client_secret_encrypted", "password_encrypted", "kms_key_id", "updated_at")
SELECT "company_id", 'ewaybill', "environment", "gsp_provider", "client_id_encrypted", "client_secret_encrypted", "password_encrypted", "kms_key_id", "updated_at"
FROM "compliance_credentials" WHERE "portal" = 'einvoice';--> statement-breakpoint
UPDATE "compliance_settings" SET "ewb_username" = "irp_username" WHERE "irp_username" IS NOT NULL;
