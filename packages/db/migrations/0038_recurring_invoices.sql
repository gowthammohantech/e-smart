ALTER TABLE "documents" ADD COLUMN "recurrence" "recurrence_frequency" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "next_recurrence_date" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "recurrence_end_date" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "recurrence_auto_send" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "recurring_parent_id" varchar(40);--> statement-breakpoint
CREATE INDEX "documents_next_recurrence_date_idx" ON "documents" USING btree ("next_recurrence_date");--> statement-breakpoint
CREATE INDEX "documents_recurring_parent_id_date_idx" ON "documents" USING btree ("recurring_parent_id","date");