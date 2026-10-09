/**
 * The Postgres schema, introspected from docs/database/schema.sql with
 * drizzle-kit and then tidied: timestamps map to Date, money columns are
 * integer minor units held as JS numbers (safe to 2^53), and numeric columns
 * (rates, quantities) stay strings so no float ever touches them.
 *
 * Change the database by editing this file and running
 * `npm run db:generate -w @esmart/db`, which writes a new migration.
 */
import { pgTable, uniqueIndex, foreignKey, varchar, char, boolean, integer, timestamp, index, unique, smallint, inet, bigint, jsonb, numeric, date, text, bigserial, serial, primaryKey, uuid, pgEnum, customType, type PgTableExtraConfigValue } from "drizzle-orm/pg-core"

/** Encrypted secrets. drizzle-kit has no built-in for bytea. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return "bytea"
	},
})

export const activeStatus = pgEnum("active_status", ['active', 'inactive'])
export const attachmentStatus = pgEnum("attachment_status", ['pending', 'ready'])
export const backupDestination = pgEnum("backup_destination", ['elixir-cloud', 'google-drive'])
export const backupFrequency = pgEnum("backup_frequency", ['daily', 'weekly'])
export const billingCycle = pgEnum("billing_cycle", ['monthly', 'yearly'])
export const billingProvider = pgEnum("billing_provider", ['razorpay', 'appStore', 'playStore'])
export const cancelReasonCode = pgEnum("cancel_reason_code", ['1', '2', '3', '4'])
export const deliveryStatus = pgEnum("delivery_status", ['queued', 'sent', 'delivered', 'read', 'failed'])
export const discountMode = pgEnum("discount_mode", ['percent', 'amount'])
export const docStatus = pgEnum("doc_status", ['draft', 'sent', 'accepted', 'rejected', 'expired', 'confirmed', 'fulfilled', 'cancelled', 'delivered', 'issued', 'partiallyPaid', 'paid', 'overdue', 'requested', 'approved', 'processed', 'received', 'billed'])
export const documentKind = pgEnum("document_kind", ['quote', 'salesOrder', 'delivery', 'invoice', 'salesReturn', 'purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn'])
export const einvoiceDocType = pgEnum("einvoice_doc_type", ['INV', 'CRN', 'DBN'])
export const einvoiceStatus = pgEnum("einvoice_status", ['notApplicable', 'pending', 'generated', 'cancelled', 'failed'])
export const einvoiceSupplyType = pgEnum("einvoice_supply_type", ['B2B', 'SEZWP', 'SEZWOP', 'EXPWP', 'EXPWOP', 'DEXP'])
export const ewayDocType = pgEnum("eway_doc_type", ['INV', 'BIL', 'BOE', 'CHL', 'CNT', 'OTH'])
export const ewayExtendReason = pgEnum("eway_extend_reason", ['1', '2', '3', '4', '5'])
export const ewayPartBReason = pgEnum("eway_part_b_reason", ['1', '2', '3', '4'])
export const ewayStoredStatus = pgEnum("eway_stored_status", ['active', 'cancelled'])
export const ewaySubSupplyType = pgEnum("eway_sub_supply_type", ['supply', 'export', 'jobWork', 'ownUse', 'jobWorkReturn', 'salesReturn', 'exhibition', 'lineSales', 'recipientNotKnown', 'others'])
export const ewaySupplyType = pgEnum("eway_supply_type", ['outward', 'inward'])
export const ewayTransitType = pgEnum("eway_transit_type", ['inTransit', 'inMovement'])
export const exportFormat = pgEnum("export_format", ['json-backup', 'csv-zip', 'tally-xml'])
export const gstRegistrationType = pgEnum("gst_registration_type", ['regular', 'composition', 'unregistered', 'sez', 'overseas'])
export const httpMethod = pgEnum("http_method", ['POST', 'PUT', 'PATCH', 'DELETE'])
export const integrationCategory = pgEnum("integration_category", ['payments', 'compliance', 'messaging', 'accounting', 'storage'])
export const irpEnvironment = pgEnum("irp_environment", ['sandbox', 'production'])
export const itemType = pgEnum("item_type", ['goods', 'service'])
export const jobStatus = pgEnum("job_status", ['queued', 'running', 'completed', 'failed'])
export const linkStatus = pgEnum("link_status", ['active', 'paid', 'expired', 'cancelled'])
export const messageChannel = pgEnum("message_channel", ['whatsapp', 'sms', 'email'])
export const notificationKind = pgEnum("notification_kind", ['invoiceSent', 'paymentReceived', 'invoiceOverdue', 'lowStock', 'compliance', 'syncFailure', 'system'])
export const numberingKind = pgEnum("numbering_kind", ['quote', 'salesOrder', 'delivery', 'invoice', 'salesReturn', 'purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn', 'payment', 'expense'])
export const ocrFieldKey = pgEnum("ocr_field_key", ['vendor', 'gstin', 'date', 'amount', 'tax', 'reference', 'category'])
export const ocrKind = pgEnum("ocr_kind", ['expense', 'purchaseBill'])
export const ocrStatus = pgEnum("ocr_status", ['queued', 'processing', 'completed', 'failed'])
export const otpChannel = pgEnum("otp_channel", ['sms', 'whatsapp'])
export const partyKind = pgEnum("party_kind", ['customer', 'supplier'])
export const paymentAccountType = pgEnum("payment_account_type", ['cash', 'bank', 'wallet'])
export const paymentDirection = pgEnum("payment_direction", ['received', 'paid'])
export const paymentMethod = pgEnum("payment_method", ['cash', 'bank', 'upi', 'card', 'cheque', 'wallet', 'other'])
export const planModule = pgEnum("plan_module", ['purchases', 'inventory', 'expenses', 'ocr', 'fx', 'branches', 'payables'])
export const planTier = pgEnum("plan_tier", ['free', 'basic', 'pro', 'business'])
export const platformRole = pgEnum("platform_role", ['superadmin', 'support'])
export const pushProvider = pgEnum("push_provider", ['expo', 'fcm', 'apns'])
export const rateSource = pgEnum("rate_source", ['manual', 'provider'])
export const recurrenceFrequency = pgEnum("recurrence_frequency", ['none', 'weekly', 'monthly', 'quarterly', 'yearly'])
export const resetPolicy = pgEnum("reset_policy", ['never', 'yearly', 'monthly'])
export const stockAdjustReason = pgEnum("stock_adjust_reason", ['damaged', 'lost', 'found', 'recount', 'expired', 'other'])
export const stockMovementType = pgEnum("stock_movement_type", ['opening', 'purchaseReceipt', 'salesIssue', 'salesReturn', 'purchaseReturn', 'transferIn', 'transferOut', 'adjustment'])
export const subscriptionStatus = pgEnum("subscription_status", ['active', 'trialing', 'pastDue', 'cancelled', 'none'])
export const syncStatus = pgEnum("sync_status", ['applied', 'conflict', 'rejected'])
export const taxRegime = pgEnum("tax_regime", ['GST', 'VAT', 'NONE'])
export const taxType = pgEnum("tax_type", ['GST', 'CGST', 'SGST', 'IGST', 'VAT', 'CESS', 'NONE'])
export const transportMode = pgEnum("transport_mode", ['road', 'rail', 'air', 'ship'])
export const userRole = pgEnum("user_role", ['owner', 'admin', 'accountant', 'sales', 'viewer'])
export const userStatus = pgEnum("user_status", ['active', 'invited', 'disabled'])
export const vehicleType = pgEnum("vehicle_type", ['regular', 'overDimensional'])
export const webhookSource = pgEnum("webhook_source", ['razorpay', 'whatsapp'])


export const branches = pgTable("branches", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	code: varchar({ length: 6 }).notNull(),
	addressLine1: varchar("address_line1", { length: 200 }).notNull(),
	addressLine2: varchar("address_line2", { length: 200 }),
	addressCity: varchar("address_city", { length: 100 }).notNull(),
	addressState: varchar("address_state", { length: 100 }).notNull(),
	addressStateCode: varchar("address_state_code", { length: 2 }),
	addressPostalCode: varchar("address_postal_code", { length: 12 }).notNull(),
	addressCountry: char("address_country", { length: 2 }).notNull(),
	isPrimary: boolean("is_primary").default(false).notNull(),
	phone: varchar({ length: 20 }),
	// The branch's own GSTIN, when it is registered separately; printed as the seller.
	gstin: varchar({ length: 15 }),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("branches_company_id_code_idx").using("btree", table.companyId.asc().nullsLast(), table.code.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "branches_company_id_fkey"
		}),
	foreignKey({
			columns: [table.addressCountry],
			foreignColumns: [countries.code],
			name: "branches_address_country_fkey"
		}),
]);

export const users = pgTable("users", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	accountId: varchar("account_id", { length: 40 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	email: varchar({ length: 254 }).notNull(),
	phone: varchar({ length: 20 }),
	passwordHash: varchar("password_hash", { length: 255 }),
	role: userRole().default('viewer').notNull(),
	/** Platform operator access to /admin; null for every tenant user. */
	platformRole: platformRole("platform_role"),
	avatarColor: varchar("avatar_color", { length: 9 }).notNull(),
	status: userStatus().default('invited').notNull(),
	locale: varchar({ length: 10 }).default('en'),
	defaultCompanyId: varchar("default_company_id", { length: 40 }),
	emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: 'date' }),
	phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true, mode: 'date' }),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'date' }),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("users_account_id_idx").using("btree", table.accountId.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "users_account_id_fkey"
		}),
	foreignKey({
			columns: [table.defaultCompanyId],
			foreignColumns: [companies.id],
			name: "users_default_company_id_fkey"
		}),
	unique("users_email_key").on(table.email),
	unique("users_phone_key").on(table.phone),
]);

