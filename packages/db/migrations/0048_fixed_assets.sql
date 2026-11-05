CREATE TABLE "fixed_assets" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"branch_id" varchar(40),
	"name" varchar(200) NOT NULL,
	"category" varchar(60),
	"account" varchar(80) DEFAULT 'sys:fixedAssets' NOT NULL,
	"asset_code" varchar(60),
	"acquired_on" date NOT NULL,
	"in_use_from" date NOT NULL,
	"cost_minor" bigint NOT NULL,
	"residual_minor" bigint DEFAULT 0 NOT NULL,
	"method" varchar(8) DEFAULT 'slm' NOT NULL,
	"life_months" integer,
	"rate" numeric(7, 4),
	"opening_depreciation_minor" bigint DEFAULT 0 NOT NULL,
	"opening_as_of" date,
	"source_document_id" varchar(40),
	"cost_centre_id" varchar(40),
	"disposed_on" date,
	"disposal_note" text,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixed_assets_method_check" CHECK ("fixed_assets"."method" IN ('slm', 'wdv'))
);
--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fixed_assets_company_id_idx" ON "fixed_assets" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_assets_company_id_asset_code_idx" ON "fixed_assets" USING btree ("company_id","asset_code") WHERE "fixed_assets"."asset_code" IS NOT NULL;