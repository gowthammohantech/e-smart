/**
 * The Postgres schema, introspected from docs/database/schema.sql with
 * drizzle-kit and then tidied: timestamps map to Date, money columns are
 * integer minor units held as JS numbers (safe to 2^53), and numeric columns
 * (rates, quantities) stay strings so no float ever touches them.
 *
 * Change the database by editing this file and running
 * `npm run db:generate -w @esmart/db`, which writes a new migration.
 */
import { pgTable, uniqueIndex, foreignKey, varchar, char, boolean, integer, timestamp, index, unique, smallint, inet, bigint, jsonb, numeric, date, text, bigserial, serial, primaryKey, uuid, pgEnum, customType, check, type PgTableExtraConfigValue } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

/** Encrypted secrets. drizzle-kit has no built-in for bytea. */
/** A transaction id: unlike a serial, its order is settled once no older transaction is running. */
const xid8 = customType<{ data: string; driverData: string }>({
	dataType() { return "xid8"; },
});

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
// openingInvoice / openingBill: what a customer owed us, or we owed a supplier, invoice by invoice, when the
// books started here. Payable and aged like an invoice or bill, but they post only to Opening balances.
export const documentKind = pgEnum("document_kind", ['quote', 'proforma', 'salesOrder', 'delivery', 'invoice', 'salesReturn', 'purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn', 'creditNote', 'debitNote', 'supplierCreditNote', 'supplierDebitNote', 'openingInvoice', 'openingBill'])
/** Why a credit or debit note was raised. */
export const noteReason = pgEnum("note_reason", ['discount', 'priceChange', 'taxCorrection', 'deficiency', 'other'])
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
/** Which portal a stored login is for. The two logins can differ, so each has its own row. */
export const compliancePortal = pgEnum("compliance_portal", ['einvoice', 'ewaybill'])
export const itemType = pgEnum("item_type", ['goods', 'service'])
/** How GST treats a supply: nil-rated, exempt and non-GST are each reported on their own. */
export const supplyType = pgEnum("supply_type", ['taxable', 'nil', 'exempt', 'nonGst'])
/** Whether GST on a purchase can be claimed; `blocked` is s.17(5). */
export const itcEligibility = pgEnum("itc_eligibility", ['eligible', 'blocked', 'ineligible'])
export const msmeType = pgEnum("msme_type", ['micro', 'small', 'medium'])
export const returnFrequency = pgEnum("return_frequency", ['monthly', 'qrmp'])
export const jobStatus = pgEnum("job_status", ['queued', 'running', 'completed', 'failed'])
export const linkStatus = pgEnum("link_status", ['active', 'paid', 'expired', 'cancelled'])
export const messageChannel = pgEnum("message_channel", ['whatsapp', 'sms', 'email'])
export const notificationKind = pgEnum("notification_kind", ['invoiceSent', 'paymentReceived', 'invoiceOverdue', 'lowStock', 'compliance', 'syncFailure', 'system'])
export const numberingKind = pgEnum("numbering_kind", ['quote', 'proforma', 'salesOrder', 'delivery', 'invoice', 'salesReturn', 'purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn', 'payment', 'expense', 'creditNote', 'debitNote', 'supplierCreditNote', 'supplierDebitNote', 'selfInvoice', 'journal', 'contra', 'gstJournal', 'tdsChallan', 'receipt', 'gstChallan'])
export const ocrFieldKey = pgEnum("ocr_field_key", ['vendor', 'gstin', 'date', 'amount', 'tax', 'reference', 'category'])
export const ocrKind = pgEnum("ocr_kind", ['expense', 'purchaseBill'])
export const ocrStatus = pgEnum("ocr_status", ['queued', 'processing', 'completed', 'failed'])
export const otpChannel = pgEnum("otp_channel", ['sms', 'whatsapp'])
/** both: one ledger that buys and sells (Sundry Debtors, as Tally); general: a contact with no ledger or documents. */
export const partyKind = pgEnum("party_kind", ['customer', 'supplier', 'both', 'general'])
export const balanceSide = pgEnum("balance_side", ['dr', 'cr'])
/** What a custom field belongs to, and the kind of value it holds. */
export const customFieldEntity = pgEnum("custom_field_entity", ['party', 'item', 'document'])
export const customFieldKind = pgEnum("custom_field_kind", ['text', 'number', 'date', 'select', 'checkbox'])
/** What a monthly AI allowance counts. */
export const aiFeature = pgEnum("ai_feature", ['lixi', 'ocr'])
export const requestStatus = pgEnum("request_status", ['pending', 'approved', 'rejected'])
export const paymentAccountType = pgEnum("payment_account_type", ['cash', 'bank', 'wallet'])
export const paymentDirection = pgEnum("payment_direction", ['received', 'paid'])
export const paymentMethod = pgEnum("payment_method", ['cash', 'bank', 'upi', 'card', 'cheque', 'wallet', 'other'])
export const planModule = pgEnum("plan_module", ['purchases', 'inventory', 'expenses', 'ocr', 'fx', 'branches', 'payables', 'books'])
export const voucherKind = pgEnum("voucher_kind", ['journal', 'contra', 'gstJournal', 'tdsChallan', 'receipt', 'gstChallan'])
/** A draft voucher is kept but not in the books: no number from the series, no postings, until it is posted. */
export const voucherStatus = pgEnum("voucher_status", ['draft', 'posted'])
export const ledgerGroup = pgEnum("ledger_group", ['capital', 'reserves', 'loans', 'sundryCreditors', 'dutiesTaxes', 'provisions', 'currentLiabilities', 'fixedAssets', 'investments', 'sundryDebtors', 'cashInHand', 'bankAccounts', 'stockInHand', 'loansAdvances', 'currentAssets', 'salesAccounts', 'directIncomes', 'indirectIncomes', 'purchaseAccounts', 'directExpenses', 'indirectExpenses'])
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
	/** Wrong passwords since the last good sign-in; five lock the account (see `locked_until`). */
	failedSignInCount: smallint("failed_sign_in_count").default(0).notNull(),
	/** Password sign-in is refused until then. A password reset clears it. */
	lockedUntil: timestamp("locked_until", { withTimezone: true, mode: 'date' }),
	termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true, mode: 'date' }),
	termsVersion: varchar("terms_version", { length: 20 }),
	/** Operators' authenticator secret, AES-GCM with CREDENTIALS_KEY. Set while enrolling; live once `totp_enabled_at` is. */
	totpSecretEncrypted: text("totp_secret_encrypted"),
	totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true, mode: 'date' }),
	/** The last 30-second step a code was accepted for, so a code can't be used twice. */
	totpLastStep: bigint("totp_last_step", { mode: "number" }),
	/** sha256 of each unused recovery code. */
	recoveryCodeHashes: jsonb("recovery_code_hashes").$type<string[]>(),
	/** Notification kinds this person turned off for push (they still appear in the app). */
	pushMuted: jsonb("push_muted").$type<string[]>().default([]).notNull(),
	/** They turned off "Share usage data": nothing about them goes to product analytics. */
	analyticsOptOut: boolean("analytics_opt_out").default(false).notNull(),
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
	// Many accounts may list the same number; only one can have it verified, and only that one signs in with it.
	uniqueIndex("users_verified_phone_idx").using("btree", table.phone.asc().nullsLast()).where(sql`${table.phoneVerifiedAt} IS NOT NULL`),
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
	/**
	 * Set only when the invitee already has an account of their own: the access
	 * they are offered in the inviter's businesses. Granted on accept, not before.
	 */
	role: userRole(),
	companyIds: jsonb("company_ids").$type<string[]>(),
	branchIds: jsonb("branch_ids").$type<string[]>(),
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
	/** When this session passed the authenticator check. Platform routes need it; tenant routes don't. */
	mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true, mode: 'date' }),
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
	openingBalanceDate: date("opening_balance_date"),
	// A foreign-currency account: its opening balance's rate to base on that day, so totals in base agree everywhere.
	openingRate: numeric("opening_rate", { precision: 18, scale:  8 }).default('1').notNull(),
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