export const otpRequests = pgTable("otp_requests", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	phone: varchar({ length: 20 }).notNull(),
	channel: otpChannel().default('sms').notNull(),
	codeHash: varchar("code_hash", { length: 128 }).notNull(),
	attempts: smallint().default(0).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'date' }).notNull(),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'date' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("otp_requests_phone_created_at_idx").using("btree", table.phone.asc().nullsLast(), table.createdAt.asc().nullsLast()),
]);

export const pushTokens = pgTable("push_tokens", {
	token: varchar({ length: 255 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 40 }).notNull(),
	deviceSessionId: varchar("device_session_id", { length: 40 }),
	provider: pushProvider().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'date' }),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "push_tokens_user_id_fkey"
		}),
	foreignKey({
			columns: [table.deviceSessionId],
			foreignColumns: [deviceSessions.id],
			name: "push_tokens_device_session_id_fkey"
		}),
]);

export const subscriptions = pgTable("subscriptions", {
	companyId: varchar("company_id", { length: 40 }).primaryKey().notNull(),
	plan: planTier().notNull(),
	cycle: billingCycle().notNull(),
	status: subscriptionStatus().default('none').notNull(),
	provider: billingProvider(),
	providerSubscriptionId: varchar("provider_subscription_id", { length: 100 }),
	providerCustomerId: varchar("provider_customer_id", { length: 100 }),
	currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: 'date' }),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: 'date' }),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "subscriptions_company_id_fkey"
		}),
	foreignKey({
			columns: [table.plan],
			foreignColumns: [plans.key],
			name: "subscriptions_plan_fkey"
		}),
	unique("subscriptions_provider_subscription_id_key").on(table.providerSubscriptionId),
]);

export const invites = pgTable("invites", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 40 }).notNull(),
	invitedBy: varchar("invited_by", { length: 40 }).notNull(),
	tokenHash: varchar("token_hash", { length: 128 }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'date' }).notNull(),
	acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: 'date' }),
	lastSentAt: timestamp("last_sent_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "invites_user_id_fkey"
		}),
	foreignKey({
			columns: [table.invitedBy],
			foreignColumns: [users.id],
			name: "invites_invited_by_fkey"
		}),
	unique("invites_token_hash_key").on(table.tokenHash),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 40 }).notNull(),
	tokenHash: varchar("token_hash", { length: 128 }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'date' }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'date' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "password_reset_tokens_user_id_fkey"
		}),
	unique("password_reset_tokens_token_hash_key").on(table.tokenHash),
]);

export const deviceSessions = pgTable("device_sessions", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 40 }).notNull(),
	label: varchar({ length: 100 }).notNull(),
	platform: varchar({ length: 40 }).notNull(),
	appVersion: varchar("app_version", { length: 20 }),
	location: varchar({ length: 100 }),
	ipAddress: inet("ip_address"),
	refreshTokenHash: varchar("refresh_token_hash", { length: 128 }).notNull(),
	refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true, mode: 'date' }).notNull(),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'date' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("device_sessions_user_id_idx").using("btree", table.userId.asc().nullsLast()),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "device_sessions_user_id_fkey"
		}),
	unique("device_sessions_refresh_token_hash_key").on(table.refreshTokenHash),
]);

export const plans = pgTable("plans", {
	key: planTier().primaryKey().notNull(),
	name: varchar({ length: 40 }).notNull(),
	monthlyPriceMinor: bigint("monthly_price_minor", { mode: "number" }).notNull(),
	yearlyPriceMinor: bigint("yearly_price_minor", { mode: "number" }).notNull(),
	currency: char({ length: 3 }).default('INR').notNull(),
	features: jsonb().notNull(),
	popular: boolean().default(false).notNull(),
	sortOrder: smallint("sort_order").notNull(),
});

export const paymentAccounts = pgTable("payment_accounts", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	type: paymentAccountType().notNull(),
	currency: char({ length: 3 }).notNull(),
	accountNumber: varchar("account_number", { length: 40 }),
	openingBalanceMinor: bigint("opening_balance_minor", { mode: "number" }).default(0).notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("payment_accounts_company_id_idx").using("btree", table.companyId.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "payment_accounts_company_id_fkey"
		}),
	foreignKey({
			columns: [table.currency],
			foreignColumns: [currencies.code],
			name: "payment_accounts_currency_fkey"
		}),
]);

export const taxCategories = pgTable("tax_categories", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	rate: numeric({ precision: 6, scale:  3 }).notNull(),
	type: taxType().notNull(),
	hsnCode: varchar("hsn_code", { length: 8 }),
	effectiveFrom: date("effective_from").notNull(),
	description: text(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("tax_categories_company_id_idx").using("btree", table.companyId.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "tax_categories_company_id_fkey"
		}),
	foreignKey({
			columns: [table.hsnCode],
			foreignColumns: [hsnCodes.code],
			name: "tax_categories_hsn_code_fkey"
		}),
]);

export const exchangeRates = pgTable("exchange_rates", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	fromCurrency: char("from_currency", { length: 3 }).notNull(),
	toCurrency: char("to_currency", { length: 3 }).notNull(),
	rate: numeric({ precision: 18, scale:  8 }).notNull(),
	effectiveFrom: date("effective_from").notNull(),
	source: rateSource().default('manual').notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("exchange_rates_company_id_from_currency_to_currency_effecti_idx").using("btree", table.companyId.asc().nullsLast(), table.fromCurrency.asc().nullsLast(), table.toCurrency.asc().nullsLast(), table.effectiveFrom.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "exchange_rates_company_id_fkey"
		}),
	foreignKey({
			columns: [table.fromCurrency],
			foreignColumns: [currencies.code],
			name: "exchange_rates_from_currency_fkey"
		}),
	foreignKey({
			columns: [table.toCurrency],
			foreignColumns: [currencies.code],
			name: "exchange_rates_to_currency_fkey"
		}),
]);

export const transporters = pgTable("transporters", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	transporterId: varchar("transporter_id", { length: 15 }).notNull(),
	phone: varchar({ length: 20 }),
	status: activeStatus().default('active').notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("transporters_company_id_transporter_id_idx").using("btree", table.companyId.asc().nullsLast(), table.transporterId.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "transporters_company_id_fkey"
		}),
]);

export const numberingSeries = pgTable("numbering_series", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	kind: numberingKind().notNull(),
	prefix: varchar({ length: 20 }).notNull(),
	nextNumber: integer("next_number").default(1).notNull(),
	padding: smallint().default(4).notNull(),
	includeFiscalYear: boolean("include_fiscal_year").default(false).notNull(),
	includeBranchCode: boolean("include_branch_code").default(false).notNull(),
	resetPolicy: resetPolicy("reset_policy").default('never').notNull(),
	lastResetAt: date("last_reset_at"),
	version: integer().default(1).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("numbering_series_company_id_kind_idx").using("btree", table.companyId.asc().nullsLast(), table.kind.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "numbering_series_company_id_fkey"
		}),
]);

