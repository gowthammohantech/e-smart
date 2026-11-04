CREATE TYPE "public"."ledger_group" AS ENUM('capital', 'reserves', 'loans', 'sundryCreditors', 'dutiesTaxes', 'provisions', 'currentLiabilities', 'fixedAssets', 'investments', 'sundryDebtors', 'cashInHand', 'bankAccounts', 'stockInHand', 'loansAdvances', 'currentAssets', 'salesAccounts', 'directIncomes', 'indirectIncomes', 'purchaseAccounts', 'directExpenses', 'indirectExpenses');--> statement-breakpoint
CREATE TYPE "public"."voucher_kind" AS ENUM('journal', 'contra', 'gstJournal', 'tdsChallan');--> statement-breakpoint
ALTER TYPE "public"."numbering_kind" ADD VALUE 'journal';--> statement-breakpoint
ALTER TYPE "public"."numbering_kind" ADD VALUE 'contra';--> statement-breakpoint
ALTER TYPE "public"."numbering_kind" ADD VALUE 'gstJournal';--> statement-breakpoint
ALTER TYPE "public"."numbering_kind" ADD VALUE 'tdsChallan';--> statement-breakpoint
ALTER TYPE "public"."plan_module" ADD VALUE 'books';--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"name" varchar(200) NOT NULL,
	"group" "ledger_group" NOT NULL,
	"opening_balance_minor" bigint DEFAULT 0 NOT NULL,
	"status" "active_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"branch_id" varchar(40) NOT NULL,
	"kind" "voucher_kind" NOT NULL,
	"number" varchar(40) NOT NULL,
	"date" date NOT NULL,
	"narration" text,
	"reference" varchar(100),
	"lines" jsonb NOT NULL,
	"created_by" varchar(40) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_company_id_name_idx" ON "ledger_accounts" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "vouchers_company_id_date_idx" ON "vouchers" USING btree ("company_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_company_id_kind_number_idx" ON "vouchers" USING btree ("company_id","kind","number");