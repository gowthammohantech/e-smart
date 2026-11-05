CREATE TYPE "public"."bank_line_status" AS ENUM('unmatched', 'matched', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."bank_match_type" AS ENUM('payment', 'expense', 'voucher');--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"statement_id" varchar(40) NOT NULL,
	"account_id" varchar(40) NOT NULL,
	"position" integer NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"reference" varchar(100),
	"amount_minor" bigint NOT NULL,
	"balance_minor" bigint,
	"status" "bank_line_status" DEFAULT 'unmatched' NOT NULL,
	"match_type" "bank_match_type",
	"match_id" varchar(40),
	"excluded_reason" text,
	"line_key" varchar(200) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statements" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"account_id" varchar(40) NOT NULL,
	"file_name" varchar(200) NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"opening_balance_minor" bigint,
	"closing_balance_minor" bigint,
	"line_count" integer NOT NULL,
	"created_by" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."payment_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."payment_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_lines_account_id_line_key_idx" ON "bank_statement_lines" USING btree ("account_id","line_key");--> statement-breakpoint
CREATE INDEX "bank_statement_lines_company_id_account_id_status_date_idx" ON "bank_statement_lines" USING btree ("company_id","account_id","status","date");--> statement-breakpoint
CREATE INDEX "bank_statement_lines_statement_id_idx" ON "bank_statement_lines" USING btree ("statement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_lines_match_idx" ON "bank_statement_lines" USING btree ("company_id","match_type","match_id") WHERE "bank_statement_lines"."match_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bank_statements_account_id_to_date_idx" ON "bank_statements" USING btree ("account_id","to_date");