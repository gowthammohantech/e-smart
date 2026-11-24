-- A payment account can be made inactive: kept with its history, but no new money is recorded in it.
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "status" "active_status" DEFAULT 'active' NOT NULL;
