import { relations } from "drizzle-orm/relations";
import { companies, branches, countries, accounts, users, pushTokens, deviceSessions, subscriptions, plans, invites, passwordResetTokens, paymentAccounts, currencies, taxCategories, hsnCodes, exchangeRates, transporters, numberingSeries, complianceSettings, complianceCredentials, items, units, attachments, documents, parties, ewayBills, documentLines, documentTaxLines, shareLinks, backupSettings, documentTaxComponents, eInvoices, paymentLinks, payments, ewayBillPartBUpdates, stockMovements, ewayBillExtensions, paymentAllocations, expenses, expenseCategories, ocrExtractions, ocrLines, ocrFields, messageDeliveries, exportJobs, syncMutations, notifications, auditEvents, changeLog, cities, subscriptionEvents, webhookEvents, userCompanies, userBranches, planModules, reminderDocuments, states, clientIdMappings, companyIntegrations, integrations, idempotencyKeys } from "./schema";

export const branchesRelations = relations(branches, ({one, many}) => ({
	company: one(companies, {
		fields: [branches.companyId],
		references: [companies.id]
	}),
	country: one(countries, {
		fields: [branches.addressCountry],
		references: [countries.code]
	}),
	documents: many(documents),
	stockMovements: many(stockMovements),
	ewayBills: many(ewayBills),
	payments: many(payments),
	expenses: many(expenses),
	userBranches: many(userBranches),
}));

export const companiesRelations = relations(companies, ({one, many}) => ({
	branches: many(branches),
	users: many(users),
	subscriptions: many(subscriptions),
	paymentAccounts: many(paymentAccounts),
	taxCategories: many(taxCategories),
	exchangeRates: many(exchangeRates),
	transporters: many(transporters),
	numberingSeries: many(numberingSeries),
	complianceSettings: many(complianceSettings),
	complianceCredentials: many(complianceCredentials),
	items: many(items),
	documents: many(documents),
	shareLinks: many(shareLinks),
	backupSettings: many(backupSettings),
	parties: many(parties),
	eInvoices: many(eInvoices),
	paymentLinks: many(paymentLinks),
	stockMovements: many(stockMovements),
	ewayBills: many(ewayBills),
	payments: many(payments),
	expenses: many(expenses),
	ocrExtractions: many(ocrExtractions),
	messageDeliveries: many(messageDeliveries),
	exportJobs: many(exportJobs),
	syncMutations: many(syncMutations),
	notifications: many(notifications),
	auditEvents: many(auditEvents),
	changeLogs: many(changeLog),
	account: one(accounts, {
		fields: [companies.accountId],
		references: [accounts.id]
	}),
	attachment: one(attachments, {
		fields: [companies.logoAttachmentId],
		references: [attachments.id],
		relationName: "companies_logoAttachmentId_attachments_id"
	}),
	country: one(countries, {
		fields: [companies.country],
		references: [countries.code]
	}),
	currency: one(currencies, {
		fields: [companies.baseCurrency],
		references: [currencies.code]
	}),
	attachments: many(attachments, {
		relationName: "attachments_companyId_companies_id"
	}),
	subscriptionEvents: many(subscriptionEvents),
	expenseCategories: many(expenseCategories),
	userCompanies: many(userCompanies),
	companyIntegrations: many(companyIntegrations),
}));

export const countriesRelations = relations(countries, ({one, many}) => ({
	branches: many(branches),
	cities: many(cities),
	companies: many(companies),
	currency: one(currencies, {
		fields: [countries.currency],
		references: [currencies.code]
	}),
	states: many(states),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	account: one(accounts, {
		fields: [users.accountId],
		references: [accounts.id],
		relationName: "users_accountId_accounts_id"
	}),
	company: one(companies, {
		fields: [users.defaultCompanyId],
		references: [companies.id]
	}),
	pushTokens: many(pushTokens),
	invites_userId: many(invites, {
		relationName: "invites_userId_users_id"
	}),
	invites_invitedBy: many(invites, {
		relationName: "invites_invitedBy_users_id"
	}),
	passwordResetTokens: many(passwordResetTokens),
	deviceSessions: many(deviceSessions),
	documents: many(documents),
	shareLinks: many(shareLinks),
	paymentLinks: many(paymentLinks),
	ewayBillPartBUpdates: many(ewayBillPartBUpdates),
	stockMovements: many(stockMovements),
	ewayBills: many(ewayBills),
	payments: many(payments),
	ewayBillExtensions: many(ewayBillExtensions),
	expenses: many(expenses),
	ocrExtractions: many(ocrExtractions),
	messageDeliveries: many(messageDeliveries),
	exportJobs: many(exportJobs),
	syncMutations: many(syncMutations),
	notifications: many(notifications),
	auditEvents: many(auditEvents),
	accounts: many(accounts, {
		relationName: "accounts_ownerUserId_users_id"
	}),
	attachments: many(attachments),
	userCompanies: many(userCompanies),
	userBranches: many(userBranches),
	clientIdMappings: many(clientIdMappings),
	companyIntegrations: many(companyIntegrations),
	idempotencyKeys: many(idempotencyKeys),
}));