/** What a tax category charged before its current rate, for documents dated back then. */
export const taxCategoryRates = pgTable("tax_category_rates", {
	taxCategoryId: varchar("tax_category_id", { length: 40 }).notNull(),
	effectiveFrom: date("effective_from").notNull(),
	rate: numeric({ precision: 6, scale:  3 }).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	primaryKey({ columns: [table.taxCategoryId, table.effectiveFrom], name: "tax_category_rates_pkey" }),
	foreignKey({
			columns: [table.taxCategoryId],
			foreignColumns: [taxCategories.id],
			name: "tax_category_rates_tax_category_id_fkey"
		}).onDelete("cascade"),
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
	ewbUsername: varchar("ewb_username", { length: 100 }),
	irpClientIdMasked: varchar("irp_client_id_masked", { length: 40 }),
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
	companyId: varchar("company_id", { length: 40 }).notNull(),
	portal: compliancePortal().default('einvoice').notNull(),
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
	primaryKey({ columns: [table.companyId, table.portal], name: "compliance_credentials_pkey" }),
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
	// GST treatment, copied onto each document line when it is used.
	supplyType: supplyType("supply_type").default('taxable').notNull(),
	reimbursement: boolean().default(false).notNull(),
	capitalGoods: boolean("capital_goods").default(false).notNull(),
	itcEligibility: itcEligibility("itc_eligibility").default('eligible').notNull(),
	reverseCharge: boolean("reverse_charge").default(false).notNull(),
	cessRate: numeric("cess_rate", { precision: 6, scale:  3 }).default('0').notNull(),
	openingStock: numeric("opening_stock", { precision: 18, scale:  3 }).default('0').notNull(),
	openingStockDate: date("opening_stock_date"),
	reorderLevel: numeric("reorder_level", { precision: 18, scale:  3 }).default('0').notNull(),
	imageAttachmentId: varchar("image_attachment_id", { length: 40 }),
	categoryId: varchar("category_id", { length: 40 }),
	brandId: varchar("brand_id", { length: 40 }),
	status: activeStatus().default('active').notNull(),
	version: integer().default(1).notNull(),
	// Values of the company's custom fields, by field id.
	customFields: jsonb("custom_fields").default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("items_company_id_barcode_idx").using("btree", table.companyId.asc().nullsLast(), table.barcode.asc().nullsLast()),
	uniqueIndex("items_company_id_sku_idx").using("btree", table.companyId.asc().nullsLast(), table.sku.asc().nullsLast()),
	index("items_company_id_status_idx").using("btree", table.companyId.asc().nullsLast(), table.status.asc().nullsLast()),
	index("items_company_id_category_id_idx").using("btree", table.companyId.asc().nullsLast(), table.categoryId.asc().nullsLast()),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [itemCategories.id],
			name: "items_category_id_fkey"
		}),
	foreignKey({
			columns: [table.brandId],
			foreignColumns: [brands.id],
			name: "items_brand_id_fkey"
		}),
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
	// The whole document is under reverse charge: the buyer pays the GST.
	reverseCharge: boolean("reverse_charge").default(false).notNull(),
	// The party's GSTIN and state as they were when the document was finalised.
	partyGstin: varchar("party_gstin", { length: 15 }),
	partyStateCode: varchar("party_state_code", { length: 2 }),
	notes: text(),
	terms: text(),
	sourceDocumentId: varchar("source_document_id", { length: 40 }),
	noteReason: noteReason("note_reason"),
	// A direct note (no source document): 'withGst' (s.34, the default) or 'noGst' (a financial or
	// commercial note: no tax, posted to discount, out of the returns).
	noteGst: varchar("note_gst", { length: 8 }),
	// A direct note with GST: the original invoice or bill it adjusts, for GSTR-1 CDNR/CDNUR and the s.34 deadline.
	originalNumber: varchar("original_number", { length: 40 }),
	originalDate: date("original_date"),
	// An import bill's bill of entry: { number, date, portCode, assessableMinor, igstMinor, cessMinor }. IGST paid at customs.
	billOfEntry: jsonb("bill_of_entry"),
	// A bill from the business's Input Service Distributor: its credit goes to 3B 4A(4).
	isdInvoice: boolean("isd_invoice").default(false).notNull(),
	// TDS deducted on a supplier's bill; what's owed them is the grand total less this.
	tdsSection: varchar("tds_section", { length: 8 }),
	tdsRate: numeric("tds_rate", { precision: 6, scale:  3 }),
	tdsAmountMinor: bigint("tds_amount_minor", { mode: "number" }).default(0).notNull(),
	// Rule 46(f): a reverse-charge purchase from an unregistered supplier.
	selfInvoiceNumber: varchar("self_invoice_number", { length: 40 }),
	// Credit reversed after 180 days unpaid (Rule 37), and claimed again once paid.
	// The GSTR-2B period (MMYYYY) whose line this bill was matched to: its credit is claimed then.
	itcClaimPeriod: char("itc_claim_period", { length: 6 }),
	// The project or department the document belongs to, for profit by cost centre.
	costCentreId: varchar("cost_centre_id", { length: 40 }),
	// A recurring invoice is its own template: the scheduler issues a copy on each next date
	// (invoices.recur); each copy points back here through recurring_parent_id.
	recurrence: recurrenceFrequency().default('none').notNull(),
	nextRecurrenceDate: date("next_recurrence_date"),
	recurrenceEndDate: date("recurrence_end_date"),
	recurrenceAutoSend: boolean("recurrence_auto_send").default(false).notNull(),
	recurringParentId: varchar("recurring_parent_id", { length: 40 }),
	// This document's own printed layout (core render/invoiceTemplate), over the company's; null takes the company's.
	printLayout: varchar("print_layout", { length: 16 }),
	itcReversedOn: date("itc_reversed_on"),
	itcReclaimedOn: date("itc_reclaimed_on"),
	subtotalMinor: bigint("subtotal_minor", { mode: "number" }).default(0).notNull(),
	lineDiscountMinor: bigint("line_discount_minor", { mode: "number" }).default(0).notNull(),
	documentDiscountMinor: bigint("document_discount_minor", { mode: "number" }).default(0).notNull(),
	taxableAmountMinor: bigint("taxable_amount_minor", { mode: "number" }).default(0).notNull(),
	totalTaxMinor: bigint("total_tax_minor", { mode: "number" }).default(0).notNull(),
	// Tax the buyer pays under reverse charge, and pure-agent reimbursements: neither is taxable value.
	reverseChargeTaxMinor: bigint("reverse_charge_tax_minor", { mode: "number" }).default(0).notNull(),
	reimbursementsMinor: bigint("reimbursements_minor", { mode: "number" }).default(0).notNull(),
	roundOffMinor: bigint("round_off_minor", { mode: "number" }).default(0).notNull(),
	grandTotalMinor: bigint("grand_total_minor", { mode: "number" }).default(0).notNull(),
	grandTotalBaseMinor: bigint("grand_total_base_minor", { mode: "number" }).default(0).notNull(),
	amountPaidMinor: bigint("amount_paid_minor", { mode: "number" }).default(0).notNull(),
	currentEwayBillId: varchar("current_eway_bill_id", { length: 40 }),
	/** When the team was told this invoice fell overdue, so they're told once. */
	overdueNotifiedAt: timestamp("overdue_notified_at", { withTimezone: true, mode: 'date' }),
	complianceLastMessage: text("compliance_last_message"),
	complianceLastAttemptAt: timestamp("compliance_last_attempt_at", { withTimezone: true, mode: 'date' }),
	finalizedAt: timestamp("finalized_at", { withTimezone: true, mode: 'date' }),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	version: integer().default(1).notNull(),
	// Values of the company's custom fields, by field id.
	customFields: jsonb("custom_fields").default({}).notNull(),
	// Waiting for, approved or rejected by an owner or admin: { status, requestedBy, requestedAt, decidedBy?, decidedAt?, note? }.
	approval: jsonb(),
	// TCS collected on a sale (s.206C): its section and rate; the amount is in the totals.
	tcsSection: varchar("tcs_section", { length: 20 }),
	tcsRate: numeric("tcs_rate", { precision: 5, scale: 2 }),
	// The vehicle it moved on or was for.
	vehicleId: varchar("vehicle_id", { length: 40 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("documents_company_id_branch_id_date_idx").using("btree", table.companyId.asc().nullsLast(), table.branchId.asc().nullsLast(), table.date.asc().nullsLast()),
	index("documents_company_id_kind_number_idx").using("btree", table.companyId.asc().nullsLast(), table.kind.asc().nullsLast(), table.number.asc().nullsLast()),
	// Drafts, and drafts cancelled before numbering, all carry `KIND-DRAFT`.
	uniqueIndex("documents_company_id_kind_number_issued_key").using("btree", table.companyId.asc().nullsLast(), table.kind.asc().nullsLast(), table.number.asc().nullsLast()).where(sql`${table.number} NOT LIKE '%-DRAFT'`),
	index("documents_company_id_kind_status_date_idx").using("btree", table.companyId.asc().nullsLast(), table.kind.asc().nullsLast(), table.status.asc().nullsLast(), table.date.asc().nullsLast()),
	index("documents_company_id_party_id_date_idx").using("btree", table.companyId.asc().nullsLast(), table.partyId.asc().nullsLast(), table.date.asc().nullsLast()),
	index("documents_source_document_id_idx").using("btree", table.sourceDocumentId.asc().nullsLast()),
	index("documents_next_recurrence_date_idx").using("btree", table.nextRecurrenceDate.asc().nullsLast()),
	index("documents_recurring_parent_id_date_idx").using("btree", table.recurringParentId.asc().nullsLast(), table.date.asc().nullsLast()),
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
	check("documents_print_layout_check", sql`${table.printLayout} IN ('standard', 'classic', 'detailed', 'modern')`),
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
	// The item's GST treatment when the line was written.
	supplyType: supplyType("supply_type").default('taxable').notNull(),
	reimbursement: boolean().default(false).notNull(),
	// A reimbursement line: the billable expense it recovers.
	expenseId: varchar("expense_id", { length: 40 }),
	capitalGoods: boolean("capital_goods").default(false).notNull(),
	itcEligibility: itcEligibility("itc_eligibility").default('eligible').notNull(),
	reverseCharge: boolean("reverse_charge").default(false).notNull(),
	cessRate: numeric("cess_rate", { precision: 6, scale:  3 }).default('0').notNull(),
	lineTotalMinor: bigint("line_total_minor", { mode: "number" }).default(0).notNull(),
	// A purchase line's own cost centre (non-stock lines only); null takes the document's.
	costCentreId: varchar("cost_centre_id", { length: 40 }),
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
	reverseCharge: boolean("reverse_charge").default(false).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	// Not unique: one category can have a forward-charge and a reverse-charge row, or two cess rates.
	index("document_tax_lines_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
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
	pan: varchar({ length: 10 }),
	msmeType: msmeType("msme_type"),
	udyamNumber: varchar("udyam_number", { length: 19 }),
	// Bills from this supplier are under reverse charge unless a line says otherwise.
	reverseCharge: boolean("reverse_charge").default(false).notNull(),
	// The TDS section their bills fall under by default, and any lower deduction certificate (s.197).
	tdsSection: varchar("tds_section", { length: 8 }),
	lowerTdsRate: numeric("lower_tds_rate", { precision: 6, scale:  3 }),
	lowerTdsValidTill: date("lower_tds_valid_till"),
	// Sales to this customer collect TCS by default, under this section (s.206C).
	tcsApplicable: boolean("tcs_applicable").default(false).notNull(),
	tcsSection: varchar("tcs_section", { length: 20 }),
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
	// Which side the opening balance is on; unset is the kind's usual side (customer Dr, supplier Cr).
	openingBalanceSide: balanceSide("opening_balance_side"),
	// The day the opening balance stands at; unset reads as the start of the books.
	openingBalanceDate: date("opening_balance_date", { mode: 'string' }),
	paymentTermsDays: smallint("payment_terms_days").default(0).notNull(),
	notes: text(),
	status: activeStatus().default('active').notNull(),
	version: integer().default(1).notNull(),
	// Values of the company's custom fields, by field id.
	customFields: jsonb("custom_fields").default({}).notNull(),
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
	// An advance for services carries GST when received (s.13): its rate and place of supply.
	advanceTaxCategoryId: varchar("advance_tax_category_id", { length: 40 }),
	advanceTaxRate: numeric("advance_tax_rate", { precision: 6, scale:  3 }),
	advancePlaceOfSupply: varchar("advance_place_of_supply", { length: 2 }),
	// The advance's SAC (or HSN) and cess rate, for GSTR-1 table 11 and the receipt voucher (Rule 50).
	advanceHsn: varchar("advance_hsn", { length: 8 }),
	advanceCessRate: numeric("advance_cess_rate", { precision: 6, scale:  3 }),
	// On money received: TDS the customer deducted from an advance, before any invoice (under tds_section).
	tdsMinor: bigint("tds_minor", { mode: "number" }).default(0).notNull(),
	// Money paid back to a customer out of an advance they paid: the receipt it refunds (Rule 51).
	refundOfPaymentId: varchar("refund_of_payment_id", { length: 40 }),
	// On money paid: the TDS section of what its allocations kept back, so it goes to that section's payable and 26Q.
	tdsSection: varchar("tds_section", { length: 8 }),
	notes: text(),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("payments_account_id_idx").using("btree", table.accountId.asc().nullsLast()),
	index("payments_refund_of_payment_id_idx").using("btree", table.refundOfPaymentId.asc().nullsLast()),
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
	// Cash: what the payment itself settles. The three below settle the document without money moving.
	amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
	tdsMinor: bigint("tds_minor", { mode: "number" }).default(0).notNull(),
	discountMinor: bigint("discount_minor", { mode: "number" }).default(0).notNull(),
	writeOffMinor: bigint("write_off_minor", { mode: "number" }).default(0).notNull(),
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
	placeOfSupplyStateCode: varchar("place_of_supply_state_code", { length: 2 }),
	supplierGstin: varchar("supplier_gstin", { length: 15 }),
	itcEligibility: itcEligibility("itc_eligibility").default('eligible').notNull(),
	// The tax is paid by the business under reverse charge, not to the supplier.
	reverseCharge: boolean("reverse_charge").default(false).notNull(),
	accountId: varchar("account_id", { length: 40 }).notNull(),
	method: paymentMethod().notNull(),
	reference: varchar({ length: 100 }),
	notes: text(),
	billable: boolean().default(false).notNull(),
	// Billable: the customer it is recovered from.
	customerId: varchar("customer_id", { length: 40 }),
	costCentreId: varchar("cost_centre_id", { length: 40 }),
	recurrence: recurrenceFrequency().default('none').notNull(),
	nextRecurrenceDate: date("next_recurrence_date"),
	recurringParentId: varchar("recurring_parent_id", { length: 40 }),
	ocrExtractionId: varchar("ocr_extraction_id", { length: 40 }),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	version: integer().default(1).notNull(),
	// The vehicle it was spent on (fuel, repairs, tolls).
	vehicleId: varchar("vehicle_id", { length: 40 }),
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
	txId: xid8("tx_id").default(sql`pg_current_xact_id()`).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("change_log_tx_id_seq_idx").using("btree", table.txId.asc().nullsLast(), table.seq.asc().nullsLast()),
	index("change_log_company_id_seq_idx").using("btree", table.companyId.asc().nullsLast(), table.seq.asc().nullsLast()),
	// A first sync takes each entity's latest change (DISTINCT ON, newest first): read straight off this, no sort.
	index("change_log_company_entity_latest_idx").using("btree", table.companyId.asc().nullsLast(), table.entityType.asc().nullsLast(), table.entityId.asc().nullsLast(), table.txId.desc().nullsFirst(), table.seq.desc().nullsFirst()),
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
	// What a quantity is printed with, like "5 Nos".
	shortName: varchar("short_name", { length: 10 }),
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
	/**
	 * Set when the last person on the account deleted it. The books are kept until then because GST law
	 * requires them (72 months from the annual return's due date, so 8 years is safe), then erased.
	 */
	purgeAfter: timestamp("purge_after", { withTimezone: true, mode: 'date' }),
	/**
	 * The public "Give it a try" account: every user of it is read-only (the API refuses anything but reads),
	 * background jobs leave its businesses alone, and the seeder rebuilds it (packages/db/src/demo/public).
	 */
	isDemo: boolean("is_demo").default(false).notNull(),
	/** Which dataset version the demo seeder last wrote, and when; a newer version or a stale date rebuilds it. */
	demoSeedVersion: integer("demo_seed_version"),
	demoSeededAt: timestamp("demo_seeded_at", { withTimezone: true, mode: 'date' }),
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
	returnFrequency: returnFrequency("return_frequency").default('monthly').notNull(),
	fiscalYearStartMonth: smallint("fiscal_year_start_month").default(4).notNull(),
	// Modules the owner switched off within the plan; their records stay.
	disabledModules: jsonb("disabled_modules").default([]).notNull(),
	// Documents over these amounts wait for an owner or admin: [{ kind, overMinor }] in base currency.
	approvalRules: jsonb("approval_rules").default([]).notNull(),
	// How its documents look (core render/invoiceTemplate); unset is the standard page.
	invoiceTemplate: jsonb("invoice_template"),
	// Lixi messages and bill scans a month together; unset takes the plan's allowance.
	aiMonthlyLimit: integer("ai_monthly_limit"),
	lockedThroughDate: date("locked_through_date"),
	// Perpetual stock from this day, the start of a financial year: receipts and issues post to stock
	// at cost, and the goods sold to Cost of goods sold. Null keeps the books periodic (RULES 6.2).
	perpetualStockFrom: date("perpetual_stock_from"),
	// How stock is costed as it goes out (RULES 6.2): moving weighted average, or first in, first out.
	stockCosting: varchar("stock_costing", { length: 8 }).default('average').notNull(),
	// Off by default: a sale cannot take a tracked item below zero at its branch.
	allowNegativeStock: boolean("allow_negative_stock").default(false).notNull(),
	// RBI's bank rate (percent) for MSME late-payment interest, three times it (MSMED Act s.16).
	msmeBankRate: numeric("msme_bank_rate", { precision: 5, scale: 2 }).default('5.5').notNull(),
	// How many days apart a 2B line and a bill with the same amounts may be dated and still be claimed without a person.
	gstr2bDateToleranceDays: smallint("gstr2b_date_tolerance_days").default(3).notNull(),
	// With a TAN the business deducts TDS on what it pays suppliers.
	tan: varchar({ length: 10 }),
	// The bank account customers pay into, printed on invoices (with a UPI QR when upiId is set).
	bankName: varchar("bank_name", { length: 100 }),
	bankAccountName: varchar("bank_account_name", { length: 100 }),
	bankAccountNumber: varchar("bank_account_number", { length: 34 }),
	bankIfsc: varchar("bank_ifsc", { length: 11 }),
	bankBranch: varchar("bank_branch", { length: 100 }),
	upiId: varchar("upi_id", { length: 100 }),
	// The authorised signatory's signature, printed above that line on documents.
	signatureAttachmentId: varchar("signature_attachment_id", { length: 40 }),
	plan: planTier().default('free').notNull(),
	onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true, mode: 'date' }),
	// An owner closed this business: its books are read-only and kept until purge_after (GST law's
	// 72 months), then erased. Restoring it before then clears all three.
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'date' }),
	archivedBy: varchar("archived_by", { length: 40 }),
	purgeAfter: timestamp("purge_after", { withTimezone: true, mode: 'date' }),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("companies_account_id_idx").using("btree", table.accountId.asc().nullsLast()),
	index("companies_purge_after_idx").using("btree", table.purgeAfter.asc().nullsLast()),
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
			columns: [table.signatureAttachmentId],
			foreignColumns: [attachments.id],
			name: "companies_signature_attachment_id_fkey"
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

