-- Every prefix a document kind's series has had, as typed. A new prefix may repeat one exactly, never
-- differ from one only in case (Gk/Alpha, then GK/ALPHA): GST reads document numbers without case.
CREATE TABLE IF NOT EXISTS "numbering_prefixes" (
	"company_id" varchar(40) NOT NULL,
	"kind" "numbering_kind" NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "numbering_prefixes_pkey" PRIMARY KEY("company_id","kind","prefix")
);
--> statement-breakpoint
ALTER TABLE "numbering_prefixes" ADD CONSTRAINT "numbering_prefixes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Each series starts its history with the prefix it has now.
INSERT INTO "numbering_prefixes" ("company_id", "kind", "prefix") SELECT "company_id", "kind", "prefix" FROM "numbering_series" ON CONFLICT DO NOTHING;--> statement-breakpoint
-- The same number in another case is the same number.
CREATE UNIQUE INDEX IF NOT EXISTS "documents_company_id_kind_number_ci_key" ON "documents" USING btree ("company_id","kind",lower("number")) WHERE "documents"."number" NOT LIKE '%-DRAFT';--> statement-breakpoint
-- Row-level security, as every company table has it (0061, docs/database/rls.md).
ALTER TABLE "numbering_prefixes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "numbering_prefixes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "numbering_prefixes" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));
