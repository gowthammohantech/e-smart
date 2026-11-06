ALTER TABLE "documents" ADD COLUMN "overdue_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "push_muted" jsonb DEFAULT '[]'::jsonb NOT NULL;