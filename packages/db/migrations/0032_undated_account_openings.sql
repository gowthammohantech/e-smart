-- Cash and bank openings now stand on their "as on" date. Until now the form filled that date with
-- the day the account was added, which was never meant as a books date: clear it where it is just that.
UPDATE "payment_accounts" SET "opening_balance_date" = NULL WHERE "opening_balance_date" = ("created_at" AT TIME ZONE 'Asia/Kolkata')::date OR "opening_balance_date" = "created_at"::date;
