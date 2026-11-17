-- A business's own names for other charges (Courier charges, Labour charges), beside the built-in
-- freight, packing, insurance, handling and loading. Each business sees only its own names; an invoice
-- keeps the name it printed (charges_label), so renaming or hiding one later doesn't change it.
CREATE TABLE "charge_names" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"name" varchar(60) NOT NULL,
	"status" "active_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "charges_label" varchar(60);--> statement-breakpoint
ALTER TABLE "charge_names" ADD CONSTRAINT "charge_names_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "charge_names_company_id_name_idx" ON "charge_names" USING btree ("company_id",lower("name"));--> statement-breakpoint
-- Row-level security, as every company table has it (0061, docs/database/rls.md).
ALTER TABLE "charge_names" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "charge_names" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "charge_names" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));