export const complianceSettings = pgTable("compliance_settings", {
	companyId: varchar("company_id", { length: 40 }).primaryKey().notNull(),
	einvoiceEnabled: boolean("einvoice_enabled").default(false).notNull(),
	annualTurnoverMinor: bigint("annual_turnover_minor", { mode: "number" }).default(0).notNull(),
	einvoiceTurnoverThresholdMinor: bigint("einvoice_turnover_threshold_minor", { mode: "number" }).notNull(),
	currency: char({ length: 3 }).default('INR').notNull(),
	reportingWindowDays: smallint("reporting_window_days").default(30).notNull(),
	autoGenerateEinvoiceOnFinalise: boolean("auto_generate_einvoice_on_finalise").default(false).notNull(),
	irpUsername: varchar("irp_username", { length: 100 }),
	irpClientIdMasked: varchar("irp_client_id_masked", { length: 40 }),
	irpEnvironment: irpEnvironment("irp_environment").default('sandbox').notNull(),
	ewayBillEnabled: boolean("eway_bill_enabled").default(false).notNull(),
	ewayBillThresholdMinor: bigint("eway_bill_threshold_minor", { mode: "number" }).default(5000000).notNull(),
	autoGenerateEwayBillOnFinalise: boolean("auto_generate_eway_bill_on_finalise").default(false).notNull(),
	defaultTransporterId: varchar("default_transporter_id", { length: 40 }),
	defaultDistanceKm: integer("default_distance_km").default(0).notNull(),
	defaultTransportMode: transportMode("default_transport_mode").default('road').notNull(),
	defaultVehicleType: vehicleType("default_vehicle_type").default('regular').notNull(),
	version: integer().default(1).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "compliance_settings_company_id_fkey"
		}),
	foreignKey({
			columns: [table.defaultTransporterId],
			foreignColumns: [transporters.id],
			name: "compliance_settings_default_transporter_id_fkey"
		}),
]);

export const complianceCredentials = pgTable("compliance_credentials", {
	companyId: varchar("company_id", { length: 40 }).primaryKey().notNull(),
	environment: irpEnvironment().notNull(),
	gspProvider: varchar("gsp_provider", { length: 40 }),
	// TODO: failed to parse database type 'bytea'
	clientIdEncrypted: bytea("client_id_encrypted").notNull(),
	// TODO: failed to parse database type 'bytea'
	clientSecretEncrypted: bytea("client_secret_encrypted").notNull(),
	// TODO: failed to parse database type 'bytea'
	passwordEncrypted: bytea("password_encrypted").notNull(),
	kmsKeyId: varchar("kms_key_id", { length: 200 }).notNull(),
	// TODO: failed to parse database type 'bytea'
	authTokenEncrypted: bytea("auth_token_encrypted"),
	authTokenExpiresAt: timestamp("auth_token_expires_at", { withTimezone: true, mode: 'date' }),
	lastTestedAt: timestamp("last_tested_at", { withTimezone: true, mode: 'date' }),
	lastTestOk: boolean("last_test_ok"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "compliance_credentials_company_id_fkey"
		}),
]);

export const items = pgTable("items", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	sku: varchar({ length: 40 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	description: text(),
	type: itemType().notNull(),
	unit: varchar({ length: 10 }).notNull(),
	currency: char({ length: 3 }).notNull(),
	salePriceMinor: bigint("sale_price_minor", { mode: "number" }).default(0).notNull(),
	purchasePriceMinor: bigint("purchase_price_minor", { mode: "number" }).default(0).notNull(),
	taxCategoryId: varchar("tax_category_id", { length: 40 }).notNull(),
	hsnCode: varchar("hsn_code", { length: 8 }),
	barcode: varchar({ length: 40 }),
	trackInventory: boolean("track_inventory").default(false).notNull(),
	openingStock: numeric("opening_stock", { precision: 18, scale:  3 }).default('0').notNull(),
	reorderLevel: numeric("reorder_level", { precision: 18, scale:  3 }).default('0').notNull(),
	imageAttachmentId: varchar("image_attachment_id", { length: 40 }),
	status: activeStatus().default('active').notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("items_company_id_barcode_idx").using("btree", table.companyId.asc().nullsLast(), table.barcode.asc().nullsLast()),
	uniqueIndex("items_company_id_sku_idx").using("btree", table.companyId.asc().nullsLast(), table.sku.asc().nullsLast()),
	index("items_company_id_status_idx").using("btree", table.companyId.asc().nullsLast(), table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "items_company_id_fkey"
		}),
	foreignKey({
			columns: [table.unit],
			foreignColumns: [units.code],
			name: "items_unit_fkey"
		}),
	foreignKey({
			columns: [table.taxCategoryId],
			foreignColumns: [taxCategories.id],
			name: "items_tax_category_id_fkey"
		}),
	foreignKey({
			columns: [table.hsnCode],
			foreignColumns: [hsnCodes.code],
			name: "items_hsn_code_fkey"
		}),
	foreignKey({
			columns: [table.imageAttachmentId],
			foreignColumns: [attachments.id],
			name: "items_image_attachment_id_fkey"
		}),
]);

export const documents = pgTable("documents", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	branchId: varchar("branch_id", { length: 40 }).notNull(),
	kind: documentKind().notNull(),
	number: varchar({ length: 40 }).notNull(),
	status: docStatus().default('draft').notNull(),
	partyId: varchar("party_id", { length: 40 }).notNull(),
	date: date().notNull(),
	dueDate: date("due_date"),
	validUntil: date("valid_until"),
	reference: varchar({ length: 100 }),
	supplierDocNumber: varchar("supplier_doc_number", { length: 40 }),
	currency: char({ length: 3 }).notNull(),
	exchangeRate: numeric("exchange_rate", { precision: 18, scale:  8 }).default('1').notNull(),
	documentDiscountMode: discountMode("document_discount_mode").default('amount').notNull(),
	documentDiscountValue: numeric("document_discount_value", { precision: 18, scale:  4 }).default('0').notNull(),
	chargesMinor: bigint("charges_minor", { mode: "number" }).default(0).notNull(),
	applyRoundOff: boolean("apply_round_off").default(true).notNull(),
	// A round-off the user typed, overriding the automatic one.
	roundOffManualMinor: bigint("round_off_manual_minor", { mode: "number" }),
	placeOfSupplyStateCode: varchar("place_of_supply_state_code", { length: 2 }),
	notes: text(),
	terms: text(),
	sourceDocumentId: varchar("source_document_id", { length: 40 }),
	subtotalMinor: bigint("subtotal_minor", { mode: "number" }).default(0).notNull(),
	lineDiscountMinor: bigint("line_discount_minor", { mode: "number" }).default(0).notNull(),
	documentDiscountMinor: bigint("document_discount_minor", { mode: "number" }).default(0).notNull(),
	taxableAmountMinor: bigint("taxable_amount_minor", { mode: "number" }).default(0).notNull(),
	totalTaxMinor: bigint("total_tax_minor", { mode: "number" }).default(0).notNull(),
	roundOffMinor: bigint("round_off_minor", { mode: "number" }).default(0).notNull(),
	grandTotalMinor: bigint("grand_total_minor", { mode: "number" }).default(0).notNull(),
	grandTotalBaseMinor: bigint("grand_total_base_minor", { mode: "number" }).default(0).notNull(),
	amountPaidMinor: bigint("amount_paid_minor", { mode: "number" }).default(0).notNull(),
	currentEwayBillId: varchar("current_eway_bill_id", { length: 40 }),
	complianceLastMessage: text("compliance_last_message"),
	complianceLastAttemptAt: timestamp("compliance_last_attempt_at", { withTimezone: true, mode: 'date' }),
	finalizedAt: timestamp("finalized_at", { withTimezone: true, mode: 'date' }),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("documents_company_id_branch_id_date_idx").using("btree", table.companyId.asc().nullsLast(), table.branchId.asc().nullsLast(), table.date.asc().nullsLast()),
	index("documents_company_id_kind_number_idx").using("btree", table.companyId.asc().nullsLast(), table.kind.asc().nullsLast(), table.number.asc().nullsLast()),
	index("documents_company_id_kind_status_date_idx").using("btree", table.companyId.asc().nullsLast(), table.kind.asc().nullsLast(), table.status.asc().nullsLast(), table.date.asc().nullsLast()),
	index("documents_company_id_party_id_date_idx").using("btree", table.companyId.asc().nullsLast(), table.partyId.asc().nullsLast(), table.date.asc().nullsLast()),
	index("documents_source_document_id_idx").using("btree", table.sourceDocumentId.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "documents_company_id_fkey"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "documents_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.partyId],
			foreignColumns: [parties.id],
			name: "documents_party_id_fkey"
		}),
	foreignKey({
			columns: [table.currency],
			foreignColumns: [currencies.code],
			name: "documents_currency_fkey"
		}),
	foreignKey({
			columns: [table.sourceDocumentId],
			foreignColumns: [table.id],
			name: "documents_source_document_id_fkey"
		}),
	foreignKey({
			columns: [table.currentEwayBillId],
			foreignColumns: [ewayBills.id],
			name: "documents_current_eway_bill_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "documents_created_by_fkey"
		}),
]);