/** A company's own grouping of its items, for the catalogue and its filters. */
export const itemCategories = pgTable("item_categories", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	color: varchar({ length: 9 }).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("item_categories_company_id_name_idx").using("btree", table.companyId.asc().nullsLast(), table.name.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "item_categories_company_id_fkey"
		}),
]);

/** A field of a company's own on its contacts, items or documents. Values live with the records, keyed by this id. */
export const customFields = pgTable("custom_fields", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	entity: customFieldEntity().notNull(),
	label: varchar({ length: 60 }).notNull(),
	kind: customFieldKind().notNull(),
	// A select's choices, in order.
	options: jsonb().default([]).notNull(),
	required: boolean().default(false).notNull(),
	// Printed on the document's PDF (document fields), or on documents to the party (party fields).
	showOnPdf: boolean("show_on_pdf").default(false).notNull(),
	position: smallint().default(0).notNull(),
	status: activeStatus().default('active').notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("custom_fields_company_id_entity_label_idx").using("btree", table.companyId.asc().nullsLast(), table.entity.asc().nullsLast(), table.label.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "custom_fields_company_id_fkey"
		}),
]);

/** A company's vehicles, to tag what is spent on each and what each carries. */
export const vehicles = pgTable("vehicles", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	// As on the registration certificate, without spaces: TN09AB1234.
	registration: varchar({ length: 20 }).notNull(),
	name: varchar({ length: 100 }),
	status: activeStatus().default('active').notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("vehicles_company_id_registration_idx").using("btree", table.companyId.asc().nullsLast(), table.registration.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "vehicles_company_id_fkey"
		}),
]);

