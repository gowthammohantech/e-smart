CREATE TABLE "brands" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"name" varchar(100) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(9) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "category_id" varchar(40);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "brand_id" varchar(40);--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_company_id_name_idx" ON "brands" USING btree ("company_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "item_categories_company_id_name_idx" ON "item_categories" USING btree ("company_id","name");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_company_id_category_id_idx" ON "items" USING btree ("company_id","category_id");