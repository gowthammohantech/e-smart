ALTER TABLE "payment_accounts" ADD COLUMN "account_holder_name" varchar(100);--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN "bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN "branch_name" varchar(100);--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN "ifsc" varchar(11);--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN "upi_id" varchar(100);--> statement-breakpoint
-- Not linked yet, but the same account number as one of the business's bank accounts: that is the
-- account its invoices print.
UPDATE "companies" c SET "bank_payment_account_id" = (
  SELECT pa."id" FROM "payment_accounts" pa
  WHERE pa."company_id" = c."id" AND pa."type" = 'bank' AND replace(pa."account_number", ' ', '') = c."bank_account_number"
  ORDER BY pa."is_default" DESC, pa."created_at" LIMIT 1
)
WHERE c."bank_payment_account_id" IS NULL AND c."bank_account_number" IS NOT NULL;--> statement-breakpoint
-- The linked account takes the details typed in the business profile (the number too: it is what
-- the invoices print), and from now on the profile copies the account.
UPDATE "payment_accounts" pa SET
  "account_number" = COALESCE(c."bank_account_number", pa."account_number"),
  "account_holder_name" = c."bank_account_name",
  "bank_name" = c."bank_name",
  "branch_name" = c."bank_branch",
  "ifsc" = c."bank_ifsc",
  "upi_id" = c."upi_id",
  "version" = pa."version" + 1,
  "updated_at" = now()
FROM "companies" c
WHERE c."bank_payment_account_id" = pa."id" AND pa."company_id" = c."id";