/** A journal kept to reuse: its kind, narration and lines; amounts may be left for each use. */
export const voucherTemplates = pgTable("voucher_templates", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	kind: voucherKind().notNull(),
	narration: text(),
	lines: jsonb().notNull(),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("voucher_templates_company_id_name_idx").using("btree", table.companyId.asc().nullsLast(), table.name.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "voucher_templates_company_id_fkey"
		}),
]);

/** Lixi messages and bill scans used by a company in a month, against its allowance. */
export const aiUsage = pgTable("ai_usage", {
	companyId: varchar("company_id", { length: 40 }).notNull(),
	// YYYY-MM, in India time.
	month: char({ length: 7 }).notNull(),
	feature: aiFeature().notNull(),
	count: integer().default(0).notNull(),
	// What the model calls behind those actions took, for the platform's own costing.
	inputTokens: bigint("input_tokens", { mode: "number" }).default(0).notNull(),
	outputTokens: bigint("output_tokens", { mode: "number" }).default(0).notNull(),
	// US dollars × 1,000,000, as the provider reported it (OpenRouter does; others leave it 0).
	costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).default(0).notNull(),
}, (table): PgTableExtraConfigValue[] => [
	primaryKey({ columns: [table.companyId, table.month, table.feature], name: "ai_usage_pkey" }),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "ai_usage_company_id_fkey"
		}),
]);

