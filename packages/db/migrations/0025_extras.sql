CREATE TABLE "cost_centres" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"name" varchar(200) NOT NULL,
	"category" varchar(60),
	"parent_id" varchar(40),
	"status" "active_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_lines" ADD COLUMN "expense_id" varchar(40);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "cost_centre_id" varchar(40);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "customer_id" varchar(40);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "cost_centre_id" varchar(40);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "advance_tax_category_id" varchar(40);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "advance_tax_rate" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "advance_place_of_supply" varchar(2);--> statement-breakpoint
ALTER TABLE "cost_centres" ADD CONSTRAINT "cost_centres_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centres_company_id_name_idx" ON "cost_centres" USING btree ("company_id","name");