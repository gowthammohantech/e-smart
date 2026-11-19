-- An advance receipt names the service it is for.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "advance_item_id" varchar(40);