/** A payment over an approval rule, held until an owner or admin approves it into a payment. */
export const paymentRequests = pgTable("payment_requests", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	// The payment as it was asked for (the createPayment body).
	body: jsonb().notNull(),
	partyId: varchar("party_id", { length: 40 }).notNull(),
	direction: varchar({ length: 10 }).notNull(),
	amountBaseMinor: bigint("amount_base_minor", { mode: "number" }).notNull(),
	status: requestStatus().default('pending').notNull(),
	requestedBy: varchar("requested_by", { length: 40 }).notNull(),
	decidedBy: varchar("decided_by", { length: 40 }),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'date' }),
	note: text(),
	paymentId: varchar("payment_id", { length: 40 }),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("payment_requests_company_id_status_idx").using("btree", table.companyId.asc().nullsLast(), table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "payment_requests_company_id_fkey"
		}),
]);

export const brands = pgTable("brands", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("brands_company_id_name_idx").using("btree", table.companyId.asc().nullsLast(), table.name.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "brands_company_id_fkey"
		}),
]);

export const userCompanies = pgTable("user_companies", {
	userId: varchar("user_id", { length: 40 }).notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	/** The role in this business when it differs from the user's own (someone invited from another account). */
	role: userRole(),
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

export const backgroundJobStatus = pgEnum("background_job_status", ['queued', 'running', 'done', 'dead'])

/**
 * Work the API does in the background (apps/api/src/jobs): scheduled tasks, slow exports, pushes.
 * A worker claims a due row with SKIP LOCKED and holds it for `locked_until`; one that dies mid-job
 * lets the lease run out and another picks it up. `unique_key` stops the same piece of work being
 * queued twice while one is still waiting or running (a scheduled period, one company's backup).
 */
export const jobs = pgTable("jobs", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	kind: varchar({ length: 60 }).notNull(),
	payload: jsonb().default({}).notNull(),
	status: backgroundJobStatus().default('queued').notNull(),
	runAt: timestamp("run_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	attempts: smallint().default(0).notNull(),
	maxAttempts: smallint("max_attempts").default(5).notNull(),
	lockedUntil: timestamp("locked_until", { withTimezone: true, mode: 'date' }),
	lastError: text("last_error"),
	uniqueKey: varchar("unique_key", { length: 200 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'date' }),
}, (table): PgTableExtraConfigValue[] => [
	index("jobs_due_idx").using("btree", table.status.asc().nullsLast(), table.runAt.asc().nullsLast()),
	uniqueIndex("jobs_unique_key_idx").using("btree", table.uniqueKey.asc().nullsLast()).where(sql`${table.uniqueKey} IS NOT NULL AND ${table.status} IN ('queued', 'running')`),
]);

/**
 * One row per scheduled period that was queued ("recurring-expenses:2026-11-03"). The primary key is
 * what makes every API instance's scheduler safe to run at once: only the first insert queues the job.
 */
export const jobScheduleRuns = pgTable("job_schedule_runs", {
	key: varchar({ length: 200 }).primaryKey().notNull(),
	jobId: varchar("job_id", { length: 40 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const complianceAttemptStatus = pgEnum("compliance_attempt_status", ['pending', 'settled', 'failed'])

/**
 * A portal call whose answer may have been lost: an e-way bill generate or an IRN cancel that got no
 * reply. Written before the call, settled with its result; one still pending after a timeout is
 * reconciled by asking the portal what it holds (apps/api/src/modules/compliance/recovery.ts).
 */
export const complianceAttempts = pgTable("compliance_attempts", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	documentId: varchar("document_id", { length: 40 }).notNull(),
	operation: varchar({ length: 30 }).notNull(),
	status: complianceAttemptStatus().default('pending').notNull(),
	/** What the call was, so it can be settled without the request: the input, the payload, the IRN. */
	request: jsonb().notNull(),
	actorId: varchar("actor_id", { length: 40 }).notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: 'date' }),
	settledAt: timestamp("settled_at", { withTimezone: true, mode: 'date' }),
	lastError: text("last_error"),
}, (table): PgTableExtraConfigValue[] => [
	index("compliance_attempts_pending_idx").using("btree", table.status.asc().nullsLast(), table.startedAt.asc().nullsLast()),
	// One open attempt per document and operation: a second generate waits for the first to settle.
	uniqueIndex("compliance_attempts_open_idx").using("btree", table.documentId.asc().nullsLast(), table.operation.asc().nullsLast()).where(sql`${table.status} = 'pending'`),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "compliance_attempts_company_id_fkey"
		}),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "compliance_attempts_document_id_fkey"
		}),
]);

