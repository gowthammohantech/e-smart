-- A sales return records goods only (quantities, their condition, where they went): its money and GST go
-- through the credit note made from it. Returns already in the books keep their own value and GST.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "stock_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "return_reason" varchar(20);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "return_document_id" varchar(40);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_return_document_id_fkey" FOREIGN KEY ("return_document_id") REFERENCES "public"."documents"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_return_document_id_idx" ON "documents" USING btree ("return_document_id");--> statement-breakpoint
ALTER TABLE "document_lines" ADD COLUMN IF NOT EXISTS "stock_condition" varchar(10);