export const accountsRelations = relations(accounts, ({one, many}) => ({
	users: many(users, {
		relationName: "users_accountId_accounts_id"
	}),
	user: one(users, {
		fields: [accounts.ownerUserId],
		references: [users.id],
		relationName: "accounts_ownerUserId_users_id"
	}),
	companies: many(companies),
}));

export const pushTokensRelations = relations(pushTokens, ({one}) => ({
	user: one(users, {
		fields: [pushTokens.userId],
		references: [users.id]
	}),
	deviceSession: one(deviceSessions, {
		fields: [pushTokens.deviceSessionId],
		references: [deviceSessions.id]
	}),
}));

export const deviceSessionsRelations = relations(deviceSessions, ({one, many}) => ({
	pushTokens: many(pushTokens),
	user: one(users, {
		fields: [deviceSessions.userId],
		references: [users.id]
	}),
	syncMutations: many(syncMutations),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	company: one(companies, {
		fields: [subscriptions.companyId],
		references: [companies.id]
	}),
	plan: one(plans, {
		fields: [subscriptions.plan],
		references: [plans.key]
	}),
}));

export const plansRelations = relations(plans, ({many}) => ({
	subscriptions: many(subscriptions),
	planModules: many(planModules),
}));

export const invitesRelations = relations(invites, ({one}) => ({
	user_userId: one(users, {
		fields: [invites.userId],
		references: [users.id],
		relationName: "invites_userId_users_id"
	}),
	user_invitedBy: one(users, {
		fields: [invites.invitedBy],
		references: [users.id],
		relationName: "invites_invitedBy_users_id"
	}),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({one}) => ({
	user: one(users, {
		fields: [passwordResetTokens.userId],
		references: [users.id]
	}),
}));

export const paymentAccountsRelations = relations(paymentAccounts, ({one, many}) => ({
	company: one(companies, {
		fields: [paymentAccounts.companyId],
		references: [companies.id]
	}),
	currency: one(currencies, {
		fields: [paymentAccounts.currency],
		references: [currencies.code]
	}),
	payments: many(payments),
	expenses: many(expenses),
}));

export const currenciesRelations = relations(currencies, ({many}) => ({
	paymentAccounts: many(paymentAccounts),
	exchangeRates_fromCurrency: many(exchangeRates, {
		relationName: "exchangeRates_fromCurrency_currencies_code"
	}),
	exchangeRates_toCurrency: many(exchangeRates, {
		relationName: "exchangeRates_toCurrency_currencies_code"
	}),
	documents: many(documents),
	parties: many(parties),
	payments: many(payments),
	expenses: many(expenses),
	companies: many(companies),
	countries: many(countries),
}));

export const taxCategoriesRelations = relations(taxCategories, ({one, many}) => ({
	company: one(companies, {
		fields: [taxCategories.companyId],
		references: [companies.id]
	}),
	hsnCode: one(hsnCodes, {
		fields: [taxCategories.hsnCode],
		references: [hsnCodes.code]
	}),
	items: many(items),
	documentLines: many(documentLines),
	documentTaxLines: many(documentTaxLines),
	expenses: many(expenses),
}));

export const hsnCodesRelations = relations(hsnCodes, ({many}) => ({
	taxCategories: many(taxCategories),
	items: many(items),
}));

export const exchangeRatesRelations = relations(exchangeRates, ({one}) => ({
	company: one(companies, {
		fields: [exchangeRates.companyId],
		references: [companies.id]
	}),
	currency_fromCurrency: one(currencies, {
		fields: [exchangeRates.fromCurrency],
		references: [currencies.code],
		relationName: "exchangeRates_fromCurrency_currencies_code"
	}),
	currency_toCurrency: one(currencies, {
		fields: [exchangeRates.toCurrency],
		references: [currencies.code],
		relationName: "exchangeRates_toCurrency_currencies_code"
	}),
}));

export const transportersRelations = relations(transporters, ({one, many}) => ({
	company: one(companies, {
		fields: [transporters.companyId],
		references: [companies.id]
	}),
	complianceSettings: many(complianceSettings),
	ewayBills: many(ewayBills),
}));

export const numberingSeriesRelations = relations(numberingSeries, ({one}) => ({
	company: one(companies, {
		fields: [numberingSeries.companyId],
		references: [companies.id]
	}),
}));

export const complianceSettingsRelations = relations(complianceSettings, ({one}) => ({
	company: one(companies, {
		fields: [complianceSettings.companyId],
		references: [companies.id]
	}),
	transporter: one(transporters, {
		fields: [complianceSettings.defaultTransporterId],
		references: [transporters.id]
	}),
}));

export const complianceCredentialsRelations = relations(complianceCredentials, ({one}) => ({
	company: one(companies, {
		fields: [complianceCredentials.companyId],
		references: [companies.id]
	}),
}));

export const itemsRelations = relations(items, ({one, many}) => ({
	company: one(companies, {
		fields: [items.companyId],
		references: [companies.id]
	}),
	unit: one(units, {
		fields: [items.unit],
		references: [units.code]
	}),
	taxCategory: one(taxCategories, {
		fields: [items.taxCategoryId],
		references: [taxCategories.id]
	}),
	hsnCode: one(hsnCodes, {
		fields: [items.hsnCode],
		references: [hsnCodes.code]
	}),
	attachment: one(attachments, {
		fields: [items.imageAttachmentId],
		references: [attachments.id]
	}),
	documentLines: many(documentLines),
	stockMovements: many(stockMovements),
	ocrLines: many(ocrLines),
}));

export const unitsRelations = relations(units, ({many}) => ({
	items: many(items),
}));

export const attachmentsRelations = relations(attachments, ({one, many}) => ({
	items: many(items),
	ocrExtractions: many(ocrExtractions),
	companies: many(companies, {
		relationName: "companies_logoAttachmentId_attachments_id"
	}),
	company: one(companies, {
		fields: [attachments.companyId],
		references: [companies.id],
		relationName: "attachments_companyId_companies_id"
	}),
	user: one(users, {
		fields: [attachments.uploadedBy],
		references: [users.id]
	}),
}));

export const documentsRelations = relations(documents, ({one, many}) => ({
	company: one(companies, {
		fields: [documents.companyId],
		references: [companies.id]
	}),
	branch: one(branches, {
		fields: [documents.branchId],
		references: [branches.id]
	}),
	party: one(parties, {
		fields: [documents.partyId],
		references: [parties.id]
	}),
	currency: one(currencies, {
		fields: [documents.currency],
		references: [currencies.code]
	}),
	document: one(documents, {
		fields: [documents.sourceDocumentId],
		references: [documents.id],
		relationName: "documents_sourceDocumentId_documents_id"
	}),
	documents: many(documents, {
		relationName: "documents_sourceDocumentId_documents_id"
	}),
	ewayBill: one(ewayBills, {
		fields: [documents.currentEwayBillId],
		references: [ewayBills.id],
		relationName: "documents_currentEwayBillId_ewayBills_id"
	}),
	user: one(users, {
		fields: [documents.createdBy],
		references: [users.id]
	}),
	documentLines: many(documentLines),
	documentTaxLines: many(documentTaxLines),
	shareLinks: many(shareLinks),
	eInvoices: many(eInvoices),
	paymentLinks: many(paymentLinks),
	ewayBills: many(ewayBills, {
		relationName: "ewayBills_documentId_documents_id"
	}),
	paymentAllocations: many(paymentAllocations),
	messageDeliveries: many(messageDeliveries),
	reminderDocuments: many(reminderDocuments),
}));

export const partiesRelations = relations(parties, ({one, many}) => ({
	documents: many(documents),
	company: one(companies, {
		fields: [parties.companyId],
		references: [companies.id]
	}),
	currency: one(currencies, {
		fields: [parties.currency],
		references: [currencies.code]
	}),
	ewayBills: many(ewayBills),
	payments: many(payments),
	expenses: many(expenses),
	ocrExtractions: many(ocrExtractions),
	messageDeliveries: many(messageDeliveries),
}));

export const ewayBillsRelations = relations(ewayBills, ({one, many}) => ({
	documents: many(documents, {
		relationName: "documents_currentEwayBillId_ewayBills_id"
	}),
	ewayBillPartBUpdates: many(ewayBillPartBUpdates),
	company: one(companies, {
		fields: [ewayBills.companyId],
		references: [companies.id]
	}),
	branch: one(branches, {
		fields: [ewayBills.branchId],
		references: [branches.id]
	}),
	document: one(documents, {
		fields: [ewayBills.documentId],
		references: [documents.id],
		relationName: "ewayBills_documentId_documents_id"
	}),
	party: one(parties, {
		fields: [ewayBills.partyId],
		references: [parties.id]
	}),
	transporter: one(transporters, {
		fields: [ewayBills.transporterId],
		references: [transporters.id]
	}),
	user: one(users, {
		fields: [ewayBills.generatedBy],
		references: [users.id]
	}),
	ewayBillExtensions: many(ewayBillExtensions),
}));

export const documentLinesRelations = relations(documentLines, ({one}) => ({
	document: one(documents, {
		fields: [documentLines.documentId],
		references: [documents.id]
	}),
	item: one(items, {
		fields: [documentLines.itemId],
		references: [items.id]
	}),
	taxCategory: one(taxCategories, {
		fields: [documentLines.taxCategoryId],
		references: [taxCategories.id]
	}),
}));

export const documentTaxLinesRelations = relations(documentTaxLines, ({one, many}) => ({
	document: one(documents, {
		fields: [documentTaxLines.documentId],
		references: [documents.id]
	}),
	taxCategory: one(taxCategories, {
		fields: [documentTaxLines.taxCategoryId],
		references: [taxCategories.id]
	}),
	documentTaxComponents: many(documentTaxComponents),
}));

export const shareLinksRelations = relations(shareLinks, ({one}) => ({
	company: one(companies, {
		fields: [shareLinks.companyId],
		references: [companies.id]
	}),
	document: one(documents, {
		fields: [shareLinks.documentId],
		references: [documents.id]
	}),
	user: one(users, {
		fields: [shareLinks.createdBy],
		references: [users.id]
	}),
}));

export const backupSettingsRelations = relations(backupSettings, ({one}) => ({
	company: one(companies, {
		fields: [backupSettings.companyId],
		references: [companies.id]
	}),
}));

export const documentTaxComponentsRelations = relations(documentTaxComponents, ({one}) => ({
	documentTaxLine: one(documentTaxLines, {
		fields: [documentTaxComponents.taxLineId],
		references: [documentTaxLines.id]
	}),
}));

export const eInvoicesRelations = relations(eInvoices, ({one}) => ({
	document: one(documents, {
		fields: [eInvoices.documentId],
		references: [documents.id]
	}),
	company: one(companies, {
		fields: [eInvoices.companyId],
		references: [companies.id]
	}),
}));

export const paymentLinksRelations = relations(paymentLinks, ({one}) => ({
	company: one(companies, {
		fields: [paymentLinks.companyId],
		references: [companies.id]
	}),
	document: one(documents, {
		fields: [paymentLinks.documentId],
		references: [documents.id]
	}),
	payment: one(payments, {
		fields: [paymentLinks.paymentId],
		references: [payments.id]
	}),
	user: one(users, {
		fields: [paymentLinks.createdBy],
		references: [users.id]
	}),
}));

export const paymentsRelations = relations(payments, ({one, many}) => ({
	paymentLinks: many(paymentLinks),
	company: one(companies, {
		fields: [payments.companyId],
		references: [companies.id]
	}),
	branch: one(branches, {
		fields: [payments.branchId],
		references: [branches.id]
	}),
	party: one(parties, {
		fields: [payments.partyId],
		references: [parties.id]
	}),
	currency: one(currencies, {
		fields: [payments.currency],
		references: [currencies.code]
	}),
	paymentAccount: one(paymentAccounts, {
		fields: [payments.accountId],
		references: [paymentAccounts.id]
	}),
	user: one(users, {
		fields: [payments.createdBy],
		references: [users.id]
	}),
	paymentAllocations: many(paymentAllocations),
}));

export const ewayBillPartBUpdatesRelations = relations(ewayBillPartBUpdates, ({one}) => ({
	ewayBill: one(ewayBills, {
		fields: [ewayBillPartBUpdates.ewayBillId],
		references: [ewayBills.id]
	}),
	user: one(users, {
		fields: [ewayBillPartBUpdates.updatedBy],
		references: [users.id]
	}),
}));

export const stockMovementsRelations = relations(stockMovements, ({one}) => ({
	company: one(companies, {
		fields: [stockMovements.companyId],
		references: [companies.id]
	}),
	branch: one(branches, {
		fields: [stockMovements.branchId],
		references: [branches.id]
	}),
	item: one(items, {
		fields: [stockMovements.itemId],
		references: [items.id]
	}),
	user: one(users, {
		fields: [stockMovements.createdBy],
		references: [users.id]
	}),
}));

export const ewayBillExtensionsRelations = relations(ewayBillExtensions, ({one}) => ({
	ewayBill: one(ewayBills, {
		fields: [ewayBillExtensions.ewayBillId],
		references: [ewayBills.id]
	}),
	user: one(users, {
		fields: [ewayBillExtensions.extendedBy],
		references: [users.id]
	}),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({one}) => ({
	payment: one(payments, {
		fields: [paymentAllocations.paymentId],
		references: [payments.id]
	}),
	document: one(documents, {
		fields: [paymentAllocations.documentId],
		references: [documents.id]
	}),
}));

export const expensesRelations = relations(expenses, ({one, many}) => ({
	company: one(companies, {
		fields: [expenses.companyId],
		references: [companies.id]
	}),
	branch: one(branches, {
		fields: [expenses.branchId],
		references: [branches.id]
	}),
	expenseCategory: one(expenseCategories, {
		fields: [expenses.categoryId],
		references: [expenseCategories.id]
	}),
	party: one(parties, {
		fields: [expenses.supplierId],
		references: [parties.id]
	}),
	currency: one(currencies, {
		fields: [expenses.currency],
		references: [currencies.code]
	}),
	taxCategory: one(taxCategories, {
		fields: [expenses.taxCategoryId],
		references: [taxCategories.id]
	}),
	paymentAccount: one(paymentAccounts, {
		fields: [expenses.accountId],
		references: [paymentAccounts.id]
	}),
	expense: one(expenses, {
		fields: [expenses.recurringParentId],
		references: [expenses.id],
		relationName: "expenses_recurringParentId_expenses_id"
	}),
	expenses: many(expenses, {
		relationName: "expenses_recurringParentId_expenses_id"
	}),
	ocrExtraction: one(ocrExtractions, {
		fields: [expenses.ocrExtractionId],
		references: [ocrExtractions.id]
	}),
	user: one(users, {
		fields: [expenses.createdBy],
		references: [users.id]
	}),
}));

export const expenseCategoriesRelations = relations(expenseCategories, ({one, many}) => ({
	expenses: many(expenses),
	company: one(companies, {
		fields: [expenseCategories.companyId],
		references: [companies.id]
	}),
}));

export const ocrExtractionsRelations = relations(ocrExtractions, ({one, many}) => ({
	expenses: many(expenses),
	ocrLines: many(ocrLines),
	company: one(companies, {
		fields: [ocrExtractions.companyId],
		references: [companies.id]
	}),
	attachment: one(attachments, {
		fields: [ocrExtractions.attachmentId],
		references: [attachments.id]
	}),
	party: one(parties, {
		fields: [ocrExtractions.matchedPartyId],
		references: [parties.id]
	}),
	user: one(users, {
		fields: [ocrExtractions.createdBy],
		references: [users.id]
	}),
	ocrFields: many(ocrFields),
}));

export const ocrLinesRelations = relations(ocrLines, ({one}) => ({
	ocrExtraction: one(ocrExtractions, {
		fields: [ocrLines.extractionId],
		references: [ocrExtractions.id]
	}),
	item: one(items, {
		fields: [ocrLines.matchedItemId],
		references: [items.id]
	}),
}));

export const ocrFieldsRelations = relations(ocrFields, ({one}) => ({
	ocrExtraction: one(ocrExtractions, {
		fields: [ocrFields.extractionId],
		references: [ocrExtractions.id]
	}),
}));

export const messageDeliveriesRelations = relations(messageDeliveries, ({one, many}) => ({
	company: one(companies, {
		fields: [messageDeliveries.companyId],
		references: [companies.id]
	}),
	party: one(parties, {
		fields: [messageDeliveries.partyId],
		references: [parties.id]
	}),
	document: one(documents, {
		fields: [messageDeliveries.documentId],
		references: [documents.id]
	}),
	user: one(users, {
		fields: [messageDeliveries.sentBy],
		references: [users.id]
	}),
	reminderDocuments: many(reminderDocuments),
}));

export const exportJobsRelations = relations(exportJobs, ({one}) => ({
	company: one(companies, {
		fields: [exportJobs.companyId],
		references: [companies.id]
	}),
	user: one(users, {
		fields: [exportJobs.requestedBy],
		references: [users.id]
	}),
}));

export const syncMutationsRelations = relations(syncMutations, ({one}) => ({
	user: one(users, {
		fields: [syncMutations.userId],
		references: [users.id]
	}),
	company: one(companies, {
		fields: [syncMutations.companyId],
		references: [companies.id]
	}),
	deviceSession: one(deviceSessions, {
		fields: [syncMutations.deviceSessionId],
		references: [deviceSessions.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	company: one(companies, {
		fields: [notifications.companyId],
		references: [companies.id]
	}),
	user: one(users, {
		fields: [notifications.userId],
		references: [users.id]
	}),
}));

export const auditEventsRelations = relations(auditEvents, ({one}) => ({
	company: one(companies, {
		fields: [auditEvents.companyId],
		references: [companies.id]
	}),
	user: one(users, {
		fields: [auditEvents.actorId],
		references: [users.id]
	}),
}));

export const changeLogRelations = relations(changeLog, ({one}) => ({
	company: one(companies, {
		fields: [changeLog.companyId],
		references: [companies.id]
	}),
}));

export const citiesRelations = relations(cities, ({one}) => ({
	country: one(countries, {
		fields: [cities.countryCode],
		references: [countries.code]
	}),
}));

export const subscriptionEventsRelations = relations(subscriptionEvents, ({one}) => ({
	company: one(companies, {
		fields: [subscriptionEvents.companyId],
		references: [companies.id]
	}),
	webhookEvent: one(webhookEvents, {
		fields: [subscriptionEvents.webhookEventId],
		references: [webhookEvents.id]
	}),
}));

export const webhookEventsRelations = relations(webhookEvents, ({many}) => ({
	subscriptionEvents: many(subscriptionEvents),
}));

export const userCompaniesRelations = relations(userCompanies, ({one}) => ({
	user: one(users, {
		fields: [userCompanies.userId],
		references: [users.id]
	}),
	company: one(companies, {
		fields: [userCompanies.companyId],
		references: [companies.id]
	}),
}));

export const userBranchesRelations = relations(userBranches, ({one}) => ({
	user: one(users, {
		fields: [userBranches.userId],
		references: [users.id]
	}),
	branch: one(branches, {
		fields: [userBranches.branchId],
		references: [branches.id]
	}),
}));

export const planModulesRelations = relations(planModules, ({one}) => ({
	plan: one(plans, {
		fields: [planModules.plan],
		references: [plans.key]
	}),
}));

export const reminderDocumentsRelations = relations(reminderDocuments, ({one}) => ({
	messageDelivery: one(messageDeliveries, {
		fields: [reminderDocuments.deliveryId],
		references: [messageDeliveries.id]
	}),
	document: one(documents, {
		fields: [reminderDocuments.documentId],
		references: [documents.id]
	}),
}));

export const statesRelations = relations(states, ({one}) => ({
	country: one(countries, {
		fields: [states.countryCode],
		references: [countries.code]
	}),
}));

export const clientIdMappingsRelations = relations(clientIdMappings, ({one}) => ({
	user: one(users, {
		fields: [clientIdMappings.userId],
		references: [users.id]
	}),
}));

export const companyIntegrationsRelations = relations(companyIntegrations, ({one}) => ({
	company: one(companies, {
		fields: [companyIntegrations.companyId],
		references: [companies.id]
	}),
	integration: one(integrations, {
		fields: [companyIntegrations.integrationId],
		references: [integrations.id]
	}),
	user: one(users, {
		fields: [companyIntegrations.connectedBy],
		references: [users.id]
	}),
}));

export const integrationsRelations = relations(integrations, ({many}) => ({
	companyIntegrations: many(companyIntegrations),
}));

export const idempotencyKeysRelations = relations(idempotencyKeys, ({one}) => ({
	user: one(users, {
		fields: [idempotencyKeys.userId],
		references: [users.id]
	}),
}));