export const documentLines = pgTable("document_lines", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	documentId: varchar("document_id", { length: 40 }).notNull(),
	position: smallint().notNull(),
	itemId: varchar("item_id", { length: 40 }),
	name: varchar({ length: 200 }).notNull(),
	description: text(),
	hsnCode: varchar("hsn_code", { length: 8 }),
	quantity: numeric({ precision: 18, scale:  3 }).notNull(),
	unit: varchar({ length: 10 }).notNull(),
	unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
	discountMode: discountMode("discount_mode").default('percent').notNull(),
	discountValue: numeric("discount_value", { precision: 18, scale:  4 }).default('0').notNull(),
	taxCategoryId: varchar("tax_category_id", { length: 40 }).notNull(),
	taxRate: numeric("tax_rate", { precision: 6, scale:  3 }).notNull(),
	taxInclusive: boolean("tax_inclusive").default(false).notNull(),
	lineTotalMinor: bigint("line_total_minor", { mode: "number" }).default(0).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("document_lines_document_id_position_idx").using("btree", table.documentId.asc().nullsLast(), table.position.asc().nullsLast()),
	index("document_lines_item_id_idx").using("btree", table.itemId.asc().nullsLast()),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "document_lines_document_id_fkey"
		}),
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [items.id],
			name: "document_lines_item_id_fkey"
		}),
	foreignKey({
			columns: [table.taxCategoryId],
			foreignColumns: [taxCategories.id],
			name: "document_lines_tax_category_id_fkey"
		}),
]);

export const documentTaxLines = pgTable("document_tax_lines", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	documentId: varchar("document_id", { length: 40 }).notNull(),
	taxCategoryId: varchar("tax_category_id", { length: 40 }).notNull(),
	categoryName: varchar("category_name", { length: 100 }).notNull(),
	rate: numeric({ precision: 6, scale:  3 }).notNull(),
	taxableAmountMinor: bigint("taxable_amount_minor", { mode: "number" }).notNull(),
	totalTaxMinor: bigint("total_tax_minor", { mode: "number" }).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("document_tax_lines_document_id_tax_category_id_idx").using("btree", table.documentId.asc().nullsLast(), table.taxCategoryId.asc().nullsLast()),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "document_tax_lines_document_id_fkey"
		}),
	foreignKey({
			columns: [table.taxCategoryId],
			foreignColumns: [taxCategories.id],
			name: "document_tax_lines_tax_category_id_fkey"
		}),
]);

export const shareLinks = pgTable("share_links", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	documentId: varchar("document_id", { length: 40 }).notNull(),
	tokenHash: varchar("token_hash", { length: 128 }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'date' }).notNull(),
	viewCount: integer("view_count").default(0).notNull(),
	lastViewedAt: timestamp("last_viewed_at", { withTimezone: true, mode: 'date' }),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "share_links_company_id_fkey"
		}),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "share_links_document_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "share_links_created_by_fkey"
		}),
	unique("share_links_token_hash_key").on(table.tokenHash),
]);

export const backupSettings = pgTable("backup_settings", {
	companyId: varchar("company_id", { length: 40 }).primaryKey().notNull(),
	automatic: boolean().default(false).notNull(),
	frequency: backupFrequency().default('daily').notNull(),
	destination: backupDestination().default('elixir-cloud').notNull(),
	lastBackupAt: timestamp("last_backup_at", { withTimezone: true, mode: 'date' }),
	version: integer().default(1).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "backup_settings_company_id_fkey"
		}),
]);

export const parties = pgTable("parties", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	kind: partyKind().notNull(),
	name: varchar({ length: 200 }).notNull(),
	code: varchar({ length: 20 }).notNull(),
	displayName: varchar("display_name", { length: 200 }),
	taxId: varchar("tax_id", { length: 20 }),
	gstRegistrationType: gstRegistrationType("gst_registration_type"),
	email: varchar({ length: 254 }),
	phone: varchar({ length: 20 }),
	currency: char({ length: 3 }).notNull(),
	billingLine1: varchar("billing_line1", { length: 200 }).notNull(),
	billingLine2: varchar("billing_line2", { length: 200 }),
	billingCity: varchar("billing_city", { length: 100 }).notNull(),
	billingState: varchar("billing_state", { length: 100 }).notNull(),
	billingStateCode: varchar("billing_state_code", { length: 2 }),
	billingPostalCode: varchar("billing_postal_code", { length: 12 }).notNull(),
	billingCountry: char("billing_country", { length: 2 }).notNull(),
	shippingLine1: varchar("shipping_line1", { length: 200 }),
	shippingLine2: varchar("shipping_line2", { length: 200 }),
	shippingCity: varchar("shipping_city", { length: 100 }),
	shippingState: varchar("shipping_state", { length: 100 }),
	shippingStateCode: varchar("shipping_state_code", { length: 2 }),
	shippingPostalCode: varchar("shipping_postal_code", { length: 12 }),
	shippingCountry: char("shipping_country", { length: 2 }),
	creditLimitMinor: bigint("credit_limit_minor", { mode: "number" }),
	openingBalanceMinor: bigint("opening_balance_minor", { mode: "number" }).default(0).notNull(),
	paymentTermsDays: smallint("payment_terms_days").default(0).notNull(),
	notes: text(),
	status: activeStatus().default('active').notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("parties_company_id_code_idx").using("btree", table.companyId.asc().nullsLast(), table.code.asc().nullsLast()),
	index("parties_company_id_kind_status_idx").using("btree", table.companyId.asc().nullsLast(), table.kind.asc().nullsLast(), table.status.asc().nullsLast()),
	index("parties_company_id_tax_id_idx").using("btree", table.companyId.asc().nullsLast(), table.taxId.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "parties_company_id_fkey"
		}),
	foreignKey({
			columns: [table.currency],
			foreignColumns: [currencies.code],
			name: "parties_currency_fkey"
		}),
]);

export const documentTaxComponents = pgTable("document_tax_components", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	taxLineId: varchar("tax_line_id", { length: 40 }).notNull(),
	type: taxType().notNull(),
	label: varchar({ length: 20 }).notNull(),
	rate: numeric({ precision: 6, scale:  3 }).notNull(),
	amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.taxLineId],
			foreignColumns: [documentTaxLines.id],
			name: "document_tax_components_tax_line_id_fkey"
		}),
]);

export const eInvoices = pgTable("e_invoices", {
	documentId: varchar("document_id", { length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	status: einvoiceStatus().default('pending').notNull(),
	docType: einvoiceDocType("doc_type"),
	supplyType: einvoiceSupplyType("supply_type"),
	irn: char({ length: 64 }),
	ackNo: varchar("ack_no", { length: 20 }),
	ackDate: varchar("ack_date", { length: 19 }),
	signedQrPayload: text("signed_qr_payload"),
	signedInvoice: text("signed_invoice"),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'date' }),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'date' }),
	cancelReasonCode: cancelReasonCode("cancel_reason_code"),
	cancelRemark: varchar("cancel_remark", { length: 100 }),
	issues: jsonb(),
	requestPayload: jsonb("request_payload"),
	responsePayload: jsonb("response_payload"),
	attempts: smallint().default(0).notNull(),
	lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: 'date' }),
	version: integer().default(1).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("e_invoices_company_id_status_idx").using("btree", table.companyId.asc().nullsLast(), table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "e_invoices_document_id_fkey"
		}),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "e_invoices_company_id_fkey"
		}),
	unique("e_invoices_irn_key").on(table.irn),
]);

export const paymentLinks = pgTable("payment_links", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	documentId: varchar("document_id", { length: 40 }).notNull(),
	provider: varchar({ length: 20 }).default('razorpay').notNull(),
	providerLinkId: varchar("provider_link_id", { length: 100 }).notNull(),
	url: varchar({ length: 500 }).notNull(),
	upiUri: varchar("upi_uri", { length: 500 }),
	amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
	currency: char({ length: 3 }).notNull(),
	status: linkStatus().default('active').notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'date' }),
	paidAt: timestamp("paid_at", { withTimezone: true, mode: 'date' }),
	paymentId: varchar("payment_id", { length: 40 }),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "payment_links_company_id_fkey"
		}),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "payment_links_document_id_fkey"
		}),
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "payment_links_payment_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "payment_links_created_by_fkey"
		}),
	unique("payment_links_provider_link_id_key").on(table.providerLinkId),
]);

