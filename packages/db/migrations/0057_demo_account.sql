ALTER TABLE "accounts" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "demo_seed_version" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "demo_seeded_at" timestamp with time zone;