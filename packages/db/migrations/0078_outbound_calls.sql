CREATE TABLE "outbound_calls" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"service" varchar(40) NOT NULL,
	"environment" varchar(12),
	"operation" varchar(120) NOT NULL,
	"method" varchar(10) NOT NULL,
	"host" varchar(255) NOT NULL,
	"path" varchar(500) NOT NULL,
	"url" text NOT NULL,
	"status" smallint,
	"outcome" varchar(20) NOT NULL,
	"duration_ms" integer NOT NULL,
	"error" text,
	"request_headers" jsonb,
	"request_body" text,
	"request_bytes" integer,
	"response_headers" jsonb,
	"response_body" text,
	"response_bytes" integer,
	"truncated" boolean DEFAULT false NOT NULL,
	"source" varchar(12) NOT NULL,
	"route" varchar(300),
	"request_id" varchar(64),
	"job_kind" varchar(80),
	"user_ref" varchar(40),
	"account_ref" varchar(40),
	"company_ref" varchar(40)
);
--> statement-breakpoint
CREATE INDEX "outbound_calls_created_at_idx" ON "outbound_calls" USING btree ("created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "outbound_calls_service_created_at_idx" ON "outbound_calls" USING btree ("service","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "outbound_calls_company_ref_created_at_idx" ON "outbound_calls" USING btree ("company_ref","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "outbound_calls_user_ref_created_at_idx" ON "outbound_calls" USING btree ("user_ref","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "outbound_calls_request_id_idx" ON "outbound_calls" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "outbound_calls_failures_idx" ON "outbound_calls" USING btree ("created_at" DESC NULLS FIRST) WHERE "outbound_calls"."outcome" <> 'ok';