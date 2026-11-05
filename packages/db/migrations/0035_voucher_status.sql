CREATE TYPE "public"."voucher_status" AS ENUM('draft', 'posted');--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "status" "voucher_status" DEFAULT 'posted' NOT NULL;--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "posted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "posted_by" varchar(40);