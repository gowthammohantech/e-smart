CREATE TYPE "plan_tier" AS ENUM (
  'free',
  'basic',
  'pro',
  'business'
);

CREATE TYPE "plan_module" AS ENUM (
  'purchases',
  'inventory',
  'expenses',
  'ocr',
  'fx',
  'branches',
  'payables'
);

CREATE TYPE "user_role" AS ENUM (
  'owner',
  'admin',
  'accountant',
  'sales',
  'viewer'
);

CREATE TYPE "user_status" AS ENUM (
  'active',
  'invited',
  'disabled'
);

CREATE TYPE "active_status" AS ENUM (
  'active',
  'inactive'
);

CREATE TYPE "tax_regime" AS ENUM (
  'GST',
  'VAT',
  'NONE'
);

CREATE TYPE "party_kind" AS ENUM (
  'customer',
  'supplier'
);

CREATE TYPE "gst_registration_type" AS ENUM (
  'regular',
  'composition',
  'unregistered',
  'sez',
  'overseas'
);

CREATE TYPE "item_type" AS ENUM (
  'goods',
  'service'
);

CREATE TYPE "tax_type" AS ENUM (
  'GST',
  'CGST',
  'SGST',
  'IGST',
  'VAT',
  'CESS',
  'NONE'
);

CREATE TYPE "rate_source" AS ENUM (
  'manual',
  'provider'
);

CREATE TYPE "discount_mode" AS ENUM (
  'percent',
  'amount'
);

CREATE TYPE "document_kind" AS ENUM (
  'quote',
  'salesOrder',
  'delivery',
  'invoice',
  'salesReturn',
  'purchaseOrder',
  'goodsReceipt',
  'purchaseBill',
  'purchaseReturn'
);

CREATE TYPE "doc_status" AS ENUM (
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'confirmed',
  'fulfilled',
  'cancelled',
  'delivered',
  'issued',
  'partiallyPaid',
  'paid',
  'overdue',
  'requested',
  'approved',
  'processed',
  'received',
  'billed'
);

CREATE TYPE "numbering_kind" AS ENUM (
  'quote',
  'salesOrder',
  'delivery',
  'invoice',
  'salesReturn',
  'purchaseOrder',
  'goodsReceipt',
  'purchaseBill',
  'purchaseReturn',
  'payment',
  'expense'
);

CREATE TYPE "reset_policy" AS ENUM (
  'never',
  'yearly',
  'monthly'
);

CREATE TYPE "einvoice_status" AS ENUM (
  'notApplicable',
  'pending',
  'generated',
  'cancelled',
  'failed'
);

CREATE TYPE "einvoice_doc_type" AS ENUM (
  'INV',
  'CRN',
  'DBN'
);

CREATE TYPE "einvoice_supply_type" AS ENUM (
  'B2B',
  'SEZWP',
  'SEZWOP',
  'EXPWP',
  'EXPWOP',
  'DEXP'
);

CREATE TYPE "cancel_reason_code" AS ENUM (
  '1',
  '2',
  '3',
  '4'
);

CREATE TYPE "irp_environment" AS ENUM (
  'sandbox',
  'production'
);

CREATE TYPE "transport_mode" AS ENUM (
  'road',
  'rail',
  'air',
  'ship'
);

CREATE TYPE "vehicle_type" AS ENUM (
  'regular',
  'overDimensional'
);

CREATE TYPE "eway_supply_type" AS ENUM (
  'outward',
  'inward'
);

CREATE TYPE "eway_sub_supply_type" AS ENUM (
  'supply',
  'export',
  'jobWork',
  'ownUse',
  'jobWorkReturn',
  'salesReturn',
  'exhibition',
  'lineSales',
  'recipientNotKnown',
  'others'
);

CREATE TYPE "eway_doc_type" AS ENUM (
  'INV',
  'BIL',
  'BOE',
  'CHL',
  'CNT',
  'OTH'
);

CREATE TYPE "eway_stored_status" AS ENUM (
  'active',
  'cancelled'
);

CREATE TYPE "eway_extend_reason" AS ENUM (
  '1',
  '2',
  '3',
  '4',
  '5'
);

CREATE TYPE "eway_part_b_reason" AS ENUM (
  '1',
  '2',
  '3',
  '4'
);

CREATE TYPE "eway_transit_type" AS ENUM (
  'inTransit',
  'inMovement'
);

CREATE TYPE "payment_direction" AS ENUM (
  'received',
  'paid'
);

CREATE TYPE "payment_method" AS ENUM (
  'cash',
  'bank',
  'upi',
  'card',
  'cheque',
  'wallet',
  'other'
);

CREATE TYPE "payment_account_type" AS ENUM (
  'cash',
  'bank',
  'wallet'
);

CREATE TYPE "recurrence_frequency" AS ENUM (
  'none',
  'weekly',
  'monthly',
  'quarterly',
  'yearly'
);

CREATE TYPE "stock_movement_type" AS ENUM (
  'opening',
  'purchaseReceipt',
  'salesIssue',
  'salesReturn',
  'purchaseReturn',
  'transferIn',
  'transferOut',
  'adjustment'
);

CREATE TYPE "stock_adjust_reason" AS ENUM (
  'damaged',
  'lost',
  'found',
  'recount',
  'expired',
  'other'
);

CREATE TYPE "attachment_status" AS ENUM (
  'pending',
  'ready'
);

CREATE TYPE "ocr_status" AS ENUM (
  'queued',
  'processing',
  'completed',
  'failed'
);

CREATE TYPE "ocr_kind" AS ENUM (
  'expense',
  'purchaseBill'
);

CREATE TYPE "ocr_field_key" AS ENUM (
  'vendor',
  'gstin',
  'date',
  'amount',
  'tax',
  'reference',
  'category'
);

CREATE TYPE "notification_kind" AS ENUM (
  'invoiceSent',
  'paymentReceived',
  'invoiceOverdue',
  'lowStock',
  'compliance',
  'syncFailure',
  'system'
);

CREATE TYPE "integration_category" AS ENUM (
  'payments',
  'compliance',
  'messaging',
  'accounting',
  'storage'
);

CREATE TYPE "export_format" AS ENUM (
  'json-backup',
  'csv-zip',
  'tally-xml'
);

CREATE TYPE "job_status" AS ENUM (
  'queued',
  'running',
  'completed',
  'failed'
);

CREATE TYPE "backup_frequency" AS ENUM (
  'daily',
  'weekly'
);

CREATE TYPE "backup_destination" AS ENUM (
  'elixir-cloud',
  'google-drive'
);

CREATE TYPE "billing_cycle" AS ENUM (
  'monthly',
  'yearly'
);

CREATE TYPE "subscription_status" AS ENUM (
  'active',
  'trialing',
  'pastDue',
  'cancelled',
  'none'
);

CREATE TYPE "billing_provider" AS ENUM (
  'razorpay',
  'appStore',
  'playStore'
);

CREATE TYPE "otp_channel" AS ENUM (
  'sms',
  'whatsapp'
);

CREATE TYPE "message_channel" AS ENUM (
  'whatsapp',
  'sms',
  'email'
);

CREATE TYPE "delivery_status" AS ENUM (
  'queued',
  'sent',
  'delivered',
  'read',
  'failed'
);

CREATE TYPE "push_provider" AS ENUM (
  'expo',
  'fcm',
  'apns'
);

CREATE TYPE "link_status" AS ENUM (
  'active',
  'paid',
  'expired',
  'cancelled'
);

CREATE TYPE "http_method" AS ENUM (
  'POST',
  'PUT',
  'PATCH',
  'DELETE'
);

CREATE TYPE "sync_status" AS ENUM (
  'applied',
  'conflict',
  'rejected'
);

