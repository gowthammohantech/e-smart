CREATE TYPE "public"."ai_feature" AS ENUM('lixi', 'ocr');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"company_id" varchar(40) NOT NULL,
	"month" char(7) NOT NULL,
	"feature" "ai_feature" NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_pkey" PRIMARY KEY("company_id","month","feature")
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"body" jsonb NOT NULL,
	"party_id" varchar(40) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"amount_base_minor" bigint NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"requested_by" varchar(40) NOT NULL,
	"decided_by" varchar(40),
	"decided_at" timestamp with time zone,
	"note" text,
	"payment_id" varchar(40),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"registration" varchar(20) NOT NULL,
	"name" varchar(100),
	"status" "active_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher_templates" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"name" varchar(100) NOT NULL,
	"kind" "voucher_kind" NOT NULL,
	"narration" text,
	"lines" jsonb NOT NULL,
	"created_by" varchar(40) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "invoice_template" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "ai_monthly_limit" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tcs_section" varchar(20);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tcs_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "vehicle_id" varchar(40);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "vehicle_id" varchar(40);--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_templates" ADD CONSTRAINT "voucher_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_requests_company_id_status_idx" ON "payment_requests" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_company_id_registration_idx" ON "vehicles" USING btree ("company_id","registration");--> statement-breakpoint
CREATE UNIQUE INDEX "voucher_templates_company_id_name_idx" ON "voucher_templates" USING btree ("company_id","name");