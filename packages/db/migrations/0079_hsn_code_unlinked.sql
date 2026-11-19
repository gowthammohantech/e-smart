-- An item's or tax rate's HSN/SAC code is any valid code on its own, no longer tied to the shared
-- hsn_codes search list: a code typed on an item had to be added there first ("Added from catalog"),
-- which put one business's codes in every business's search.
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_hsn_code_fkey";
--> statement-breakpoint
ALTER TABLE "tax_categories" DROP CONSTRAINT IF EXISTS "tax_categories_hsn_code_fkey";
--> statement-breakpoint
-- The placeholder rows those codes added: the search list keeps only the reference codes.
DELETE FROM "hsn_codes" WHERE "description" = 'Added from catalog';