CREATE TYPE "webhook_source" AS ENUM (
  'razorpay',
  'whatsapp'
);

CREATE TABLE "accounts" (
  "id" varchar(40) PRIMARY KEY,
  "name" varchar(200) NOT NULL,
  "owner_user_id" varchar(40),
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "companies" (
  "id" varchar(40) PRIMARY KEY,
  "account_id" varchar(40) NOT NULL,
  "name" varchar(200) NOT NULL,
  "legal_name" varchar(200),
  "logo_attachment_id" varchar(40),
  "business_type" varchar(40) NOT NULL,
  "country" char(2) NOT NULL,
  "base_currency" char(3) NOT NULL,
  "address_line1" varchar(200) NOT NULL,
  "address_line2" varchar(200),
  "address_city" varchar(100) NOT NULL,
  "address_state" varchar(100) NOT NULL,
  "address_state_code" varchar(2),
  "address_postal_code" varchar(12) NOT NULL,
  "address_country" char(2) NOT NULL,
  "email" varchar(254),
  "phone" varchar(20),
  "website" varchar(200),
  "tax_regime" tax_regime NOT NULL DEFAULT 'NONE',
  "tax_identifier" varchar(20),
  "tax_identifier_label" varchar(20) NOT NULL DEFAULT 'GSTIN',
  "tax_registered" boolean NOT NULL DEFAULT false,
  "composition_scheme" boolean NOT NULL DEFAULT false,
  "place_of_supply_state_code" varchar(2),
  "fiscal_year_start_month" smallint NOT NULL DEFAULT 4,
  "plan" plan_tier NOT NULL DEFAULT 'free',
  "onboarding_completed_at" timestamptz,
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "branches" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "name" varchar(200) NOT NULL,
  "code" varchar(6) NOT NULL,
  "address_line1" varchar(200) NOT NULL,
  "address_line2" varchar(200),
  "address_city" varchar(100) NOT NULL,
  "address_state" varchar(100) NOT NULL,
  "address_state_code" varchar(2),
  "address_postal_code" varchar(12) NOT NULL,
  "address_country" char(2) NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "phone" varchar(20),
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "users" (
  "id" varchar(40) PRIMARY KEY,
  "account_id" varchar(40) NOT NULL,
  "name" varchar(200) NOT NULL,
  "email" varchar(254) UNIQUE NOT NULL,
  "phone" varchar(20) UNIQUE,
  "password_hash" varchar(255),
  "role" user_role NOT NULL DEFAULT 'viewer',
  "avatar_color" varchar(9) NOT NULL,
  "status" user_status NOT NULL DEFAULT 'invited',
  "locale" varchar(10) DEFAULT 'en',
  "default_company_id" varchar(40),
  "email_verified_at" timestamptz,
  "phone_verified_at" timestamptz,
  "last_active_at" timestamptz,
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "user_companies" (
  "user_id" varchar(40) NOT NULL,
  "company_id" varchar(40) NOT NULL,
  PRIMARY KEY ("user_id", "company_id")
);

CREATE TABLE "user_branches" (
  "user_id" varchar(40) NOT NULL,
  "branch_id" varchar(40) NOT NULL,
  PRIMARY KEY ("user_id", "branch_id")
);

CREATE TABLE "invites" (
  "id" varchar(40) PRIMARY KEY,
  "user_id" varchar(40) NOT NULL,
  "invited_by" varchar(40) NOT NULL,
  "token_hash" varchar(128) UNIQUE NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "accepted_at" timestamptz,
  "last_sent_at" timestamptz NOT NULL DEFAULT (now()),
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "otp_requests" (
  "id" varchar(40) PRIMARY KEY,
  "phone" varchar(20) NOT NULL,
  "channel" otp_channel NOT NULL DEFAULT 'sms',
  "code_hash" varchar(128) NOT NULL,
  "attempts" smallint NOT NULL DEFAULT 0,
  "expires_at" timestamptz NOT NULL,
  "verified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "password_reset_tokens" (
  "id" varchar(40) PRIMARY KEY,
  "user_id" varchar(40) NOT NULL,
  "token_hash" varchar(128) UNIQUE NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "device_sessions" (
  "id" varchar(40) PRIMARY KEY,
  "user_id" varchar(40) NOT NULL,
  "label" varchar(100) NOT NULL,
  "platform" varchar(40) NOT NULL,
  "app_version" varchar(20),
  "location" varchar(100),
  "ip_address" inet,
  "refresh_token_hash" varchar(128) UNIQUE NOT NULL,
  "refresh_expires_at" timestamptz NOT NULL,
  "last_active_at" timestamptz NOT NULL DEFAULT (now()),
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "push_tokens" (
  "token" varchar(255) PRIMARY KEY,
  "user_id" varchar(40) NOT NULL,
  "device_session_id" varchar(40),
  "provider" push_provider NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "last_used_at" timestamptz
);

CREATE TABLE "plans" (
  "key" plan_tier PRIMARY KEY,
  "name" varchar(40) NOT NULL,
  "monthly_price_minor" bigint NOT NULL,
  "yearly_price_minor" bigint NOT NULL,
  "currency" char(3) NOT NULL DEFAULT 'INR',
  "features" jsonb NOT NULL,
  "popular" boolean NOT NULL DEFAULT false,
  "sort_order" smallint NOT NULL
);

CREATE TABLE "plan_modules" (
  "plan" plan_tier NOT NULL,
  "module" plan_module NOT NULL,
  PRIMARY KEY ("plan", "module")
);

CREATE TABLE "subscriptions" (
  "company_id" varchar(40) PRIMARY KEY,
  "plan" plan_tier NOT NULL,
  "cycle" billing_cycle NOT NULL,
  "status" subscription_status NOT NULL DEFAULT 'none',
  "provider" billing_provider,
  "provider_subscription_id" varchar(100) UNIQUE,
  "provider_customer_id" varchar(100),
  "current_period_start" timestamptz,
  "current_period_end" timestamptz,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "subscription_events" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "from_plan" plan_tier,
  "to_plan" plan_tier,
  "event" varchar(60) NOT NULL,
  "webhook_event_id" varchar(40),
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "tax_categories" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "name" varchar(100) NOT NULL,
  "rate" numeric(6,3) NOT NULL,
  "type" tax_type NOT NULL,
  "hsn_code" varchar(8),
  "effective_from" date NOT NULL,
  "description" text,
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "expense_categories" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "name" varchar(100) NOT NULL,
  "icon" varchar(40) NOT NULL,
  "color" varchar(9) NOT NULL,
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "payment_accounts" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "name" varchar(100) NOT NULL,
  "type" payment_account_type NOT NULL,
  "currency" char(3) NOT NULL,
  "account_number" varchar(40),
  "opening_balance_minor" bigint NOT NULL DEFAULT 0,
  "is_default" boolean NOT NULL DEFAULT false,
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "exchange_rates" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "from_currency" char(3) NOT NULL,
  "to_currency" char(3) NOT NULL,
  "rate" numeric(18,8) NOT NULL,
  "effective_from" date NOT NULL,
  "source" rate_source NOT NULL DEFAULT 'manual',
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "transporters" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "name" varchar(200) NOT NULL,
  "transporter_id" varchar(15) NOT NULL,
  "phone" varchar(20),
  "status" active_status NOT NULL DEFAULT 'active',
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "numbering_series" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "kind" numbering_kind NOT NULL,
  "prefix" varchar(20) NOT NULL,
  "next_number" int NOT NULL DEFAULT 1,
  "padding" smallint NOT NULL DEFAULT 4,
  "include_fiscal_year" boolean NOT NULL DEFAULT false,
  "include_branch_code" boolean NOT NULL DEFAULT false,
  "reset_policy" reset_policy NOT NULL DEFAULT 'never',
  "last_reset_at" date,
  "version" int NOT NULL DEFAULT 1,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "compliance_settings" (
  "company_id" varchar(40) PRIMARY KEY,
  "einvoice_enabled" boolean NOT NULL DEFAULT false,
  "annual_turnover_minor" bigint NOT NULL DEFAULT 0,
  "einvoice_turnover_threshold_minor" bigint NOT NULL,
  "currency" char(3) NOT NULL DEFAULT 'INR',
  "reporting_window_days" smallint NOT NULL DEFAULT 30,
  "auto_generate_einvoice_on_finalise" boolean NOT NULL DEFAULT false,
  "irp_username" varchar(100),
  "irp_client_id_masked" varchar(40),
  "irp_environment" irp_environment NOT NULL DEFAULT 'sandbox',
  "eway_bill_enabled" boolean NOT NULL DEFAULT false,
  "eway_bill_threshold_minor" bigint NOT NULL DEFAULT 5000000,
  "auto_generate_eway_bill_on_finalise" boolean NOT NULL DEFAULT false,
  "default_transporter_id" varchar(40),
  "default_distance_km" int NOT NULL DEFAULT 0,
  "default_transport_mode" transport_mode NOT NULL DEFAULT 'road',
  "default_vehicle_type" vehicle_type NOT NULL DEFAULT 'regular',
  "version" int NOT NULL DEFAULT 1,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "compliance_credentials" (
  "company_id" varchar(40) PRIMARY KEY,
  "environment" irp_environment NOT NULL,
  "gsp_provider" varchar(40),
  "client_id_encrypted" bytea NOT NULL,
  "client_secret_encrypted" bytea NOT NULL,
  "password_encrypted" bytea NOT NULL,
  "kms_key_id" varchar(200) NOT NULL,
  "auth_token_encrypted" bytea,
  "auth_token_expires_at" timestamptz,
  "last_tested_at" timestamptz,
  "last_test_ok" boolean,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "backup_settings" (
  "company_id" varchar(40) PRIMARY KEY,
  "automatic" boolean NOT NULL DEFAULT false,
  "frequency" backup_frequency NOT NULL DEFAULT 'daily',
  "destination" backup_destination NOT NULL DEFAULT 'elixir-cloud',
  "last_backup_at" timestamptz,
  "version" int NOT NULL DEFAULT 1,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "parties" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "kind" party_kind NOT NULL,
  "name" varchar(200) NOT NULL,
  "code" varchar(20) NOT NULL,
  "display_name" varchar(200),
  "tax_id" varchar(20),
  "gst_registration_type" gst_registration_type,
  "email" varchar(254),
  "phone" varchar(20),
  "currency" char(3) NOT NULL,
  "billing_line1" varchar(200) NOT NULL,
  "billing_line2" varchar(200),
  "billing_city" varchar(100) NOT NULL,
  "billing_state" varchar(100) NOT NULL,
  "billing_state_code" varchar(2),
  "billing_postal_code" varchar(12) NOT NULL,
  "billing_country" char(2) NOT NULL,
  "shipping_line1" varchar(200),
  "shipping_line2" varchar(200),
  "shipping_city" varchar(100),
  "shipping_state" varchar(100),
  "shipping_state_code" varchar(2),
  "shipping_postal_code" varchar(12),
  "shipping_country" char(2),
  "credit_limit_minor" bigint,
  "opening_balance_minor" bigint NOT NULL DEFAULT 0,
  "payment_terms_days" smallint NOT NULL DEFAULT 0,
  "notes" text,
  "status" active_status NOT NULL DEFAULT 'active',
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "items" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "sku" varchar(40) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "type" item_type NOT NULL,
  "unit" varchar(10) NOT NULL,
  "currency" char(3) NOT NULL,
  "sale_price_minor" bigint NOT NULL DEFAULT 0,
  "purchase_price_minor" bigint NOT NULL DEFAULT 0,
  "tax_category_id" varchar(40) NOT NULL,
  "hsn_code" varchar(8),
  "barcode" varchar(40),
  "track_inventory" boolean NOT NULL DEFAULT false,
  "opening_stock" numeric(18,3) NOT NULL DEFAULT 0,
  "reorder_level" numeric(18,3) NOT NULL DEFAULT 0,
  "image_attachment_id" varchar(40),
  "status" active_status NOT NULL DEFAULT 'active',
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "documents" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "branch_id" varchar(40) NOT NULL,
  "kind" document_kind NOT NULL,
  "number" varchar(40) NOT NULL,
  "status" doc_status NOT NULL DEFAULT 'draft',
  "party_id" varchar(40) NOT NULL,
  "date" date NOT NULL,
  "due_date" date,
  "valid_until" date,
  "reference" varchar(100),
  "supplier_doc_number" varchar(40),
  "currency" char(3) NOT NULL,
  "exchange_rate" numeric(18,8) NOT NULL DEFAULT 1,
  "document_discount_mode" discount_mode NOT NULL DEFAULT 'amount',
  "document_discount_value" numeric(18,4) NOT NULL DEFAULT 0,
  "charges_minor" bigint NOT NULL DEFAULT 0,
  "apply_round_off" boolean NOT NULL DEFAULT true,
  "place_of_supply_state_code" varchar(2),
  "notes" text,
  "terms" text,
  "source_document_id" varchar(40),
  "subtotal_minor" bigint NOT NULL DEFAULT 0,
  "line_discount_minor" bigint NOT NULL DEFAULT 0,
  "document_discount_minor" bigint NOT NULL DEFAULT 0,
  "taxable_amount_minor" bigint NOT NULL DEFAULT 0,
  "total_tax_minor" bigint NOT NULL DEFAULT 0,
  "round_off_minor" bigint NOT NULL DEFAULT 0,
  "grand_total_minor" bigint NOT NULL DEFAULT 0,
  "grand_total_base_minor" bigint NOT NULL DEFAULT 0,
  "amount_paid_minor" bigint NOT NULL DEFAULT 0,
  "current_eway_bill_id" varchar(40),
  "compliance_last_message" text,
  "compliance_last_attempt_at" timestamptz,
  "finalized_at" timestamptz,
  "created_by" varchar(40) NOT NULL,
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "document_lines" (
  "id" varchar(40) PRIMARY KEY,
  "document_id" varchar(40) NOT NULL,
  "position" smallint NOT NULL,
  "item_id" varchar(40),
  "name" varchar(200) NOT NULL,
  "description" text,
  "hsn_code" varchar(8),
  "quantity" numeric(18,3) NOT NULL,
  "unit" varchar(10) NOT NULL,
  "unit_price_minor" bigint NOT NULL,
  "discount_mode" discount_mode NOT NULL DEFAULT 'percent',
  "discount_value" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_category_id" varchar(40) NOT NULL,
  "tax_rate" numeric(6,3) NOT NULL,
  "tax_inclusive" boolean NOT NULL DEFAULT false,
  "line_total_minor" bigint NOT NULL DEFAULT 0
);

CREATE TABLE "document_tax_lines" (
  "id" varchar(40) PRIMARY KEY,
  "document_id" varchar(40) NOT NULL,
  "tax_category_id" varchar(40) NOT NULL,
  "category_name" varchar(100) NOT NULL,
  "rate" numeric(6,3) NOT NULL,
  "taxable_amount_minor" bigint NOT NULL,
  "total_tax_minor" bigint NOT NULL
);

CREATE TABLE "document_tax_components" (
  "id" varchar(40) PRIMARY KEY,
  "tax_line_id" varchar(40) NOT NULL,
  "type" tax_type NOT NULL,
  "label" varchar(20) NOT NULL,
  "rate" numeric(6,3) NOT NULL,
  "amount_minor" bigint NOT NULL
);

CREATE TABLE "e_invoices" (
  "document_id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "status" einvoice_status NOT NULL DEFAULT 'pending',
  "doc_type" einvoice_doc_type,
  "supply_type" einvoice_supply_type,
  "irn" char(64) UNIQUE,
  "ack_no" varchar(20),
  "ack_date" varchar(19),
  "signed_qr_payload" text,
  "signed_invoice" text,
  "generated_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancel_reason_code" cancel_reason_code,
  "cancel_remark" varchar(100),
  "issues" jsonb,
  "request_payload" jsonb,
  "response_payload" jsonb,
  "attempts" smallint NOT NULL DEFAULT 0,
  "last_attempt_at" timestamptz,
  "version" int NOT NULL DEFAULT 1,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "share_links" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "document_id" varchar(40) NOT NULL,
  "token_hash" varchar(128) UNIQUE NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "view_count" int NOT NULL DEFAULT 0,
  "last_viewed_at" timestamptz,
  "created_by" varchar(40) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "payment_links" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "document_id" varchar(40) NOT NULL,
  "provider" varchar(20) NOT NULL DEFAULT 'razorpay',
  "provider_link_id" varchar(100) UNIQUE NOT NULL,
  "url" varchar(500) NOT NULL,
  "upi_uri" varchar(500),
  "amount_minor" bigint NOT NULL,
  "currency" char(3) NOT NULL,
  "status" link_status NOT NULL DEFAULT 'active',
  "expires_at" timestamptz,
  "paid_at" timestamptz,
  "payment_id" varchar(40),
  "created_by" varchar(40) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "eway_bills" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "branch_id" varchar(40) NOT NULL,
  "eway_bill_number" char(12) UNIQUE NOT NULL,
  "document_id" varchar(40) NOT NULL,
  "document_kind" document_kind NOT NULL,
  "document_number" varchar(40) NOT NULL,
  "document_date" date NOT NULL,
  "party_id" varchar(40) NOT NULL,
  "doc_type" eway_doc_type NOT NULL,
  "supply_type" eway_supply_type NOT NULL,
  "sub_supply_type" eway_sub_supply_type NOT NULL,
  "sub_supply_description" varchar(100),
  "transaction_type" smallint NOT NULL,
  "from_legal_name" varchar(200) NOT NULL,
  "from_gstin" varchar(15) NOT NULL,
  "from_address1" varchar(200) NOT NULL,
  "from_address2" varchar(200),
  "from_place" varchar(100) NOT NULL,
  "from_pincode" char(6) NOT NULL,
  "from_state_code" varchar(2) NOT NULL,
  "to_legal_name" varchar(200) NOT NULL,
  "to_gstin" varchar(15) NOT NULL,
  "to_address1" varchar(200) NOT NULL,
  "to_address2" varchar(200),
  "to_place" varchar(100) NOT NULL,
  "to_pincode" char(6) NOT NULL,
  "to_state_code" varchar(2) NOT NULL,
  "currency" char(3) NOT NULL DEFAULT 'INR',
  "consignment_value_minor" bigint NOT NULL,
  "taxable_value_minor" bigint NOT NULL,
  "cgst_minor" bigint NOT NULL DEFAULT 0,
  "sgst_minor" bigint NOT NULL DEFAULT 0,
  "igst_minor" bigint NOT NULL DEFAULT 0,
  "main_hsn_code" varchar(8),
  "item_count" smallint NOT NULL,
  "transporter_id" varchar(40),
  "transporter_name" varchar(200),
  "transport_mode" transport_mode NOT NULL,
  "vehicle_number" varchar(15),
  "vehicle_type" vehicle_type NOT NULL DEFAULT 'regular',
  "transport_doc_number" varchar(20),
  "transport_doc_date" date,
  "distance_km" int NOT NULL,
  "generated_at" timestamptz NOT NULL,
  "generated_by" varchar(40) NOT NULL,
  "valid_from" timestamptz NOT NULL,
  "valid_upto" timestamptz NOT NULL,
  "status" eway_stored_status NOT NULL DEFAULT 'active',
  "cancelled_at" timestamptz,
  "cancel_reason_code" cancel_reason_code,
  "cancel_remark" varchar(100),
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "eway_bill_part_b_updates" (
  "id" varchar(40) PRIMARY KEY,
  "eway_bill_id" varchar(40) NOT NULL,
  "mode" transport_mode NOT NULL,
  "vehicle_number" varchar(15),
  "vehicle_type" vehicle_type NOT NULL,
  "transport_doc_number" varchar(20),
  "transport_doc_date" date,
  "from_place" varchar(100) NOT NULL,
  "from_state_code" varchar(2) NOT NULL,
  "reason_code" eway_part_b_reason NOT NULL,
  "remark" varchar(100),
  "updated_by" varchar(40) NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "eway_bill_extensions" (
  "id" varchar(40) PRIMARY KEY,
  "eway_bill_id" varchar(40) NOT NULL,
  "reason_code" eway_extend_reason NOT NULL,
  "remark" varchar(100),
  "transit_type" eway_transit_type NOT NULL,
  "current_place" varchar(100) NOT NULL,
  "current_pincode" char(6) NOT NULL,
  "current_state_code" varchar(2) NOT NULL,
  "remaining_distance_km" int NOT NULL,
  "previous_valid_upto" timestamptz NOT NULL,
  "new_valid_upto" timestamptz NOT NULL,
  "extended_by" varchar(40) NOT NULL,
  "extended_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "payments" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "branch_id" varchar(40) NOT NULL,
  "number" varchar(40) NOT NULL,
  "direction" payment_direction NOT NULL,
  "party_id" varchar(40) NOT NULL,
  "date" date NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" char(3) NOT NULL,
  "exchange_rate" numeric(18,8) NOT NULL DEFAULT 1,
  "method" payment_method NOT NULL,
  "reference" varchar(100),
  "account_id" varchar(40) NOT NULL,
  "unallocated_minor" bigint NOT NULL DEFAULT 0,
  "fx_gain_loss_minor" bigint,
  "notes" text,
  "created_by" varchar(40) NOT NULL,
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "payment_allocations" (
  "id" varchar(40) PRIMARY KEY,
  "payment_id" varchar(40) NOT NULL,
  "document_id" varchar(40) NOT NULL,
  "document_number" varchar(40) NOT NULL,
  "amount_minor" bigint NOT NULL
);

CREATE TABLE "expenses" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "branch_id" varchar(40) NOT NULL,
  "number" varchar(40) NOT NULL,
  "category_id" varchar(40) NOT NULL,
  "supplier_id" varchar(40),
  "date" date NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" char(3) NOT NULL,
  "exchange_rate" numeric(18,8) NOT NULL DEFAULT 1,
  "tax_category_id" varchar(40),
  "tax_amount_minor" bigint NOT NULL DEFAULT 0,
  "tax_inclusive" boolean NOT NULL DEFAULT true,
  "account_id" varchar(40) NOT NULL,
  "method" payment_method NOT NULL,
  "reference" varchar(100),
  "notes" text,
  "billable" boolean NOT NULL DEFAULT false,
  "recurrence" recurrence_frequency NOT NULL DEFAULT 'none',
  "next_recurrence_date" date,
  "recurring_parent_id" varchar(40),
  "ocr_extraction_id" varchar(40),
  "created_by" varchar(40) NOT NULL,
  "version" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "stock_movements" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "branch_id" varchar(40) NOT NULL,
  "item_id" varchar(40) NOT NULL,
  "type" stock_movement_type NOT NULL,
  "quantity" numeric(18,3) NOT NULL,
  "currency" char(3) NOT NULL,
  "unit_cost_minor" bigint NOT NULL DEFAULT 0,
  "date" date NOT NULL,
  "reference_type" varchar(20),
  "reference_id" varchar(40),
  "reference_number" varchar(40),
  "transfer_group_id" varchar(40),
  "adjust_reason" stock_adjust_reason,
  "notes" text,
  "created_by" varchar(40) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "attachments" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "name" varchar(255) NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "size_bytes" bigint NOT NULL,
  "storage_key" varchar(500) NOT NULL,
  "checksum_sha256" char(64),
  "status" attachment_status NOT NULL DEFAULT 'pending',
  "entity_type" varchar(30),
  "entity_id" varchar(40),
  "uploaded_by" varchar(40),
  "uploaded_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "ocr_extractions" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "attachment_id" varchar(40) NOT NULL,
  "kind" ocr_kind NOT NULL,
  "status" ocr_status NOT NULL DEFAULT 'queued',
  "provider" varchar(40),
  "matched_party_id" varchar(40),
  "raw_response" jsonb,
  "error" text,
  "created_by" varchar(40) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "completed_at" timestamptz
);

CREATE TABLE "ocr_fields" (
  "id" varchar(40) PRIMARY KEY,
  "extraction_id" varchar(40) NOT NULL,
  "key" ocr_field_key NOT NULL,
  "label" varchar(60) NOT NULL,
  "value" text,
  "confidence" numeric(4,3) NOT NULL
);

CREATE TABLE "ocr_lines" (
  "id" varchar(40) PRIMARY KEY,
  "extraction_id" varchar(40) NOT NULL,
  "position" smallint NOT NULL,
  "name" varchar(200) NOT NULL,
  "quantity" numeric(18,3),
  "unit_price_minor" bigint,
  "confidence" numeric(4,3) NOT NULL,
  "matched_item_id" varchar(40)
);

CREATE TABLE "message_deliveries" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "channel" message_channel NOT NULL,
  "purpose" varchar(30) NOT NULL,
  "recipient" varchar(254) NOT NULL,
  "party_id" varchar(40),
  "document_id" varchar(40),
  "message" text,
  "include_payment_link" boolean NOT NULL DEFAULT false,
  "provider" varchar(40),
  "provider_message_id" varchar(200) UNIQUE,
  "status" delivery_status NOT NULL DEFAULT 'queued',
  "error" text,
  "sent_by" varchar(40),
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "delivered_at" timestamptz,
  "read_at" timestamptz
);

CREATE TABLE "reminder_documents" (
  "delivery_id" varchar(40) NOT NULL,
  "document_id" varchar(40) NOT NULL,
  PRIMARY KEY ("delivery_id", "document_id")
);

CREATE TABLE "notifications" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "user_id" varchar(40),
  "kind" notification_kind NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "entity_type" varchar(30),
  "entity_id" varchar(40),
  "read_at" timestamptz,
  "cleared_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "audit_events" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "actor_id" varchar(40) NOT NULL,
  "actor_name" varchar(200) NOT NULL,
  "action" varchar(60) NOT NULL,
  "entity_type" varchar(30) NOT NULL,
  "entity_id" varchar(40) NOT NULL,
  "entity_label" varchar(200) NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "device" varchar(100),
  "ip_address" inet,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "integrations" (
  "id" varchar(40) PRIMARY KEY,
  "name" varchar(100) NOT NULL,
  "description" text NOT NULL,
  "icon" varchar(40) NOT NULL,
  "category" integration_category NOT NULL,
  "config_route" varchar(100),
  "min_plan" plan_tier NOT NULL DEFAULT 'free'
);

CREATE TABLE "company_integrations" (
  "company_id" varchar(40) NOT NULL,
  "integration_id" varchar(40) NOT NULL,
  "connected" boolean NOT NULL DEFAULT false,
  "config" jsonb,
  "credentials_encrypted" bytea,
  "connected_by" varchar(40),
  "connected_at" timestamptz,
  "disconnected_at" timestamptz,
  PRIMARY KEY ("company_id", "integration_id")
);

CREATE TABLE "export_jobs" (
  "id" varchar(40) PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "format" export_format NOT NULL,
  "status" job_status NOT NULL DEFAULT 'queued',
  "trigger" varchar(20) NOT NULL DEFAULT 'manual',
  "storage_key" varchar(500),
  "expires_at" timestamptz,
  "error" text,
  "requested_by" varchar(40),
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "completed_at" timestamptz
);

CREATE TABLE "idempotency_keys" (
  "key" uuid NOT NULL,
  "user_id" varchar(40) NOT NULL,
  "method" http_method NOT NULL,
  "path" varchar(300) NOT NULL,
  "request_hash" char(64) NOT NULL,
  "response_status" smallint,
  "response_body" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "expires_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "key")
);

CREATE TABLE "sync_mutations" (
  "id" varchar(40) PRIMARY KEY,
  "user_id" varchar(40) NOT NULL,
  "company_id" varchar(40),
  "device_session_id" varchar(40),
  "method" http_method NOT NULL,
  "path" varchar(300) NOT NULL,
  "body" jsonb,
  "base_version" int,
  "client_entity_id" varchar(60),
  "status" sync_status NOT NULL,
  "result" jsonb,
  "queued_at" timestamptz NOT NULL,
  "applied_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "client_id_mappings" (
  "client_entity_id" varchar(60) NOT NULL,
  "user_id" varchar(40) NOT NULL,
  "entity_type" varchar(30) NOT NULL,
  "server_entity_id" varchar(40) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  PRIMARY KEY ("user_id", "client_entity_id")
);

CREATE TABLE "change_log" (
  "seq" bigserial PRIMARY KEY,
  "company_id" varchar(40) NOT NULL,
  "entity_type" varchar(30) NOT NULL,
  "entity_id" varchar(40) NOT NULL,
  "op" varchar(10) NOT NULL,
  "version" int NOT NULL,
  "changed_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "webhook_events" (
  "id" varchar(40) PRIMARY KEY,
  "source" webhook_source NOT NULL,
  "external_event_id" varchar(200) NOT NULL,
  "event_type" varchar(60) NOT NULL,
  "signature_valid" boolean NOT NULL,
  "payload" jsonb NOT NULL,
  "processed_at" timestamptz,
  "error" text,
  "received_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "countries" (
  "code" char(2) PRIMARY KEY,
  "name" varchar(100) NOT NULL,
  "currency" char(3) NOT NULL,
  "tax_regime" tax_regime NOT NULL,
  "tax_id_label" varchar(20) NOT NULL,
  "fiscal_year_start_month" smallint NOT NULL
);

CREATE TABLE "currencies" (
  "code" char(3) PRIMARY KEY,
  "name" varchar(60) NOT NULL,
  "symbol" varchar(8) NOT NULL,
  "minor_digits" smallint NOT NULL DEFAULT 2
);

CREATE TABLE "states" (
  "country_code" char(2) NOT NULL,
  "code" varchar(4) NOT NULL,
  "name" varchar(100) NOT NULL,
  "is_union_territory" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("country_code", "code")
);

CREATE TABLE "cities" (
  "id" serial PRIMARY KEY,
  "country_code" char(2) NOT NULL,
  "state_code" varchar(4) NOT NULL,
  "name" varchar(100) NOT NULL
);

CREATE TABLE "pincodes" (
  "pincode" char(6) PRIMARY KEY,
  "city" varchar(100) NOT NULL,
  "district" varchar(100),
  "state_code" varchar(2) NOT NULL,
  "latitude" numeric(9,6),
  "longitude" numeric(9,6)
);

CREATE TABLE "units" (
  "code" varchar(10) PRIMARY KEY,
  "name" varchar(40) NOT NULL,
  "decimals" smallint NOT NULL DEFAULT 0
);

CREATE TABLE "hsn_codes" (
  "code" varchar(8) PRIMARY KEY,
  "description" text NOT NULL,
  "is_service" boolean NOT NULL DEFAULT false,
  "default_gst_rate" numeric(6,3)
);

CREATE TABLE "gstin_lookups" (
  "gstin" varchar(15) PRIMARY KEY,
  "legal_name" varchar(200),
  "trade_name" varchar(200),
  "status" varchar(20),
  "registration_type" gst_registration_type,
  "state_code" varchar(2),
  "address" jsonb,
  "fetched_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE INDEX ON "companies" ("account_id");

CREATE INDEX ON "companies" ("tax_identifier");

CREATE UNIQUE INDEX ON "branches" ("company_id", "code");

CREATE INDEX ON "users" ("account_id");

CREATE INDEX ON "otp_requests" ("phone", "created_at");

CREATE INDEX ON "device_sessions" ("user_id");

CREATE INDEX ON "tax_categories" ("company_id");

CREATE UNIQUE INDEX ON "expense_categories" ("company_id", "name");

CREATE INDEX ON "payment_accounts" ("company_id");

CREATE UNIQUE INDEX ON "exchange_rates" ("company_id", "from_currency", "to_currency", "effective_from");

CREATE UNIQUE INDEX ON "transporters" ("company_id", "transporter_id");

CREATE UNIQUE INDEX ON "numbering_series" ("company_id", "kind");

CREATE UNIQUE INDEX ON "parties" ("company_id", "code");

CREATE INDEX ON "parties" ("company_id", "kind", "status");

CREATE INDEX ON "parties" ("company_id", "tax_id");

CREATE UNIQUE INDEX ON "items" ("company_id", "sku");

CREATE INDEX ON "items" ("company_id", "barcode");

CREATE INDEX ON "items" ("company_id", "status");

CREATE INDEX ON "documents" ("company_id", "kind", "number");

CREATE INDEX ON "documents" ("company_id", "kind", "status", "date");

CREATE INDEX ON "documents" ("company_id", "party_id", "date");

CREATE INDEX ON "documents" ("company_id", "branch_id", "date");

CREATE INDEX ON "documents" ("source_document_id");

CREATE UNIQUE INDEX ON "document_lines" ("document_id", "position");

CREATE INDEX ON "document_lines" ("item_id");

CREATE UNIQUE INDEX ON "document_tax_lines" ("document_id", "tax_category_id");

CREATE INDEX ON "e_invoices" ("company_id", "status");

CREATE INDEX ON "eway_bills" ("company_id", "status", "valid_upto");

CREATE INDEX ON "eway_bills" ("document_id");

CREATE INDEX ON "eway_bills" ("company_id", "party_id");

CREATE INDEX ON "eway_bill_part_b_updates" ("eway_bill_id", "updated_at");

CREATE INDEX ON "eway_bill_extensions" ("eway_bill_id", "extended_at");

CREATE UNIQUE INDEX ON "payments" ("company_id", "number");

CREATE INDEX ON "payments" ("company_id", "party_id", "date");

CREATE INDEX ON "payments" ("company_id", "direction", "date");

CREATE INDEX ON "payments" ("account_id");

CREATE UNIQUE INDEX ON "payment_allocations" ("payment_id", "document_id");

CREATE INDEX ON "payment_allocations" ("document_id");

CREATE UNIQUE INDEX ON "expenses" ("company_id", "number");

CREATE INDEX ON "expenses" ("company_id", "category_id", "date");

CREATE INDEX ON "expenses" ("company_id", "date");

CREATE INDEX ON "expenses" ("next_recurrence_date");

CREATE INDEX ON "stock_movements" ("company_id", "item_id", "branch_id", "date");

CREATE INDEX ON "stock_movements" ("company_id", "branch_id", "date");

CREATE INDEX ON "stock_movements" ("reference_id");

CREATE INDEX ON "stock_movements" ("transfer_group_id");

CREATE INDEX ON "attachments" ("company_id", "entity_type", "entity_id");

CREATE INDEX ON "ocr_extractions" ("company_id", "status");

CREATE UNIQUE INDEX ON "ocr_fields" ("extraction_id", "key");

CREATE INDEX ON "message_deliveries" ("company_id", "party_id", "created_at");

CREATE INDEX ON "message_deliveries" ("document_id");

CREATE INDEX ON "notifications" ("company_id", "user_id", "created_at");

CREATE INDEX ON "audit_events" ("company_id", "created_at");

CREATE INDEX ON "audit_events" ("company_id", "entity_type", "entity_id");

CREATE INDEX ON "export_jobs" ("company_id", "created_at");

CREATE INDEX ON "idempotency_keys" ("expires_at");

CREATE INDEX ON "sync_mutations" ("user_id", "applied_at");

CREATE INDEX ON "change_log" ("company_id", "seq");

CREATE UNIQUE INDEX ON "webhook_events" ("source", "external_event_id");

CREATE UNIQUE INDEX ON "cities" ("country_code", "state_code", "name");

COMMENT ON COLUMN "accounts"."id" IS 'CustomerAccount; owns companies and users';

COMMENT ON COLUMN "accounts"."owner_user_id" IS 'set once the first user exists';

COMMENT ON COLUMN "companies"."business_type" IS 'stable slug, e.g. wholesale';

COMMENT ON COLUMN "companies"."address_state_code" IS 'GST state code, e.g. 27';

COMMENT ON COLUMN "companies"."tax_identifier" IS 'GSTIN / TRN / VAT number';

COMMENT ON COLUMN "companies"."fiscal_year_start_month" IS '1-12';

COMMENT ON COLUMN "companies"."plan" IS 'changed only through billing';

COMMENT ON COLUMN "branches"."code" IS 'e.g. MUM; used in numbering';

COMMENT ON COLUMN "branches"."is_primary" IS 'exactly one per company';

COMMENT ON COLUMN "users"."phone" IS 'E.164';

COMMENT ON COLUMN "users"."password_hash" IS 'argon2id; null for OTP-only users';

COMMENT ON TABLE "user_companies" IS 'User.companyIds';

COMMENT ON TABLE "user_branches" IS 'User.branchIds. No rows for a company means all of its branches.';

COMMENT ON COLUMN "otp_requests"."id" IS 'requestId returned to the client';

COMMENT ON TABLE "device_sessions" IS 'DeviceSession. `current` is computed per request.';

COMMENT ON COLUMN "device_sessions"."label" IS 'e.g. Priya''s iPhone';

COMMENT ON COLUMN "device_sessions"."refresh_token_hash" IS 'rotated on every refresh';

COMMENT ON COLUMN "plans"."features" IS 'marketing bullet list';

COMMENT ON TABLE "plan_modules" IS 'Which gated modules a plan includes. Mirrors src/domain/plan.ts.';

COMMENT ON COLUMN "subscription_events"."event" IS 'checkout.started, subscription.charged, …';

COMMENT ON COLUMN "tax_categories"."rate" IS 'combined percentage; split into components at calculation time';

COMMENT ON COLUMN "transporters"."transporter_id" IS '15-character GSTIN, or a TRANSIN';

COMMENT ON COLUMN "numbering_series"."next_number" IS 'never moves backwards; incremented under row lock';

COMMENT ON TABLE "compliance_settings" IS 'Separate from companies so saveCompany cannot clobber it.';

COMMENT ON COLUMN "compliance_settings"."irp_client_id_masked" IS 'display only, e.g. ELX-****-9F21';

COMMENT ON COLUMN "compliance_settings"."eway_bill_threshold_minor" IS 'Rs 50,000 in paise';

COMMENT ON TABLE "compliance_credentials" IS 'Write-only secrets, envelope-encrypted with KMS. Never returned by the API.';

COMMENT ON COLUMN "compliance_credentials"."gsp_provider" IS 'ClearTax, Masters India, IRIS, NIC';

COMMENT ON COLUMN "compliance_credentials"."auth_token_encrypted" IS 'cached portal session token';

COMMENT ON COLUMN "parties"."tax_id" IS 'GSTIN / TRN';

COMMENT ON COLUMN "parties"."gst_registration_type" IS 'null reads as regular with a GSTIN, else unregistered';

COMMENT ON COLUMN "parties"."shipping_line1" IS 'all shipping_* null means same as billing';

COMMENT ON COLUMN "parties"."credit_limit_minor" IS 'in the party currency';

COMMENT ON COLUMN "parties"."opening_balance_minor" IS 'positive: customer owes us / we owe supplier';

COMMENT ON COLUMN "items"."currency" IS 'company base currency';

COMMENT ON TABLE "documents" IS 'BusinessDocument. Only drafts may be deleted; everything else is cancelled so its number is kept.';

COMMENT ON COLUMN "documents"."number" IS '"<KIND>-DRAFT" until finalised';

COMMENT ON COLUMN "documents"."supplier_doc_number" IS 'supplier bill number on purchase documents';

COMMENT ON COLUMN "documents"."exchange_rate" IS 'to company base currency';

COMMENT ON COLUMN "documents"."source_document_id" IS 'e.g. invoice converted from a quote';

COMMENT ON COLUMN "documents"."grand_total_base_minor" IS 'in company base currency';

COMMENT ON COLUMN "documents"."amount_paid_minor" IS 'sum of allocations; cached';

COMMENT ON COLUMN "document_lines"."item_id" IS 'null for free-text lines';

COMMENT ON COLUMN "document_lines"."unit_price_minor" IS 'document currency';

COMMENT ON COLUMN "document_lines"."tax_rate" IS 'snapshot, so historical documents stay reproducible';

COMMENT ON COLUMN "document_lines"."line_total_minor" IS 'computed';

COMMENT ON TABLE "document_tax_lines" IS 'DocumentTotals.taxLines, one per tax category on the document';

COMMENT ON COLUMN "document_tax_lines"."category_name" IS 'snapshot';

COMMENT ON TABLE "document_tax_components" IS 'TaxLine.components: CGST+SGST intra-state, IGST inter-state, CESS';

COMMENT ON COLUMN "document_tax_components"."label" IS 'e.g. CGST 9%';

COMMENT ON TABLE "e_invoices" IS 'ComplianceInfo e-invoice fields, one per document';

COMMENT ON COLUMN "e_invoices"."irn" IS 'lowercase hex digest from the IRP';

COMMENT ON COLUMN "e_invoices"."ack_date" IS 'yyyy-MM-dd HH:mm:ss, as returned';

COMMENT ON COLUMN "e_invoices"."signed_qr_payload" IS 'JWS compact serialisation';

COMMENT ON COLUMN "e_invoices"."issues" IS 'ComplianceIssue[] from the last attempt';

COMMENT ON COLUMN "e_invoices"."request_payload" IS 'NIC schema 1.1 payload sent';

COMMENT ON COLUMN "payment_links"."payment_id" IS 'set by the razorpay webhook';

COMMENT ON TABLE "eway_bills" IS 'A document may have several over time (cancel and regenerate).';

COMMENT ON COLUMN "eway_bills"."eway_bill_number" IS 'issued by the portal';

COMMENT ON COLUMN "eway_bills"."sub_supply_description" IS 'required when sub_supply_type = others';

COMMENT ON COLUMN "eway_bills"."transaction_type" IS '1 regular, 2 bill-to ship-to, 3 bill-from dispatch-from, 4 combination';

COMMENT ON COLUMN "eway_bills"."from_gstin" IS 'GSTIN or URP';

COMMENT ON COLUMN "eway_bills"."valid_upto" IS 'end of day, rule 138(10)';

COMMENT ON TABLE "eway_bill_part_b_updates" IS 'Append-only';

COMMENT ON TABLE "eway_bill_extensions" IS 'Append-only';

COMMENT ON COLUMN "payments"."unallocated_minor" IS 'advance held against the party';

COMMENT ON COLUMN "payments"."fx_gain_loss_minor" IS 'base currency';

COMMENT ON COLUMN "payment_allocations"."document_number" IS 'snapshot';

COMMENT ON COLUMN "payment_allocations"."amount_minor" IS 'payment currency';

COMMENT ON COLUMN "expenses"."recurring_parent_id" IS 'the template this occurrence was created from';

COMMENT ON TABLE "stock_movements" IS 'Append-only ledger. Stock on hand = SUM(quantity) per item and branch.';

COMMENT ON COLUMN "stock_movements"."quantity" IS 'signed; negative reduces stock';

COMMENT ON COLUMN "stock_movements"."reference_type" IS 'document | adjustment | transfer';

COMMENT ON COLUMN "stock_movements"."reference_id" IS 'document id for purchaseReceipt/salesIssue/returns';

COMMENT ON COLUMN "stock_movements"."transfer_group_id" IS 'pairs transferOut with transferIn';

COMMENT ON TABLE "attachments" IS 'Replaces the attachmentIds arrays on documents, payments and expenses.';

COMMENT ON COLUMN "attachments"."storage_key" IS 'object-store key; the API returns short-lived signed URLs';

COMMENT ON COLUMN "attachments"."entity_type" IS 'document | payment | expense | party | item | company (polymorphic)';

COMMENT ON COLUMN "ocr_fields"."confidence" IS 'below 0.75 is flagged for review';

COMMENT ON TABLE "message_deliveries" IS 'sendDocument and sendPaymentReminder; statuses updated by the WhatsApp webhook.';

COMMENT ON COLUMN "message_deliveries"."purpose" IS 'documentSend | paymentReminder | invite | otp';

COMMENT ON COLUMN "message_deliveries"."recipient" IS 'phone or email';

COMMENT ON TABLE "reminder_documents" IS 'A single reminder can cover several open invoices';

COMMENT ON COLUMN "notifications"."user_id" IS 'null means every member of the company';

COMMENT ON TABLE "audit_events" IS 'Append-only; no updates or deletes';

COMMENT ON COLUMN "audit_events"."actor_name" IS 'snapshot';

COMMENT ON COLUMN "audit_events"."action" IS 'e.g. marked sent';

COMMENT ON COLUMN "integrations"."id" IS 'catalogue key, e.g. int_razorpay, int_drive';

COMMENT ON COLUMN "company_integrations"."credentials_encrypted" IS 'OAuth tokens, API keys';

COMMENT ON COLUMN "export_jobs"."trigger" IS 'manual | scheduledBackup';

COMMENT ON COLUMN "idempotency_keys"."expires_at" IS 'created_at + 24h';

COMMENT ON COLUMN "sync_mutations"."id" IS 'client queue entry id; also the idempotency key';

COMMENT ON COLUMN "sync_mutations"."result" IS 'response, or problem+json on conflict';

COMMENT ON COLUMN "client_id_mappings"."client_entity_id" IS 'temporary id minted offline';

COMMENT ON COLUMN "change_log"."seq" IS 'monotonic cursor for /sync/pull';

COMMENT ON COLUMN "change_log"."op" IS 'upsert | delete';

COMMENT ON COLUMN "currencies"."minor_digits" IS '3 for KWD/BHD, 0 for JPY';

COMMENT ON COLUMN "states"."code" IS 'GST state code for IN, e.g. 27';

COMMENT ON TABLE "pincodes" IS 'India Post PIN directory';

COMMENT ON COLUMN "units"."code" IS 'NIC UQC, e.g. NOS, KGS';

COMMENT ON TABLE "hsn_codes" IS 'CBIC HSN/SAC master';

COMMENT ON COLUMN "hsn_codes"."is_service" IS 'SAC codes start with 99';

COMMENT ON TABLE "gstin_lookups" IS 'Cache of GST public search results';

COMMENT ON COLUMN "gstin_lookups"."status" IS 'Active, Cancelled, Suspended';

ALTER TABLE "companies" ADD FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "companies" ADD FOREIGN KEY ("logo_attachment_id") REFERENCES "attachments" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "companies" ADD FOREIGN KEY ("country") REFERENCES "countries" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "companies" ADD FOREIGN KEY ("base_currency") REFERENCES "currencies" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branches" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "users" ADD FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "users" ADD FOREIGN KEY ("default_company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_companies" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_companies" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_branches" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_branches" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "invites" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "invites" ADD FOREIGN KEY ("invited_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "password_reset_tokens" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "device_sessions" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "push_tokens" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "push_tokens" ADD FOREIGN KEY ("device_session_id") REFERENCES "device_sessions" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "plan_modules" ADD FOREIGN KEY ("plan") REFERENCES "plans" ("key") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "subscriptions" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "subscriptions" ADD FOREIGN KEY ("plan") REFERENCES "plans" ("key") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "subscription_events" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "subscription_events" ADD FOREIGN KEY ("webhook_event_id") REFERENCES "webhook_events" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "tax_categories" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "tax_categories" ADD FOREIGN KEY ("hsn_code") REFERENCES "hsn_codes" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expense_categories" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payment_accounts" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payment_accounts" ADD FOREIGN KEY ("currency") REFERENCES "currencies" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "exchange_rates" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "exchange_rates" ADD FOREIGN KEY ("from_currency") REFERENCES "currencies" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "exchange_rates" ADD FOREIGN KEY ("to_currency") REFERENCES "currencies" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "transporters" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "numbering_series" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "compliance_settings" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "compliance_settings" ADD FOREIGN KEY ("default_transporter_id") REFERENCES "transporters" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "compliance_credentials" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "backup_settings" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "parties" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "parties" ADD FOREIGN KEY ("currency") REFERENCES "currencies" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "items" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "items" ADD FOREIGN KEY ("unit") REFERENCES "units" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "items" ADD FOREIGN KEY ("tax_category_id") REFERENCES "tax_categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "items" ADD FOREIGN KEY ("hsn_code") REFERENCES "hsn_codes" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "items" ADD FOREIGN KEY ("image_attachment_id") REFERENCES "attachments" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "documents" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "documents" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "documents" ADD FOREIGN KEY ("party_id") REFERENCES "parties" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "documents" ADD FOREIGN KEY ("currency") REFERENCES "currencies" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "documents" ADD FOREIGN KEY ("source_document_id") REFERENCES "documents" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "documents" ADD FOREIGN KEY ("current_eway_bill_id") REFERENCES "eway_bills" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "documents" ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "document_lines" ADD FOREIGN KEY ("document_id") REFERENCES "documents" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "document_lines" ADD FOREIGN KEY ("item_id") REFERENCES "items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "document_lines" ADD FOREIGN KEY ("tax_category_id") REFERENCES "tax_categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "document_tax_lines" ADD FOREIGN KEY ("document_id") REFERENCES "documents" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "document_tax_lines" ADD FOREIGN KEY ("tax_category_id") REFERENCES "tax_categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "document_tax_components" ADD FOREIGN KEY ("tax_line_id") REFERENCES "document_tax_lines" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "e_invoices" ADD FOREIGN KEY ("document_id") REFERENCES "documents" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "e_invoices" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "share_links" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "share_links" ADD FOREIGN KEY ("document_id") REFERENCES "documents" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "share_links" ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payment_links" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payment_links" ADD FOREIGN KEY ("document_id") REFERENCES "documents" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payment_links" ADD FOREIGN KEY ("payment_id") REFERENCES "payments" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payment_links" ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "eway_bills" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "eway_bills" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "eway_bills" ADD FOREIGN KEY ("document_id") REFERENCES "documents" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "eway_bills" ADD FOREIGN KEY ("party_id") REFERENCES "parties" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "eway_bills" ADD FOREIGN KEY ("transporter_id") REFERENCES "transporters" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "eway_bills" ADD FOREIGN KEY ("generated_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "eway_bill_part_b_updates" ADD FOREIGN KEY ("eway_bill_id") REFERENCES "eway_bills" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "eway_bill_part_b_updates" ADD FOREIGN KEY ("updated_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "eway_bill_extensions" ADD FOREIGN KEY ("eway_bill_id") REFERENCES "eway_bills" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "eway_bill_extensions" ADD FOREIGN KEY ("extended_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("party_id") REFERENCES "parties" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("currency") REFERENCES "currencies" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("account_id") REFERENCES "payment_accounts" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payment_allocations" ADD FOREIGN KEY ("payment_id") REFERENCES "payments" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payment_allocations" ADD FOREIGN KEY ("document_id") REFERENCES "documents" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("category_id") REFERENCES "expense_categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("supplier_id") REFERENCES "parties" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("currency") REFERENCES "currencies" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("tax_category_id") REFERENCES "tax_categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("account_id") REFERENCES "payment_accounts" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("recurring_parent_id") REFERENCES "expenses" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("ocr_extraction_id") REFERENCES "ocr_extractions" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("item_id") REFERENCES "items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attachments" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attachments" ADD FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ocr_extractions" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ocr_extractions" ADD FOREIGN KEY ("attachment_id") REFERENCES "attachments" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ocr_extractions" ADD FOREIGN KEY ("matched_party_id") REFERENCES "parties" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ocr_extractions" ADD FOREIGN KEY ("created_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ocr_fields" ADD FOREIGN KEY ("extraction_id") REFERENCES "ocr_extractions" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ocr_lines" ADD FOREIGN KEY ("extraction_id") REFERENCES "ocr_extractions" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ocr_lines" ADD FOREIGN KEY ("matched_item_id") REFERENCES "items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "message_deliveries" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "message_deliveries" ADD FOREIGN KEY ("party_id") REFERENCES "parties" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "message_deliveries" ADD FOREIGN KEY ("document_id") REFERENCES "documents" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "message_deliveries" ADD FOREIGN KEY ("sent_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "reminder_documents" ADD FOREIGN KEY ("delivery_id") REFERENCES "message_deliveries" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "reminder_documents" ADD FOREIGN KEY ("document_id") REFERENCES "documents" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "notifications" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "notifications" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "audit_events" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "audit_events" ADD FOREIGN KEY ("actor_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "company_integrations" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "company_integrations" ADD FOREIGN KEY ("integration_id") REFERENCES "integrations" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "company_integrations" ADD FOREIGN KEY ("connected_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "export_jobs" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "export_jobs" ADD FOREIGN KEY ("requested_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "idempotency_keys" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sync_mutations" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sync_mutations" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sync_mutations" ADD FOREIGN KEY ("device_session_id") REFERENCES "device_sessions" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "client_id_mappings" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "change_log" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "countries" ADD FOREIGN KEY ("currency") REFERENCES "currencies" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "states" ADD FOREIGN KEY ("country_code") REFERENCES "countries" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cities" ADD FOREIGN KEY ("country_code") REFERENCES "countries" ("code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "accounts" ADD FOREIGN KEY ("owner_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branches" ADD FOREIGN KEY ("address_country") REFERENCES "countries" ("code") DEFERRABLE INITIALLY IMMEDIATE;