/**
 * Accounts a business adds itself (rent, a loan, a fixed asset). System accounts and the ones that
 * mirror parties, cash and bank accounts and expense categories are derived, never stored
 * (packages/core/src/domain/ledger/accounts.ts).
 */
export const ledgerAccounts = pgTable("ledger_accounts", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	group: ledgerGroup().notNull(),
	// Debit positive, as of the day the books begin.
	openingBalanceMinor: bigint("opening_balance_minor", { mode: "number" }).default(0).notNull(),
	// The day the opening balance stands at; unset reads as the start of the books.
	openingBalanceDate: date("opening_balance_date", { mode: 'string' }),
	status: activeStatus().default('active').notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("ledger_accounts_company_id_name_idx").using("btree", table.companyId.asc().nullsLast(), table.name.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "ledger_accounts_company_id_fkey"
		}),
]);

/** Projects, departments and the like: income and costs can be tagged with one, for profit by cost centre. */
export const costCentres = pgTable("cost_centres", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	// What kind of centre: "Project", "Department"…
	category: varchar({ length: 60 }),
	parentId: varchar("parent_id", { length: 40 }),
	status: activeStatus().default('active').notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("cost_centres_company_id_name_idx").using("btree", table.companyId.asc().nullsLast(), table.name.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "cost_centres_company_id_fkey"
		}),
]);

/**
 * The fixed asset register (RULES 6.15). Each asset's cost is in the books already, posted by the bill
 * or voucher it was bought on, to `account` (`sys:fixedAssets` or a fixed-asset ledger account). Its
 * depreciation and disposal are worked out from the register and posted, never stored: by `method`,
 * `slm` (straight line, cost less residual over `life_months` from `in_use_from`) or `wdv` (written down
 * value, `rate` percent a year on what is left), by the day, at each month's end.
 */
export const fixedAssets = pgTable("fixed_assets", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	branchId: varchar("branch_id", { length: 40 }),
	name: varchar({ length: 200 }).notNull(),
	// What kind of asset: "Computers", "Vehicles", "Plant and machinery"…
	category: varchar({ length: 60 }),
	// The ledger account its cost sits in, by key.
	account: varchar({ length: 80 }).default('sys:fixedAssets').notNull(),
	assetCode: varchar("asset_code", { length: 60 }),
	acquiredOn: date("acquired_on").notNull(),
	inUseFrom: date("in_use_from").notNull(),
	costMinor: bigint("cost_minor", { mode: "number" }).notNull(),
	residualMinor: bigint("residual_minor", { mode: "number" }).default(0).notNull(),
	method: varchar({ length: 8 }).default('slm').notNull(),
	lifeMonths: integer("life_months"),
	rate: numeric({ precision: 7, scale: 4 }),
	// Bought before the books began here: depreciation already written off by `opening_as_of`.
	openingDepreciationMinor: bigint("opening_depreciation_minor", { mode: "number" }).default(0).notNull(),
	openingAsOf: date("opening_as_of"),
	// Where it came from, when bought on a bill here.
	sourceDocumentId: varchar("source_document_id", { length: 40 }),
	costCentreId: varchar("cost_centre_id", { length: 40 }),
	disposedOn: date("disposed_on"),
	disposalNote: text("disposal_note"),
	notes: text(),
	version: integer().default(1).notNull(),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("fixed_assets_company_id_idx").using("btree", table.companyId.asc().nullsLast()),
	uniqueIndex("fixed_assets_company_id_asset_code_idx").using("btree", table.companyId.asc().nullsLast(), table.assetCode.asc().nullsLast()).where(sql`${table.assetCode} IS NOT NULL`),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "fixed_assets_company_id_fkey"
		}),
	check("fixed_assets_method_check", sql`${table.method} IN ('slm', 'wdv')`),
]);

