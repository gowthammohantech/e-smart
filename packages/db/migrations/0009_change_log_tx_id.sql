ALTER TABLE "change_log" ADD COLUMN "tx_id" "xid8" DEFAULT pg_current_xact_id() NOT NULL;--> statement-breakpoint
CREATE INDEX "change_log_tx_id_seq_idx" ON "change_log" USING btree ("tx_id","seq");