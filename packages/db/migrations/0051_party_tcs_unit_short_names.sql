ALTER TABLE "parties" ADD COLUMN "tcs_applicable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "tcs_section" varchar(20);--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "short_name" varchar(10);--> statement-breakpoint
UPDATE "units" SET "short_name" = CASE "code" WHEN 'PCS' THEN 'Pcs' WHEN 'BOX' THEN 'Box' WHEN 'KG' THEN 'Kg' WHEN 'LTR' THEN 'Ltr' WHEN 'MTR' THEN 'Mtr' WHEN 'HR' THEN 'Hr' WHEN 'DAY' THEN 'Day' WHEN 'SET' THEN 'Set' WHEN 'NOS' THEN 'Nos' END WHERE "short_name" IS NULL;
