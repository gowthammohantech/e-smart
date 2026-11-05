ALTER TABLE "companies" ADD COLUMN "bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "bank_account_name" varchar(100);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "bank_account_number" varchar(34);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "bank_ifsc" varchar(11);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "bank_branch" varchar(100);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "upi_id" varchar(100);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "signature_attachment_id" varchar(40);--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_signature_attachment_id_fkey" FOREIGN KEY ("signature_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;