/**
 * Budgets (RULES 6.16): what the business plans to earn and spend on each income and expense account,
 * month by month over a financial year, for the whole business or one branch or cost centre. `lines`
 * is `[{ account, months: [12 base-currency paise amounts, from the year's first month] }]`.
 */
export const budgets = pgTable("budgets", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	// The first day of the financial year it is for.
	yearFrom: date("year_from").notNull(),
	branchId: varchar("branch_id", { length: 40 }),
	costCentreId: varchar("cost_centre_id", { length: 40 }),
	lines: jsonb().default([]).notNull(),
	notes: text(),
	version: integer().default(1).notNull(),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("budgets_company_id_name_idx").using("btree", table.companyId.asc().nullsLast(), table.name.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "budgets_company_id_fkey"
		}),
]);

/**
 * Journal, contra, GST journal, TDS challan and receipt vouchers. Lines name accounts by key
 * (`pay:<id>`, `sys:sales`…) and are base-currency paise: `[{ account, debitMinor, creditMinor, narration? }]`.
 */
export const vouchers = pgTable("vouchers", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	branchId: varchar("branch_id", { length: 40 }).notNull(),
	kind: voucherKind().notNull(),
	// A draft's number is its id until it is posted, which keeps the per-kind number index unique.
	number: varchar({ length: 40 }).notNull(),
	status: voucherStatus().default('posted').notNull(),
	postedAt: timestamp("posted_at", { withTimezone: true, mode: 'date' }),
	postedBy: varchar("posted_by", { length: 40 }),
	date: date().notNull(),
	narration: text(),
	reference: varchar({ length: 100 }),
	lines: jsonb().notNull(),
	// A TDS challan's deposit details: `{ bsrCode, serial, depositedOn }`, for the challan register and 26Q.
	challan: jsonb(),
	// A receipt's payer, when it is a party (for reference; the ledger lines are what post).
	partyId: varchar("party_id", { length: 40 }),
	// A GST challan's (PMT-06) deposit: `{ cpin, cin?, brn?, depositedOn, heads: { igst: { tax, interest, penalty, fee, others } … } }` in paise.
	gstChallan: jsonb("gst_challan"),
	// A GST set-off (utilization) journal: the registration and return period (MMYYYY) it sets off.
	gstin: varchar({ length: 15 }),
	gstPeriod: varchar("gst_period", { length: 6 }),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("vouchers_company_id_date_idx").using("btree", table.companyId.asc().nullsLast(), table.date.asc().nullsLast()),
	uniqueIndex("vouchers_company_id_kind_number_idx").using("btree", table.companyId.asc().nullsLast(), table.kind.asc().nullsLast(), table.number.asc().nullsLast()),
	index("vouchers_company_id_gstin_gst_period_idx").using("btree", table.companyId.asc().nullsLast(), table.gstin.asc().nullsLast(), table.gstPeriod.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "vouchers_company_id_fkey"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "vouchers_branch_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "vouchers_created_by_fkey"
		}),
	foreignKey({
			columns: [table.partyId],
			foreignColumns: [parties.id],
			name: "vouchers_party_id_fkey"
		}),
]);

/**
 * A direct credit note (or a supplier's credit note) applied to an open invoice, debit note or bill
 * of the same party. It is not money: no payment, no GST on advance (RULES 8.13). The target's
 * `amount_paid_minor` counts it, and the note's credit left is its total less what is applied.
 */
export const creditApplications = pgTable("credit_applications", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	noteId: varchar("note_id", { length: 40 }).notNull(),
	documentId: varchar("document_id", { length: 40 }).notNull(),
	amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
	date: date().notNull(),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("credit_applications_note_id_document_id_idx").using("btree", table.noteId.asc().nullsLast(), table.documentId.asc().nullsLast()),
	index("credit_applications_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "credit_applications_company_id_fkey"
		}),
	foreignKey({
			columns: [table.noteId],
			foreignColumns: [documents.id],
			name: "credit_applications_note_id_fkey"
		}),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "credit_applications_document_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "credit_applications_created_by_fkey"
		}),
]);

export const gstReturnType = pgEnum("gst_return_type", ['gstr1', 'gstr3b'])
export const gstReturnStatus = pgEnum("gst_return_status", ['prepared', 'saved', 'submitted', 'filed', 'failed'])

/**
 * The taxpayer's own session on the GST portal, per GSTIN (a branch with its own GSTIN has its own):
 * opened with their portal username and an OTP to their registered phone. The token is encrypted
 * with CREDENTIALS_KEY; it lasts six hours and refreshes up to `refreshable_until`.
 */
export const gstPortalSessions = pgTable("gst_portal_sessions", {
	companyId: varchar("company_id", { length: 40 }).notNull(),
	gstin: varchar({ length: 15 }).notNull(),
	username: varchar({ length: 100 }).notNull(),
	authTokenEncrypted: bytea("auth_token_encrypted"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'date' }),
	refreshableUntil: timestamp("refreshable_until", { withTimezone: true, mode: 'date' }),
	otpRequestedAt: timestamp("otp_requested_at", { withTimezone: true, mode: 'date' }),
	connectedBy: varchar("connected_by", { length: 40 }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	primaryKey({ columns: [table.companyId, table.gstin], name: "gst_portal_sessions_pkey" }),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "gst_portal_sessions_company_id_fkey"
		}),
]);

/**
 * One GSTR-1 or GSTR-3B for a GSTIN and period (MMYYYY): what was prepared, saved and filed.
 * Filing locks the period's books.
 */
export const gstReturns = pgTable("gst_returns", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	gstin: varchar({ length: 15 }).notNull(),
	returnType: gstReturnType("return_type").notNull(),
	period: char({ length: 6 }).notNull(),
	status: gstReturnStatus().default('prepared').notNull(),
	/** What was saved to the portal, and our totals of it. */
	payload: jsonb(),
	referenceId: varchar("reference_id", { length: 60 }),
	summaryHash: varchar("summary_hash", { length: 200 }),
	arn: varchar({ length: 40 }),
	filedAt: timestamp("filed_at", { withTimezone: true, mode: 'date' }),
	lastError: text("last_error"),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("gst_returns_company_gstin_type_period_idx").using("btree", table.companyId.asc().nullsLast(), table.gstin.asc().nullsLast(), table.returnType.asc().nullsLast(), table.period.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "gst_returns_company_id_fkey"
		}),
]);

