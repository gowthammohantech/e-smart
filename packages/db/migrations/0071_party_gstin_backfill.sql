-- Documents issued before party_gstin existed (0019, 3 Nov 2026) never recorded the buyer's GSTIN
-- at issue. GSTR-1 now reads registration from that column only (money audit B22), so
-- fill it, as best we can, from the party as it stands. Documents issued since already carry it.
UPDATE "documents" d
SET "party_gstin" = p."tax_id"
FROM "parties" p
WHERE d."party_id" = p."id"
  AND d."party_gstin" IS NULL
  AND p."tax_id" IS NOT NULL
  AND d."status" NOT IN ('draft', 'requested')
  AND (d."finalized_at" IS NULL OR d."finalized_at" < '2026-11-04');
