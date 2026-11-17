ALTER TABLE "companies" ADD COLUMN "gsp_environment" varchar(12);
--> statement-breakpoint
-- Companies an operator had already put on a gateway keep the environment that gateway always meant: Whitebooks was
-- sandbox-only, Adaequare was production. Companies with no choice stay null and follow the deployment default.
UPDATE "companies" SET "gsp_environment" = CASE WHEN "gsp_provider" = 'whitebooks' THEN 'sandbox' ELSE 'production' END WHERE "gsp_provider" IS NOT NULL;
