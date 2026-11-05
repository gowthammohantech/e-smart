ALTER TABLE "payments" ADD COLUMN "refund_of_payment_id" varchar(40);--> statement-breakpoint
CREATE INDEX "payments_refund_of_payment_id_idx" ON "payments" USING btree ("refund_of_payment_id");