export const ewayBillPartBUpdates = pgTable("eway_bill_part_b_updates", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	ewayBillId: varchar("eway_bill_id", { length: 40 }).notNull(),
	mode: transportMode().notNull(),
	vehicleNumber: varchar("vehicle_number", { length: 15 }),
	vehicleType: vehicleType("vehicle_type").notNull(),
	transportDocNumber: varchar("transport_doc_number", { length: 20 }),
	transportDocDate: date("transport_doc_date"),
	fromPlace: varchar("from_place", { length: 100 }).notNull(),
	fromStateCode: varchar("from_state_code", { length: 2 }).notNull(),
	reasonCode: ewayPartBReason("reason_code").notNull(),
	remark: varchar({ length: 100 }),
	updatedBy: varchar("updated_by", { length: 40 }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("eway_bill_part_b_updates_eway_bill_id_updated_at_idx").using("btree", table.ewayBillId.asc().nullsLast(), table.updatedAt.asc().nullsLast()),
	foreignKey({
			columns: [table.ewayBillId],
			foreignColumns: [ewayBills.id],
			name: "eway_bill_part_b_updates_eway_bill_id_fkey"
		}),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: "eway_bill_part_b_updates_updated_by_fkey"
		}),
]);

export const stockMovements = pgTable("stock_movements", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	branchId: varchar("branch_id", { length: 40 }).notNull(),
	itemId: varchar("item_id", { length: 40 }).notNull(),
	type: stockMovementType().notNull(),
	quantity: numeric({ precision: 18, scale:  3 }).notNull(),
	currency: char({ length: 3 }).notNull(),
	unitCostMinor: bigint("unit_cost_minor", { mode: "number" }).default(0).notNull(),
	date: date().notNull(),
	referenceType: varchar("reference_type", { length: 20 }),
	referenceId: varchar("reference_id", { length: 40 }),
	referenceNumber: varchar("reference_number", { length: 40 }),
	transferGroupId: varchar("transfer_group_id", { length: 40 }),
	adjustReason: stockAdjustReason("adjust_reason"),
	notes: text(),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("stock_movements_company_id_branch_id_date_idx").using("btree", table.companyId.asc().nullsLast(), table.branchId.asc().nullsLast(), table.date.asc().nullsLast()),
	index("stock_movements_company_id_item_id_branch_id_date_idx").using("btree", table.companyId.asc().nullsLast(), table.itemId.asc().nullsLast(), table.branchId.asc().nullsLast(), table.date.asc().nullsLast()),
	index("stock_movements_reference_id_idx").using("btree", table.referenceId.asc().nullsLast()),
	index("stock_movements_transfer_group_id_idx").using("btree", table.transferGroupId.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "stock_movements_company_id_fkey"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "stock_movements_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [items.id],
			name: "stock_movements_item_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "stock_movements_created_by_fkey"
		}),
]);

export const ewayBills = pgTable("eway_bills", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	branchId: varchar("branch_id", { length: 40 }).notNull(),
	ewayBillNumber: char("eway_bill_number", { length: 12 }).notNull(),
	documentId: varchar("document_id", { length: 40 }).notNull(),
	documentKind: documentKind("document_kind").notNull(),
	documentNumber: varchar("document_number", { length: 40 }).notNull(),
	documentDate: date("document_date").notNull(),
	partyId: varchar("party_id", { length: 40 }).notNull(),
	docType: ewayDocType("doc_type").notNull(),
	supplyType: ewaySupplyType("supply_type").notNull(),
	subSupplyType: ewaySubSupplyType("sub_supply_type").notNull(),
	subSupplyDescription: varchar("sub_supply_description", { length: 100 }),
	transactionType: smallint("transaction_type").notNull(),
	fromLegalName: varchar("from_legal_name", { length: 200 }).notNull(),
	fromGstin: varchar("from_gstin", { length: 15 }).notNull(),
	fromAddress1: varchar("from_address1", { length: 200 }).notNull(),
	fromAddress2: varchar("from_address2", { length: 200 }),
	fromPlace: varchar("from_place", { length: 100 }).notNull(),
	fromPincode: char("from_pincode", { length: 6 }).notNull(),
	fromStateCode: varchar("from_state_code", { length: 2 }).notNull(),
	toLegalName: varchar("to_legal_name", { length: 200 }).notNull(),
	toGstin: varchar("to_gstin", { length: 15 }).notNull(),
	toAddress1: varchar("to_address1", { length: 200 }).notNull(),
	toAddress2: varchar("to_address2", { length: 200 }),
	toPlace: varchar("to_place", { length: 100 }).notNull(),
	toPincode: char("to_pincode", { length: 6 }).notNull(),
	toStateCode: varchar("to_state_code", { length: 2 }).notNull(),
	currency: char({ length: 3 }).default('INR').notNull(),
	consignmentValueMinor: bigint("consignment_value_minor", { mode: "number" }).notNull(),
	taxableValueMinor: bigint("taxable_value_minor", { mode: "number" }).notNull(),
	cgstMinor: bigint("cgst_minor", { mode: "number" }).default(0).notNull(),
	sgstMinor: bigint("sgst_minor", { mode: "number" }).default(0).notNull(),
	igstMinor: bigint("igst_minor", { mode: "number" }).default(0).notNull(),
	mainHsnCode: varchar("main_hsn_code", { length: 8 }),
	itemCount: smallint("item_count").notNull(),
	transporterId: varchar("transporter_id", { length: 40 }),
	transporterName: varchar("transporter_name", { length: 200 }),
	transportMode: transportMode("transport_mode").notNull(),
	vehicleNumber: varchar("vehicle_number", { length: 15 }),
	vehicleType: vehicleType("vehicle_type").default('regular').notNull(),
	transportDocNumber: varchar("transport_doc_number", { length: 20 }),
	transportDocDate: date("transport_doc_date"),
	distanceKm: integer("distance_km").notNull(),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'date' }).notNull(),
	generatedBy: varchar("generated_by", { length: 40 }).notNull(),
	validFrom: timestamp("valid_from", { withTimezone: true, mode: 'date' }).notNull(),
	validUpto: timestamp("valid_upto", { withTimezone: true, mode: 'date' }).notNull(),
	status: ewayStoredStatus().default('active').notNull(),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'date' }),
	cancelReasonCode: cancelReasonCode("cancel_reason_code"),
	cancelRemark: varchar("cancel_remark", { length: 100 }),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("eway_bills_company_id_party_id_idx").using("btree", table.companyId.asc().nullsLast(), table.partyId.asc().nullsLast()),
	index("eway_bills_company_id_status_valid_upto_idx").using("btree", table.companyId.asc().nullsLast(), table.status.asc().nullsLast(), table.validUpto.asc().nullsLast()),
	index("eway_bills_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "eway_bills_company_id_fkey"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "eway_bills_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "eway_bills_document_id_fkey"
		}),
	foreignKey({
			columns: [table.partyId],
			foreignColumns: [parties.id],
			name: "eway_bills_party_id_fkey"
		}),
	foreignKey({
			columns: [table.transporterId],
			foreignColumns: [transporters.id],
			name: "eway_bills_transporter_id_fkey"
		}),
	foreignKey({
			columns: [table.generatedBy],
			foreignColumns: [users.id],
			name: "eway_bills_generated_by_fkey"
		}),
	unique("eway_bills_eway_bill_number_key").on(table.ewayBillNumber),
]);

export const payments = pgTable("payments", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	branchId: varchar("branch_id", { length: 40 }).notNull(),
	number: varchar({ length: 40 }).notNull(),
	direction: paymentDirection().notNull(),
	partyId: varchar("party_id", { length: 40 }).notNull(),
	date: date().notNull(),
	amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
	currency: char({ length: 3 }).notNull(),
	exchangeRate: numeric("exchange_rate", { precision: 18, scale:  8 }).default('1').notNull(),
	method: paymentMethod().notNull(),
	reference: varchar({ length: 100 }),
	accountId: varchar("account_id", { length: 40 }).notNull(),
	unallocatedMinor: bigint("unallocated_minor", { mode: "number" }).default(0).notNull(),
	fxGainLossMinor: bigint("fx_gain_loss_minor", { mode: "number" }),
	notes: text(),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("payments_account_id_idx").using("btree", table.accountId.asc().nullsLast()),
	index("payments_company_id_direction_date_idx").using("btree", table.companyId.asc().nullsLast(), table.direction.asc().nullsLast(), table.date.asc().nullsLast()),
	uniqueIndex("payments_company_id_number_idx").using("btree", table.companyId.asc().nullsLast(), table.number.asc().nullsLast()),
	index("payments_company_id_party_id_date_idx").using("btree", table.companyId.asc().nullsLast(), table.partyId.asc().nullsLast(), table.date.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "payments_company_id_fkey"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "payments_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.partyId],
			foreignColumns: [parties.id],
			name: "payments_party_id_fkey"
		}),
	foreignKey({
			columns: [table.currency],
			foreignColumns: [currencies.code],
			name: "payments_currency_fkey"
		}),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [paymentAccounts.id],
			name: "payments_account_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "payments_created_by_fkey"
		}),
]);

