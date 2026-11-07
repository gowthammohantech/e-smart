ALTER TABLE "companies" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "archived_by" varchar(40);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "purge_after" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "companies_purge_after_idx" ON "companies" USING btree ("purge_after");