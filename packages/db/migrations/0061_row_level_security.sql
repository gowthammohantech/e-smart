CREATE INDEX "bank_statements_company_id_idx" ON "bank_statements" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "compliance_attempts_company_id_idx" ON "compliance_attempts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "credit_applications_company_id_idx" ON "credit_applications" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "document_tax_components_tax_line_id_idx" ON "document_tax_components" USING btree ("tax_line_id");--> statement-breakpoint
CREATE INDEX "ocr_lines_extraction_id_idx" ON "ocr_lines" USING btree ("extraction_id");--> statement-breakpoint
CREATE INDEX "payment_links_company_id_idx" ON "payment_links" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "share_links_company_id_idx" ON "share_links" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "subscription_events_company_id_idx" ON "subscription_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "user_companies_company_id_idx" ON "user_companies" USING btree ("company_id");--> statement-breakpoint
-- Row-level security for company data (docs/database/rls.md). The request role (esmart_app) sees and
-- writes only rows of the companies the API put in app.company_ids for this request; no setting means
-- no rows. The owner and the system role (esmart_system, BYPASSRLS) are not filtered.
CREATE OR REPLACE FUNCTION app_company_ids() RETURNS text[]
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT coalesce(nullif(current_setting('app.company_ids', true), '')::text[], '{}'::text[]) $$;--> statement-breakpoint
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "companies" FOR ALL USING ("id" = ANY (app_company_ids())) WITH CHECK ("id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "ai_usage" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attachments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "attachments" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "audit_events" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "backup_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "backup_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "backup_settings" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_statement_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "bank_statement_lines" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "bank_statements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_statements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "bank_statements" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "branches" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "brands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brands" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "brands" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budgets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "budgets" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "change_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "change_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "change_log" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "company_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_integrations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "company_integrations" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "compliance_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_attempts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "compliance_attempts" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "compliance_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_credentials" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "compliance_credentials" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "compliance_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "compliance_settings" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "cost_centres" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_centres" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "cost_centres" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "credit_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_applications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "credit_applications" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "custom_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_fields" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "custom_fields" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "documents" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "e_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "e_invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "e_invoices" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "eway_bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eway_bills" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "eway_bills" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "exchange_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exchange_rates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "exchange_rates" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "expense_categories" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "expenses" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "export_jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "export_jobs" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "fixed_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fixed_assets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "fixed_assets" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "gst_portal_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gst_portal_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "gst_portal_sessions" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "gst_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gst_returns" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "gst_returns" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "gstr2b_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gstr2b_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "gstr2b_entries" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "gstr2b_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gstr2b_periods" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "gstr2b_periods" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "item_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "item_categories" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "items" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "ledger_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "ledger_accounts" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "message_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_deliveries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "message_deliveries" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "notifications" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "numbering_series" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "numbering_series" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "numbering_series" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "ocr_extractions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ocr_extractions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "ocr_extractions" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parties" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "parties" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "payment_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "payment_accounts" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "payment_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "payment_links" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "payment_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "payment_requests" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "payments" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "share_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "share_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "share_links" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "stock_movements" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "subscription_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "subscription_events" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "subscriptions" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "transporters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transporters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "transporters" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "user_companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_companies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "user_companies" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "vehicles" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "voucher_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "voucher_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "voucher_templates" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "vouchers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vouchers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "vouchers" FOR ALL USING ("company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" = ANY (app_company_ids()));--> statement-breakpoint
ALTER TABLE "sync_mutations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_mutations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Keyed by user: a mutation outside any business (a profile change) has no company.
CREATE POLICY "tenant" ON "sync_mutations" FOR ALL USING ("company_id" IS NULL OR "company_id" = ANY (app_company_ids())) WITH CHECK ("company_id" IS NULL OR "company_id" = ANY (app_company_ids()));--> statement-breakpoint
-- Rows without a company_id of their own follow their parent, whose policy filters the subquery.
ALTER TABLE "document_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "document_lines" FOR ALL USING (EXISTS (SELECT 1 FROM "documents" p WHERE p."id" = "document_lines"."document_id")) WITH CHECK (EXISTS (SELECT 1 FROM "documents" p WHERE p."id" = "document_lines"."document_id"));--> statement-breakpoint
ALTER TABLE "document_tax_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_tax_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "document_tax_lines" FOR ALL USING (EXISTS (SELECT 1 FROM "documents" p WHERE p."id" = "document_tax_lines"."document_id")) WITH CHECK (EXISTS (SELECT 1 FROM "documents" p WHERE p."id" = "document_tax_lines"."document_id"));--> statement-breakpoint
ALTER TABLE "document_tax_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_tax_components" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "document_tax_components" FOR ALL USING (EXISTS (SELECT 1 FROM "document_tax_lines" p WHERE p."id" = "document_tax_components"."tax_line_id")) WITH CHECK (EXISTS (SELECT 1 FROM "document_tax_lines" p WHERE p."id" = "document_tax_components"."tax_line_id"));--> statement-breakpoint
ALTER TABLE "payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_allocations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "payment_allocations" FOR ALL USING (EXISTS (SELECT 1 FROM "payments" p WHERE p."id" = "payment_allocations"."payment_id")) WITH CHECK (EXISTS (SELECT 1 FROM "payments" p WHERE p."id" = "payment_allocations"."payment_id"));--> statement-breakpoint
ALTER TABLE "reminder_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminder_documents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "reminder_documents" FOR ALL USING (EXISTS (SELECT 1 FROM "message_deliveries" p WHERE p."id" = "reminder_documents"."delivery_id")) WITH CHECK (EXISTS (SELECT 1 FROM "message_deliveries" p WHERE p."id" = "reminder_documents"."delivery_id"));--> statement-breakpoint
ALTER TABLE "eway_bill_part_b_updates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eway_bill_part_b_updates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "eway_bill_part_b_updates" FOR ALL USING (EXISTS (SELECT 1 FROM "eway_bills" p WHERE p."id" = "eway_bill_part_b_updates"."eway_bill_id")) WITH CHECK (EXISTS (SELECT 1 FROM "eway_bills" p WHERE p."id" = "eway_bill_part_b_updates"."eway_bill_id"));--> statement-breakpoint
ALTER TABLE "eway_bill_extensions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eway_bill_extensions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "eway_bill_extensions" FOR ALL USING (EXISTS (SELECT 1 FROM "eway_bills" p WHERE p."id" = "eway_bill_extensions"."eway_bill_id")) WITH CHECK (EXISTS (SELECT 1 FROM "eway_bills" p WHERE p."id" = "eway_bill_extensions"."eway_bill_id"));--> statement-breakpoint
ALTER TABLE "ocr_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ocr_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "ocr_lines" FOR ALL USING (EXISTS (SELECT 1 FROM "ocr_extractions" p WHERE p."id" = "ocr_lines"."extraction_id")) WITH CHECK (EXISTS (SELECT 1 FROM "ocr_extractions" p WHERE p."id" = "ocr_lines"."extraction_id"));--> statement-breakpoint
ALTER TABLE "ocr_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ocr_fields" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "ocr_fields" FOR ALL USING (EXISTS (SELECT 1 FROM "ocr_extractions" p WHERE p."id" = "ocr_fields"."extraction_id")) WITH CHECK (EXISTS (SELECT 1 FROM "ocr_extractions" p WHERE p."id" = "ocr_fields"."extraction_id"));--> statement-breakpoint
ALTER TABLE "tax_category_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_category_rates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "tax_category_rates" FOR ALL USING (EXISTS (SELECT 1 FROM "tax_categories" p WHERE p."id" = "tax_category_rates"."tax_category_id")) WITH CHECK (EXISTS (SELECT 1 FROM "tax_categories" p WHERE p."id" = "tax_category_rates"."tax_category_id"));--> statement-breakpoint
ALTER TABLE "user_branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_branches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant" ON "user_branches" FOR ALL USING (EXISTS (SELECT 1 FROM "branches" p WHERE p."id" = "user_branches"."branch_id")) WITH CHECK (EXISTS (SELECT 1 FROM "branches" p WHERE p."id" = "user_branches"."branch_id"));
