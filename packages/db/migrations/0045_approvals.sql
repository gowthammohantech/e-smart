ALTER TABLE "companies" ADD COLUMN "approval_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "approval" jsonb;