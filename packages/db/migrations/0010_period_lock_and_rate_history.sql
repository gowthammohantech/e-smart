CREATE TABLE "tax_category_rates" (
	"tax_category_id" varchar(40) NOT NULL,
	"effective_from" date NOT NULL,
	"rate" numeric(6, 3) NOT NULL,
	CONSTRAINT "tax_category_rates_pkey" PRIMARY KEY("tax_category_id","effective_from")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "locked_through_date" date;--> statement-breakpoint
ALTER TABLE "tax_category_rates" ADD CONSTRAINT "tax_category_rates_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "public"."tax_categories"("id") ON DELETE cascade ON UPDATE no action;