export const ewayBillExtensions = pgTable("eway_bill_extensions", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	ewayBillId: varchar("eway_bill_id", { length: 40 }).notNull(),
	reasonCode: ewayExtendReason("reason_code").notNull(),
	remark: varchar({ length: 100 }),
	transitType: ewayTransitType("transit_type").notNull(),
	currentPlace: varchar("current_place", { length: 100 }).notNull(),
	currentPincode: char("current_pincode", { length: 6 }).notNull(),
	currentStateCode: varchar("current_state_code", { length: 2 }).notNull(),
	remainingDistanceKm: integer("remaining_distance_km").notNull(),
	previousValidUpto: timestamp("previous_valid_upto", { withTimezone: true, mode: 'date' }).notNull(),
	newValidUpto: timestamp("new_valid_upto", { withTimezone: true, mode: 'date' }).notNull(),
	extendedBy: varchar("extended_by", { length: 40 }).notNull(),
	extendedAt: timestamp("extended_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("eway_bill_extensions_eway_bill_id_extended_at_idx").using("btree", table.ewayBillId.asc().nullsLast(), table.extendedAt.asc().nullsLast()),
	foreignKey({
			columns: [table.ewayBillId],
			foreignColumns: [ewayBills.id],
			name: "eway_bill_extensions_eway_bill_id_fkey"
		}),
	foreignKey({
			columns: [table.extendedBy],
			foreignColumns: [users.id],
			name: "eway_bill_extensions_extended_by_fkey"
		}),
]);

export const paymentAllocations = pgTable("payment_allocations", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	paymentId: varchar("payment_id", { length: 40 }).notNull(),
	documentId: varchar("document_id", { length: 40 }).notNull(),
	documentNumber: varchar("document_number", { length: 40 }).notNull(),
	amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("payment_allocations_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
	uniqueIndex("payment_allocations_payment_id_document_id_idx").using("btree", table.paymentId.asc().nullsLast(), table.documentId.asc().nullsLast()),
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "payment_allocations_payment_id_fkey"
		}),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "payment_allocations_document_id_fkey"
		}),
]);

export const expenses = pgTable("expenses", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	branchId: varchar("branch_id", { length: 40 }).notNull(),
	number: varchar({ length: 40 }).notNull(),
	categoryId: varchar("category_id", { length: 40 }).notNull(),
	supplierId: varchar("supplier_id", { length: 40 }),
	date: date().notNull(),
	amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
	currency: char({ length: 3 }).notNull(),
	exchangeRate: numeric("exchange_rate", { precision: 18, scale:  8 }).default('1').notNull(),
	taxCategoryId: varchar("tax_category_id", { length: 40 }),
	taxAmountMinor: bigint("tax_amount_minor", { mode: "number" }).default(0).notNull(),
	taxInclusive: boolean("tax_inclusive").default(true).notNull(),
	accountId: varchar("account_id", { length: 40 }).notNull(),
	method: paymentMethod().notNull(),
	reference: varchar({ length: 100 }),
	notes: text(),
	billable: boolean().default(false).notNull(),
	recurrence: recurrenceFrequency().default('none').notNull(),
	nextRecurrenceDate: date("next_recurrence_date"),
	recurringParentId: varchar("recurring_parent_id", { length: 40 }),
	ocrExtractionId: varchar("ocr_extraction_id", { length: 40 }),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("expenses_company_id_category_id_date_idx").using("btree", table.companyId.asc().nullsLast(), table.categoryId.asc().nullsLast(), table.date.asc().nullsLast()),
	index("expenses_company_id_date_idx").using("btree", table.companyId.asc().nullsLast(), table.date.asc().nullsLast()),
	uniqueIndex("expenses_company_id_number_idx").using("btree", table.companyId.asc().nullsLast(), table.number.asc().nullsLast()),
	index("expenses_next_recurrence_date_idx").using("btree", table.nextRecurrenceDate.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "expenses_company_id_fkey"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "expenses_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [expenseCategories.id],
			name: "expenses_category_id_fkey"
		}),
	foreignKey({
			columns: [table.supplierId],
			foreignColumns: [parties.id],
			name: "expenses_supplier_id_fkey"
		}),
	foreignKey({
			columns: [table.currency],
			foreignColumns: [currencies.code],
			name: "expenses_currency_fkey"
		}),
	foreignKey({
			columns: [table.taxCategoryId],
			foreignColumns: [taxCategories.id],
			name: "expenses_tax_category_id_fkey"
		}),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [paymentAccounts.id],
			name: "expenses_account_id_fkey"
		}),
	foreignKey({
			columns: [table.recurringParentId],
			foreignColumns: [table.id],
			name: "expenses_recurring_parent_id_fkey"
		}),
	foreignKey({
			columns: [table.ocrExtractionId],
			foreignColumns: [ocrExtractions.id],
			name: "expenses_ocr_extraction_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "expenses_created_by_fkey"
		}),
]);

export const ocrLines = pgTable("ocr_lines", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	extractionId: varchar("extraction_id", { length: 40 }).notNull(),
	position: smallint().notNull(),
	name: varchar({ length: 200 }).notNull(),
	quantity: numeric({ precision: 18, scale:  3 }),
	unitPriceMinor: bigint("unit_price_minor", { mode: "number" }),
	confidence: numeric({ precision: 4, scale:  3 }).notNull(),
	matchedItemId: varchar("matched_item_id", { length: 40 }),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.extractionId],
			foreignColumns: [ocrExtractions.id],
			name: "ocr_lines_extraction_id_fkey"
		}),
	foreignKey({
			columns: [table.matchedItemId],
			foreignColumns: [items.id],
			name: "ocr_lines_matched_item_id_fkey"
		}),
]);

export const ocrExtractions = pgTable("ocr_extractions", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	attachmentId: varchar("attachment_id", { length: 40 }).notNull(),
	kind: ocrKind().notNull(),
	status: ocrStatus().default('queued').notNull(),
	provider: varchar({ length: 40 }),
	matchedPartyId: varchar("matched_party_id", { length: 40 }),
	rawResponse: jsonb("raw_response"),
	error: text(),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'date' }),
}, (table): PgTableExtraConfigValue[] => [
	index("ocr_extractions_company_id_status_idx").using("btree", table.companyId.asc().nullsLast(), table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "ocr_extractions_company_id_fkey"
		}),
	foreignKey({
			columns: [table.attachmentId],
			foreignColumns: [attachments.id],
			name: "ocr_extractions_attachment_id_fkey"
		}),
	foreignKey({
			columns: [table.matchedPartyId],
			foreignColumns: [parties.id],
			name: "ocr_extractions_matched_party_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "ocr_extractions_created_by_fkey"
		}),
]);

export const ocrFields = pgTable("ocr_fields", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	extractionId: varchar("extraction_id", { length: 40 }).notNull(),
	key: ocrFieldKey().notNull(),
	label: varchar({ length: 60 }).notNull(),
	value: text(),
	confidence: numeric({ precision: 4, scale:  3 }).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("ocr_fields_extraction_id_key_idx").using("btree", table.extractionId.asc().nullsLast(), table.key.asc().nullsLast()),
	foreignKey({
			columns: [table.extractionId],
			foreignColumns: [ocrExtractions.id],
			name: "ocr_fields_extraction_id_fkey"
		}),
]);

export const messageDeliveries = pgTable("message_deliveries", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	channel: messageChannel().notNull(),
	purpose: varchar({ length: 30 }).notNull(),
	recipient: varchar({ length: 254 }).notNull(),
	partyId: varchar("party_id", { length: 40 }),
	documentId: varchar("document_id", { length: 40 }),
	message: text(),
	includePaymentLink: boolean("include_payment_link").default(false).notNull(),
	provider: varchar({ length: 40 }),
	providerMessageId: varchar("provider_message_id", { length: 200 }),
	status: deliveryStatus().default('queued').notNull(),
	error: text(),
	sentBy: varchar("sent_by", { length: 40 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: 'date' }),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'date' }),
}, (table): PgTableExtraConfigValue[] => [
	index("message_deliveries_company_id_party_id_created_at_idx").using("btree", table.companyId.asc().nullsLast(), table.partyId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
	index("message_deliveries_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "message_deliveries_company_id_fkey"
		}),
	foreignKey({
			columns: [table.partyId],
			foreignColumns: [parties.id],
			name: "message_deliveries_party_id_fkey"
		}),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "message_deliveries_document_id_fkey"
		}),
	foreignKey({
			columns: [table.sentBy],
			foreignColumns: [users.id],
			name: "message_deliveries_sent_by_fkey"
		}),
	unique("message_deliveries_provider_message_id_key").on(table.providerMessageId),
]);

