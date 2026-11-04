CREATE TYPE "public"."compliance_attempt_status" AS ENUM('pending', 'settled', 'failed');--> statement-breakpoint
CREATE TABLE "compliance_attempts" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"document_id" varchar(40) NOT NULL,
	"operation" varchar(30) NOT NULL,
	"status" "compliance_attempt_status" DEFAULT 'pending' NOT NULL,
	"request" jsonb NOT NULL,
	"actor_id" varchar(40) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "compliance_attempts" ADD CONSTRAINT "compliance_attempts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_attempts" ADD CONSTRAINT "compliance_attempts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compliance_attempts_pending_idx" ON "compliance_attempts" USING btree ("status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_attempts_open_idx" ON "compliance_attempts" USING btree ("document_id","operation") WHERE "compliance_attempts"."status" = 'pending';