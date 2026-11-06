ALTER TYPE "public"."numbering_kind" ADD VALUE 'gstChallan';--> statement-breakpoint
ALTER TYPE "public"."voucher_kind" ADD VALUE 'gstChallan';--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "gst_challan" jsonb;--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "gstin" varchar(15);--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "gst_period" varchar(6);--> statement-breakpoint
CREATE INDEX "vouchers_company_id_gstin_gst_period_idx" ON "vouchers" USING btree ("company_id","gstin","gst_period");