export const exportJobs = pgTable("export_jobs", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	format: exportFormat().notNull(),
	status: jobStatus().default('queued').notNull(),
	trigger: varchar({ length: 20 }).default('manual').notNull(),
	storageKey: varchar("storage_key", { length: 500 }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'date' }),
	error: text(),
	requestedBy: varchar("requested_by", { length: 40 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'date' }),
}, (table): PgTableExtraConfigValue[] => [
	index("export_jobs_company_id_created_at_idx").using("btree", table.companyId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "export_jobs_company_id_fkey"
		}),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [users.id],
			name: "export_jobs_requested_by_fkey"
		}),
]);

export const integrations = pgTable("integrations", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text().notNull(),
	icon: varchar({ length: 40 }).notNull(),
	category: integrationCategory().notNull(),
	configRoute: varchar("config_route", { length: 100 }),
	minPlan: planTier("min_plan").default('free').notNull(),
});

export const syncMutations = pgTable("sync_mutations", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 40 }).notNull(),
	companyId: varchar("company_id", { length: 40 }),
	deviceSessionId: varchar("device_session_id", { length: 40 }),
	method: httpMethod().notNull(),
	path: varchar({ length: 300 }).notNull(),
	body: jsonb(),
	baseVersion: integer("base_version"),
	clientEntityId: varchar("client_entity_id", { length: 60 }),
	status: syncStatus().notNull(),
	result: jsonb(),
	queuedAt: timestamp("queued_at", { withTimezone: true, mode: 'date' }).notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("sync_mutations_user_id_applied_at_idx").using("btree", table.userId.asc().nullsLast(), table.appliedAt.asc().nullsLast()),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "sync_mutations_user_id_fkey"
		}),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "sync_mutations_company_id_fkey"
		}),
	foreignKey({
			columns: [table.deviceSessionId],
			foreignColumns: [deviceSessions.id],
			name: "sync_mutations_device_session_id_fkey"
		}),
]);

export const notifications = pgTable("notifications", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	userId: varchar("user_id", { length: 40 }),
	kind: notificationKind().notNull(),
	title: varchar({ length: 200 }).notNull(),
	body: text().notNull(),
	entityType: varchar("entity_type", { length: 30 }),
	entityId: varchar("entity_id", { length: 40 }),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'date' }),
	clearedAt: timestamp("cleared_at", { withTimezone: true, mode: 'date' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("notifications_company_id_user_id_created_at_idx").using("btree", table.companyId.asc().nullsLast(), table.userId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "notifications_company_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notifications_user_id_fkey"
		}),
]);

export const currencies = pgTable("currencies", {
	code: char({ length: 3 }).primaryKey().notNull(),
	name: varchar({ length: 60 }).notNull(),
	symbol: varchar({ length: 8 }).notNull(),
	minorDigits: smallint("minor_digits").default(2).notNull(),
});

export const webhookEvents = pgTable("webhook_events", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	source: webhookSource().notNull(),
	externalEventId: varchar("external_event_id", { length: 200 }).notNull(),
	eventType: varchar("event_type", { length: 60 }).notNull(),
	signatureValid: boolean("signature_valid").notNull(),
	payload: jsonb().notNull(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'date' }),
	error: text(),
	receivedAt: timestamp("received_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("webhook_events_source_external_event_id_idx").using("btree", table.source.asc().nullsLast(), table.externalEventId.asc().nullsLast()),
]);

export const auditEvents = pgTable("audit_events", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	actorId: varchar("actor_id", { length: 40 }).notNull(),
	actorName: varchar("actor_name", { length: 200 }).notNull(),
	action: varchar({ length: 60 }).notNull(),
	entityType: varchar("entity_type", { length: 30 }).notNull(),
	entityId: varchar("entity_id", { length: 40 }).notNull(),
	entityLabel: varchar("entity_label", { length: 200 }).notNull(),
	before: jsonb(),
	after: jsonb(),
	device: varchar({ length: 100 }),
	ipAddress: inet("ip_address"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("audit_events_company_id_created_at_idx").using("btree", table.companyId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
	index("audit_events_company_id_entity_type_entity_id_idx").using("btree", table.companyId.asc().nullsLast(), table.entityType.asc().nullsLast(), table.entityId.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "audit_events_company_id_fkey"
		}),
	foreignKey({
			columns: [table.actorId],
			foreignColumns: [users.id],
			name: "audit_events_actor_id_fkey"
		}),
]);

export const changeLog = pgTable("change_log", {
	seq: bigserial({ mode: "number" }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	entityType: varchar("entity_type", { length: 30 }).notNull(),
	entityId: varchar("entity_id", { length: 40 }).notNull(),
	op: varchar({ length: 10 }).notNull(),
	version: integer().notNull(),
	changedAt: timestamp("changed_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("change_log_company_id_seq_idx").using("btree", table.companyId.asc().nullsLast(), table.seq.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "change_log_company_id_fkey"
		}),
]);

export const cities = pgTable("cities", {
	id: serial().primaryKey().notNull(),
	countryCode: char("country_code", { length: 2 }).notNull(),
	stateCode: varchar("state_code", { length: 4 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("cities_country_code_state_code_name_idx").using("btree", table.countryCode.asc().nullsLast(), table.stateCode.asc().nullsLast(), table.name.asc().nullsLast()),
	foreignKey({
			columns: [table.countryCode],
			foreignColumns: [countries.code],
			name: "cities_country_code_fkey"
		}),
]);

export const pincodes = pgTable("pincodes", {
	pincode: char({ length: 6 }).primaryKey().notNull(),
	city: varchar({ length: 100 }).notNull(),
	district: varchar({ length: 100 }),
	stateCode: varchar("state_code", { length: 2 }).notNull(),
	latitude: numeric({ precision: 9, scale:  6 }),
	longitude: numeric({ precision: 9, scale:  6 }),
});

export const units = pgTable("units", {
	code: varchar({ length: 10 }).primaryKey().notNull(),
	name: varchar({ length: 40 }).notNull(),
	decimals: smallint().default(0).notNull(),
});

export const gstinLookups = pgTable("gstin_lookups", {
	gstin: varchar({ length: 15 }).primaryKey().notNull(),
	legalName: varchar("legal_name", { length: 200 }),
	tradeName: varchar("trade_name", { length: 200 }),
	status: varchar({ length: 20 }),
	registrationType: gstRegistrationType("registration_type"),
	stateCode: varchar("state_code", { length: 2 }),
	address: jsonb(),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	name: varchar({ length: 200 }).notNull(),
	ownerUserId: varchar("owner_user_id", { length: 40 }),
	/** Set by a platform operator; every user of the account is locked out while set. */
	suspendedAt: timestamp("suspended_at", { withTimezone: true, mode: 'date' }),
	suspendedReason: varchar("suspended_reason", { length: 500 }),
	suspendedBy: varchar("suspended_by", { length: 40 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.ownerUserId],
			foreignColumns: [users.id],
			name: "accounts_owner_user_id_fkey"
		}),
	foreignKey({
			columns: [table.suspendedBy],
			foreignColumns: [users.id],
			name: "accounts_suspended_by_fkey"
		}),
]);

/** Actions platform operators take across tenants. Not tied to a company. */
export const platformAuditEvents = pgTable("platform_audit_events", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	actorId: varchar("actor_id", { length: 40 }).notNull(),
	actorEmail: varchar("actor_email", { length: 254 }).notNull(),
	action: varchar({ length: 60 }).notNull(),
	targetType: varchar("target_type", { length: 30 }).notNull(),
	targetId: varchar("target_id", { length: 40 }).notNull(),
	targetLabel: varchar("target_label", { length: 200 }).notNull(),
	reason: varchar({ length: 500 }).notNull(),
	before: jsonb(),
	after: jsonb(),
	ipAddress: inet("ip_address"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("platform_audit_events_created_at_idx").using("btree", table.createdAt.desc().nullsFirst()),
	index("platform_audit_events_target_type_target_id_idx").using("btree", table.targetType.asc().nullsLast(), table.targetId.asc().nullsLast()),
	index("platform_audit_events_actor_id_idx").using("btree", table.actorId.asc().nullsLast()),
	foreignKey({
			columns: [table.actorId],
			foreignColumns: [users.id],
			name: "platform_audit_events_actor_id_fkey"
		}),
]);

export const companies = pgTable("companies", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	accountId: varchar("account_id", { length: 40 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	legalName: varchar("legal_name", { length: 200 }),
	logoAttachmentId: varchar("logo_attachment_id", { length: 40 }),
	businessType: varchar("business_type", { length: 40 }).notNull(),
	country: char({ length: 2 }).notNull(),
	baseCurrency: char("base_currency", { length: 3 }).notNull(),
	addressLine1: varchar("address_line1", { length: 200 }).notNull(),
	addressLine2: varchar("address_line2", { length: 200 }),
	addressCity: varchar("address_city", { length: 100 }).notNull(),
	addressState: varchar("address_state", { length: 100 }).notNull(),
	addressStateCode: varchar("address_state_code", { length: 2 }),
	addressPostalCode: varchar("address_postal_code", { length: 12 }).notNull(),
	addressCountry: char("address_country", { length: 2 }).notNull(),
	email: varchar({ length: 254 }),
	phone: varchar({ length: 20 }),
	website: varchar({ length: 200 }),
	taxRegime: taxRegime("tax_regime").default('NONE').notNull(),
	taxIdentifier: varchar("tax_identifier", { length: 20 }),
	taxIdentifierLabel: varchar("tax_identifier_label", { length: 20 }).default('GSTIN').notNull(),
	taxRegistered: boolean("tax_registered").default(false).notNull(),
	compositionScheme: boolean("composition_scheme").default(false).notNull(),
	placeOfSupplyStateCode: varchar("place_of_supply_state_code", { length: 2 }),
	// Letter of Undertaking: exports and SEZ supplies are zero-rated while it is valid.
	lutNumber: varchar("lut_number", { length: 40 }),
	lutValidTill: date("lut_valid_till", { mode: 'string' }),
	fiscalYearStartMonth: smallint("fiscal_year_start_month").default(4).notNull(),
	// Off by default: a sale cannot take a tracked item below zero at its branch.
	allowNegativeStock: boolean("allow_negative_stock").default(false).notNull(),
	plan: planTier().default('free').notNull(),
	onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true, mode: 'date' }),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("companies_account_id_idx").using("btree", table.accountId.asc().nullsLast()),
	index("companies_tax_identifier_idx").using("btree", table.taxIdentifier.asc().nullsLast()),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "companies_account_id_fkey"
		}),
	foreignKey({
			columns: [table.logoAttachmentId],
			foreignColumns: [attachments.id],
			name: "companies_logo_attachment_id_fkey"
		}),
	foreignKey({
			columns: [table.country],
			foreignColumns: [countries.code],
			name: "companies_country_fkey"
		}),
	foreignKey({
			columns: [table.baseCurrency],
			foreignColumns: [currencies.code],
			name: "companies_base_currency_fkey"
		}),
]);

