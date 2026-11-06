CREATE TABLE "credit_applications" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"company_id" varchar(40) NOT NULL,
	"note_id" varchar(40) NOT NULL,
	"document_id" varchar(40) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"date" date NOT NULL,
	"created_by" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_lines" ADD COLUMN "cost_centre_id" varchar(40);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "advance_hsn" varchar(8);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "advance_cess_rate" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tds_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "party_id" varchar(40);--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_applications_note_id_document_id_idx" ON "credit_applications" USING btree ("note_id","document_id");--> statement-breakpoint
CREATE INDEX "credit_applications_document_id_idx" ON "credit_applications" USING btree ("document_id");--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;