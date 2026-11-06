CREATE TYPE "public"."gst_return_status" AS ENUM('prepared', 'saved', 'submitted', 'filed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."gst_return_type" AS ENUM('gstr1', 'gstr3b');--> statement-breakpoint
CREATE TABLE "gst_portal_sessions" (
	"company_id" varchar(40) NOT NULL,
	"gstin" varchar(15) NOT NULL,
	"username" varchar(100) NOT NULL,
	"auth_token_encrypted" "bytea",
	"expires_at" timestamp with time zone,
	"refreshable_until" timestamp with time zone,
	"otp_requested_at" timestamp with time zone,
	"connected_by" varchar(40),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gst_portal_sessions_pkey" PRIMARY KEY("company_id","gstin")
);
--> statement-breakpoint
CREATE TABLE "gst_returns" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"gstin" varchar(15) NOT NULL,
	"return_type" "gst_return_type" NOT NULL,
	"period" char(6) NOT NULL,
	"status" "gst_return_status" DEFAULT 'prepared' NOT NULL,
	"payload" jsonb,
	"reference_id" varchar(60),
	"summary_hash" varchar(200),
	"arn" varchar(40),
	"filed_at" timestamp with time zone,
	"last_error" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gst_portal_sessions" ADD CONSTRAINT "gst_portal_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gst_returns" ADD CONSTRAINT "gst_returns_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gst_returns_company_gstin_type_period_idx" ON "gst_returns" USING btree ("company_id","gstin","return_type","period");