export const attachments = pgTable("attachments", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	mimeType: varchar("mime_type", { length: 100 }).notNull(),
	sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
	storageKey: varchar("storage_key", { length: 500 }).notNull(),
	checksumSha256: char("checksum_sha256", { length: 64 }),
	status: attachmentStatus().default('pending').notNull(),
	entityType: varchar("entity_type", { length: 30 }),
	entityId: varchar("entity_id", { length: 40 }),
	uploadedBy: varchar("uploaded_by", { length: 40 }),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("attachments_company_id_entity_type_entity_id_idx").using("btree", table.companyId.asc().nullsLast(), table.entityType.asc().nullsLast(), table.entityId.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "attachments_company_id_fkey"
		}),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [users.id],
			name: "attachments_uploaded_by_fkey"
		}),
]);

export const countries = pgTable("countries", {
	code: char({ length: 2 }).primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	currency: char({ length: 3 }).notNull(),
	taxRegime: taxRegime("tax_regime").notNull(),
	taxIdLabel: varchar("tax_id_label", { length: 20 }).notNull(),
	fiscalYearStartMonth: smallint("fiscal_year_start_month").notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.currency],
			foreignColumns: [currencies.code],
			name: "countries_currency_fkey"
		}),
]);

export const subscriptionEvents = pgTable("subscription_events", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	fromPlan: planTier("from_plan"),
	toPlan: planTier("to_plan"),
	event: varchar({ length: 60 }).notNull(),
	webhookEventId: varchar("webhook_event_id", { length: 40 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "subscription_events_company_id_fkey"
		}),
	foreignKey({
			columns: [table.webhookEventId],
			foreignColumns: [webhookEvents.id],
			name: "subscription_events_webhook_event_id_fkey"
		}),
]);

export const hsnCodes = pgTable("hsn_codes", {
	code: varchar({ length: 8 }).primaryKey().notNull(),
	description: text().notNull(),
	isService: boolean("is_service").default(false).notNull(),
	defaultGstRate: numeric("default_gst_rate", { precision: 6, scale:  3 }),
});

export const expenseCategories = pgTable("expense_categories", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	icon: varchar({ length: 40 }).notNull(),
	color: varchar({ length: 9 }).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("expense_categories_company_id_name_idx").using("btree", table.companyId.asc().nullsLast(), table.name.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "expense_categories_company_id_fkey"
		}),
]);

export const userCompanies = pgTable("user_companies", {
	userId: varchar("user_id", { length: 40 }).notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_companies_user_id_fkey"
		}),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "user_companies_company_id_fkey"
		}),
	primaryKey({ columns: [table.userId, table.companyId], name: "user_companies_pkey"}),
]);

export const userBranches = pgTable("user_branches", {
	userId: varchar("user_id", { length: 40 }).notNull(),
	branchId: varchar("branch_id", { length: 40 }).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_branches_user_id_fkey"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "user_branches_branch_id_fkey"
		}),
	primaryKey({ columns: [table.userId, table.branchId], name: "user_branches_pkey"}),
]);

export const planModules = pgTable("plan_modules", {
	plan: planTier().notNull(),
	module: planModule().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.plan],
			foreignColumns: [plans.key],
			name: "plan_modules_plan_fkey"
		}),
	primaryKey({ columns: [table.plan, table.module], name: "plan_modules_pkey"}),
]);

export const reminderDocuments = pgTable("reminder_documents", {
	deliveryId: varchar("delivery_id", { length: 40 }).notNull(),
	documentId: varchar("document_id", { length: 40 }).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.deliveryId],
			foreignColumns: [messageDeliveries.id],
			name: "reminder_documents_delivery_id_fkey"
		}),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "reminder_documents_document_id_fkey"
		}),
	primaryKey({ columns: [table.deliveryId, table.documentId], name: "reminder_documents_pkey"}),
]);

export const states = pgTable("states", {
	countryCode: char("country_code", { length: 2 }).notNull(),
	code: varchar({ length: 4 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	isUnionTerritory: boolean("is_union_territory").default(false).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.countryCode],
			foreignColumns: [countries.code],
			name: "states_country_code_fkey"
		}),
	primaryKey({ columns: [table.countryCode, table.code], name: "states_pkey"}),
]);

export const clientIdMappings = pgTable("client_id_mappings", {
	clientEntityId: varchar("client_entity_id", { length: 60 }).notNull(),
	userId: varchar("user_id", { length: 40 }).notNull(),
	entityType: varchar("entity_type", { length: 30 }).notNull(),
	serverEntityId: varchar("server_entity_id", { length: 40 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "client_id_mappings_user_id_fkey"
		}),
	primaryKey({ columns: [table.userId, table.clientEntityId], name: "client_id_mappings_pkey"}),
]);

export const companyIntegrations = pgTable("company_integrations", {
	companyId: varchar("company_id", { length: 40 }).notNull(),
	integrationId: varchar("integration_id", { length: 40 }).notNull(),
	connected: boolean().default(false).notNull(),
	config: jsonb(),
	// TODO: failed to parse database type 'bytea'
	credentialsEncrypted: bytea("credentials_encrypted"),
	connectedBy: varchar("connected_by", { length: 40 }),
	connectedAt: timestamp("connected_at", { withTimezone: true, mode: 'date' }),
	disconnectedAt: timestamp("disconnected_at", { withTimezone: true, mode: 'date' }),
}, (table): PgTableExtraConfigValue[] => [
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "company_integrations_company_id_fkey"
		}),
	foreignKey({
			columns: [table.integrationId],
			foreignColumns: [integrations.id],
			name: "company_integrations_integration_id_fkey"
		}),
	foreignKey({
			columns: [table.connectedBy],
			foreignColumns: [users.id],
			name: "company_integrations_connected_by_fkey"
		}),
	primaryKey({ columns: [table.companyId, table.integrationId], name: "company_integrations_pkey"}),
]);

export const idempotencyKeys = pgTable("idempotency_keys", {
	key: uuid().notNull(),
	userId: varchar("user_id", { length: 40 }).notNull(),
	method: httpMethod().notNull(),
	path: varchar({ length: 300 }).notNull(),
	requestHash: char("request_hash", { length: 64 }).notNull(),
	responseStatus: smallint("response_status"),
	responseBody: jsonb("response_body"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'date' }).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("idempotency_keys_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "idempotency_keys_user_id_fkey"
		}),
	primaryKey({ columns: [table.userId, table.key], name: "idempotency_keys_pkey"}),
]);
