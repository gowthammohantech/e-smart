ALTER TYPE "public"."numbering_kind" ADD VALUE 'receipt';--> statement-breakpoint
ALTER TYPE "public"."voucher_kind" ADD VALUE 'receipt';--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "challan" jsonb;