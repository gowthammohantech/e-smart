ALTER TABLE "branches" ADD COLUMN "gstin" varchar(15);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "lut_number" varchar(40);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "lut_valid_till" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "round_off_manual_minor" bigint;--> statement-breakpoint
COMMENT ON COLUMN "branches"."gstin" IS 'branch registered under its own GSTIN; printed as the seller';--> statement-breakpoint
COMMENT ON COLUMN "companies"."lut_number" IS 'Letter of Undertaking: exports and SEZ supplies are zero-rated while valid';--> statement-breakpoint
COMMENT ON COLUMN "documents"."round_off_manual_minor" IS 'round-off typed by the user; overrides the automatic one';
