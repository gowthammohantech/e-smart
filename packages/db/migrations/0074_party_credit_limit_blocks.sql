-- A customer's credit limit either warns (an invoice over it is issued once someone says yes) or blocks
-- (an invoice over it is refused until they pay or the limit is raised). Every customer starts on warn.
ALTER TABLE "parties" ADD COLUMN "credit_limit_blocks" boolean DEFAULT false NOT NULL;
