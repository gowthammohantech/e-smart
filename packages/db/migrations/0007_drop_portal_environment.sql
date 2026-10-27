ALTER TABLE "compliance_credentials" DROP COLUMN "environment";--> statement-breakpoint
ALTER TABLE "compliance_settings" DROP COLUMN "irp_environment";--> statement-breakpoint
DROP TYPE "public"."irp_environment";