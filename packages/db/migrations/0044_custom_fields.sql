CREATE TYPE "public"."custom_field_entity" AS ENUM('party', 'item', 'document');--> statement-breakpoint
CREATE TYPE "public"."custom_field_kind" AS ENUM('text', 'number', 'date', 'select', 'checkbox');--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"entity" "custom_field_entity" NOT NULL,
	"label" varchar(60) NOT NULL,
	"kind" "custom_field_kind" NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"show_on_pdf" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"status" "active_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_fields_company_id_entity_label_idx" ON "custom_fields" USING btree ("company_id","entity","label");