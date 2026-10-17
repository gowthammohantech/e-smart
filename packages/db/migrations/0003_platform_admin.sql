CREATE TYPE "public"."platform_role" AS ENUM('superadmin', 'support');--> statement-breakpoint
CREATE TABLE "platform_audit_events" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"actor_id" varchar(40) NOT NULL,
	"actor_email" varchar(254) NOT NULL,
	"action" varchar(60) NOT NULL,
	"target_type" varchar(30) NOT NULL,
	"target_id" varchar(40) NOT NULL,
	"target_label" varchar(200) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "suspended_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "suspended_by" varchar(40);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_role" "platform_role";--> statement-breakpoint
ALTER TABLE "platform_audit_events" ADD CONSTRAINT "platform_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_audit_events_created_at_idx" ON "platform_audit_events" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "platform_audit_events_target_type_target_id_idx" ON "platform_audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "platform_audit_events_actor_id_idx" ON "platform_audit_events" USING btree ("actor_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_suspended_by_fkey" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;