-- A lower deduction certificate (s.197) is issued for one section, from a date, up to an amount:
-- beyond any of them the normal rate applies (money audit B19).
ALTER TABLE "parties" ADD COLUMN "lower_tds_section" varchar(8);--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "lower_tds_valid_from" date;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "lower_tds_limit_minor" bigint;
