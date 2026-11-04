ALTER TABLE "payment_accounts" ADD COLUMN "opening_rate" numeric(18, 8) DEFAULT '1' NOT NULL;--> statement-breakpoint
-- Foreign-currency accounts opened before this: the direct rate to base on or before the opening date
-- (or the inverse rate), as rateToBase finds it. Accounts with no rate on file stay at 1 until saved.
UPDATE "payment_accounts" pa SET "opening_rate" = r.rate
FROM (
	SELECT pa2.id, COALESCE(
		(SELECT er.rate FROM "exchange_rates" er WHERE er.company_id = pa2.company_id AND er.from_currency = pa2.currency AND er.to_currency = c.base_currency AND er.effective_from <= COALESCE(pa2.opening_balance_date, CURRENT_DATE) ORDER BY er.effective_from DESC LIMIT 1),
		(SELECT 1 / er.rate FROM "exchange_rates" er WHERE er.company_id = pa2.company_id AND er.from_currency = c.base_currency AND er.to_currency = pa2.currency AND er.effective_from <= COALESCE(pa2.opening_balance_date, CURRENT_DATE) AND er.rate > 0 ORDER BY er.effective_from DESC LIMIT 1)
	) AS rate
	FROM "payment_accounts" pa2 JOIN "companies" c ON c.id = pa2.company_id
	WHERE pa2.currency <> c.base_currency AND pa2.opening_balance_minor <> 0
) r
WHERE pa.id = r.id AND r.rate IS NOT NULL;
