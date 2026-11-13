ALTER TABLE "documents" ADD COLUMN "cross_border_tax" varchar(10);--> statement-breakpoint
UPDATE "documents" SET "cross_border_tax" = "sez_tax" WHERE "sez_tax" IS NOT NULL;