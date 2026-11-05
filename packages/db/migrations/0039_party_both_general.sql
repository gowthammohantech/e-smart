CREATE TYPE "public"."balance_side" AS ENUM('dr', 'cr');--> statement-breakpoint
ALTER TYPE "public"."party_kind" ADD VALUE 'both';--> statement-breakpoint
ALTER TYPE "public"."party_kind" ADD VALUE 'general';--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "opening_balance_side" "balance_side";