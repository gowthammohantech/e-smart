-- A tax rate can end on a day (effective_to) and be made inactive: either way it is no longer charged.
ALTER TABLE "tax_categories" ADD COLUMN IF NOT EXISTS "effective_to" date;--> statement-breakpoint
ALTER TABLE "tax_categories" ADD COLUMN IF NOT EXISTS "status" "active_status" DEFAULT 'active' NOT NULL;