export const gstr2bDecision = pgEnum("gstr2b_decision", ['accepted', 'notOurs', 'claimLater'])

/** One GSTR-2B download per GSTIN and period (MMYYYY). */
export const gstr2bPeriods = pgTable("gstr2b_periods", {
	companyId: varchar("company_id", { length: 40 }).notNull(),
	gstin: varchar({ length: 15 }).notNull(),
	period: char({ length: 6 }).notNull(),
	/** When GSTN generated it (the 14th, for most), and when it was last downloaded. */
	generatedOn: date("generated_on"),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'date' }).notNull(),
	fetchedBy: varchar("fetched_by", { length: 40 }),
}, (table): PgTableExtraConfigValue[] => [
	primaryKey({ columns: [table.companyId, table.gstin, table.period], name: "gstr2b_periods_pkey" }),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "gstr2b_periods_company_id_fkey"
		}),
]);

/**
 * The lines of a GSTR-2B: what each supplier reported. A download replaces the period's lines,
 * but a person's decision on a line (keyed by supplier, kind and number) carries over.
 */
export const gstr2bEntries = pgTable("gstr2b_entries", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	gstin: varchar({ length: 15 }).notNull(),
	period: char({ length: 6 }).notNull(),
	section: varchar({ length: 8 }).notNull(),
	supplierGstin: varchar("supplier_gstin", { length: 15 }).notNull(),
	supplierName: varchar("supplier_name", { length: 200 }),
	documentType: varchar("document_type", { length: 3 }).notNull(),
	number: varchar({ length: 40 }).notNull(),
	/** The number as matched: no case, separators, leading zeros or year. */
	matchKey: varchar("match_key", { length: 40 }).notNull(),
	date: date().notNull(),
	placeOfSupply: varchar("place_of_supply", { length: 2 }),
	reverseCharge: boolean("reverse_charge").default(false).notNull(),
	taxableMinor: bigint("taxable_minor", { mode: "number" }).notNull(),
	igstMinor: bigint("igst_minor", { mode: "number" }).default(0).notNull(),
	cgstMinor: bigint("cgst_minor", { mode: "number" }).default(0).notNull(),
	sgstMinor: bigint("sgst_minor", { mode: "number" }).default(0).notNull(),
	cessMinor: bigint("cess_minor", { mode: "number" }).default(0).notNull(),
	itcAvailable: boolean("itc_available").default(true).notNull(),
	itcReason: varchar("itc_reason", { length: 40 }),
	supplierFiledOn: date("supplier_filed_on"),
	originalNumber: varchar("original_number", { length: 40 }),
	decision: gstr2bDecision(),
	linkedDocumentId: varchar("linked_document_id", { length: 40 }),
	decidedBy: varchar("decided_by", { length: 40 }),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'date' }),
}, (table): PgTableExtraConfigValue[] => [
	index("gstr2b_entries_period_idx").using("btree", table.companyId.asc().nullsLast(), table.gstin.asc().nullsLast(), table.period.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "gstr2b_entries_company_id_fkey"
		}),
]);

export const bankLineStatus = pgEnum("bank_line_status", ['unmatched', 'matched', 'excluded'])
export const bankMatchType = pgEnum("bank_match_type", ['payment', 'expense', 'voucher'])

/** One bank statement file imported into a bank account. */
export const bankStatements = pgTable("bank_statements", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	accountId: varchar("account_id", { length: 40 }).notNull(),
	fileName: varchar("file_name", { length: 200 }).notNull(),
	fromDate: date("from_date").notNull(),
	toDate: date("to_date").notNull(),
	// The balance before its first line and after its last, when the bank printed running balances.
	openingBalanceMinor: bigint("opening_balance_minor", { mode: "number" }),
	closingBalanceMinor: bigint("closing_balance_minor", { mode: "number" }),
	// Lines it added; repeats of lines already imported are not counted.
	lineCount: integer("line_count").notNull(),
	createdBy: varchar("created_by", { length: 40 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	index("bank_statements_account_id_to_date_idx").using("btree", table.accountId.asc().nullsLast(), table.toDate.asc().nullsLast()),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "bank_statements_company_id_fkey"
		}),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [paymentAccounts.id],
			name: "bank_statements_account_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "bank_statements_created_by_fkey"
		}),
]);

/**
 * A line of a bank statement, signed as the bank sees it (+ money in). Matched to the one payment,
 * expense or voucher in the books that it is, excluded (a person said it needs no record), or
 * waiting. `line_key` spots the same line in an overlapping statement.
 */
export const bankStatementLines = pgTable("bank_statement_lines", {
	id: varchar({ length: 40 }).primaryKey().notNull(),
	companyId: varchar("company_id", { length: 40 }).notNull(),
	statementId: varchar("statement_id", { length: 40 }).notNull(),
	accountId: varchar("account_id", { length: 40 }).notNull(),
	// Its place in the statement, oldest first, so the last running balance of a day is known.
	position: integer().notNull(),
	date: date().notNull(),
	description: text().notNull(),
	reference: varchar({ length: 100 }),
	amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
	balanceMinor: bigint("balance_minor", { mode: "number" }),
	status: bankLineStatus().default('unmatched').notNull(),
	matchType: bankMatchType("match_type"),
	matchId: varchar("match_id", { length: 40 }),
	excludedReason: text("excluded_reason"),
	lineKey: varchar("line_key", { length: 200 }).notNull(),
	version: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("bank_statement_lines_account_id_line_key_idx").using("btree", table.accountId.asc().nullsLast(), table.lineKey.asc().nullsLast()),
	index("bank_statement_lines_company_id_account_id_status_date_idx").using("btree", table.companyId.asc().nullsLast(), table.accountId.asc().nullsLast(), table.status.asc().nullsLast(), table.date.asc().nullsLast()),
	index("bank_statement_lines_statement_id_idx").using("btree", table.statementId.asc().nullsLast()),
	uniqueIndex("bank_statement_lines_match_idx").using("btree", table.companyId.asc().nullsLast(), table.accountId.asc().nullsLast(), table.matchType.asc().nullsLast(), table.matchId.asc().nullsLast()).where(sql`${table.matchId} IS NOT NULL`),
	foreignKey({
			columns: [table.companyId],
			foreignColumns: [companies.id],
			name: "bank_statement_lines_company_id_fkey"
		}),
	foreignKey({
			columns: [table.statementId],
			foreignColumns: [bankStatements.id],
			name: "bank_statement_lines_statement_id_fkey"
		}),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [paymentAccounts.id],
			name: "bank_statement_lines_account_id_fkey"
		}),
]);
