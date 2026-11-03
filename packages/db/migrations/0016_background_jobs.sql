CREATE TYPE "public"."background_job_status" AS ENUM('queued', 'running', 'done', 'dead');--> statement-breakpoint
CREATE TABLE "job_schedule_runs" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"job_id" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"kind" varchar(60) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "background_job_status" DEFAULT 'queued' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"max_attempts" smallint DEFAULT 5 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"unique_key" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_unique_key_idx" ON "jobs" USING btree ("unique_key") WHERE "jobs"."unique_key" IS NOT NULL AND "jobs"."status" IN ('queued', 'running');