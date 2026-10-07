import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
  date,
  numeric,
} from 'drizzle-orm/pg-core';

const auditColumns = {
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').notNull(),
};

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  ...auditColumns,
});

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    unifiedSocialCreditCode: text('unified_social_credit_code').notNull(),
    provinceCode: text('province_code').notNull(),
    cityCode: text('city_code').notNull(),
    status: text('status').notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('companies_tenant_credit_code_unique').on(
      table.tenantId,
      table.unifiedSocialCreditCode,
    ),
    index('companies_tenant_id_idx').on(table.tenantId),
  ],
);

export const tenantMembers = pgTable(
  'tenant_members',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    ...auditColumns,
  },
  (table) => [uniqueIndex('tenant_members_identity_unique').on(table.tenantId, table.userId)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id'),
    actorId: uuid('actor_id').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    outcome: text('outcome').notNull(),
    traceId: text('trace_id').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audit_events_tenant_occurred_idx').on(table.tenantId, table.occurredAt)],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [index('outbox_events_unpublished_idx').on(table.publishedAt, table.occurredAt)],
);

export const companyProfiles = pgTable(
  'company_profiles',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    entityType: text('entity_type').notNull(),
    vatTaxpayerStatus: text('vat_taxpayer_status').notNull(),
    vatFilingCycle: text('vat_filing_cycle').notNull(),
    incomeTaxCollection: text('income_tax_collection').notNull(),
    industry: text('industry').notNull(),
    hasInventory: boolean('has_inventory').notNull(),
    hasBranches: boolean('has_branches').notNull(),
    hasImportExport: boolean('has_import_export').notNull(),
    hasForeignCurrency: boolean('has_foreign_currency').notNull(),
    hasSpecialVatFivePercent: boolean('has_special_vat_five_percent').notNull(),
    hasDifferenceTax: boolean('has_difference_tax').notNull(),
    hasCrossRegionPrepayment: boolean('has_cross_region_prepayment').notNull(),
    hasComplexPayroll: boolean('has_complex_payroll').notNull(),
    hasShareholderTransactions: boolean('has_shareholder_transactions').notNull(),
    hasComplexTaxAdjustments: boolean('has_complex_tax_adjustments').notNull(),
    sourceDocumentsComplete: boolean('source_documents_complete').notNull(),
    ...auditColumns,
  },
  (table) => [index('company_profiles_company_idx').on(table.tenantId, table.companyId)],
);

export const scopeEvaluations = pgTable(
  'scope_evaluations',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    profileId: uuid('profile_id').notNull().references(() => companyProfiles.id),
    decision: text('decision').notNull(),
    reasons: jsonb('reasons').notNull(),
    nextAction: text('next_action').notNull(),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull(),
    evaluatedBy: uuid('evaluated_by').notNull(),
    traceId: text('trace_id').notNull(),
  },
  (table) => [index('scope_evaluations_company_idx').on(table.tenantId, table.companyId, table.evaluatedAt)],
);

export const financialAccounts = pgTable(
  'financial_accounts',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    name: text('name').notNull(),
    accountType: text('account_type').notNull(),
    bankName: text('bank_name'),
    accountNumberLast4: text('account_number_last4'),
    currency: text('currency').notNull().default('CNY'),
    status: text('status').notNull().default('active'),
    ...auditColumns,
  },
  (table) => [index('financial_accounts_company_idx').on(table.tenantId, table.companyId)],
);

export const accountingPeriods = pgTable(
  'accounting_periods',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: text('status').notNull().default('open'),
    ...auditColumns,
  },
  (table) => [uniqueIndex('accounting_periods_company_range_unique').on(table.tenantId, table.companyId, table.periodStart, table.periodEnd)],
);

export const periodReopenRequests = pgTable(
  'period_reopen_requests',
  {
    id:uuid('id').primaryKey(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),
    companyId:uuid('company_id').notNull().references(()=>companies.id),
    periodId:uuid('period_id').notNull().references(()=>accountingPeriods.id),
    periodStart:date('period_start').notNull(),periodEnd:date('period_end').notNull(),
    reason:text('reason').notNull(),status:text('status').notNull().default('pending'),
    requestedAt:timestamp('requested_at',{withTimezone:true}).notNull(),requestedBy:uuid('requested_by').notNull(),
    ...auditColumns,
  },
  (table)=>[
    index('period_reopen_requests_company_idx').on(table.tenantId,table.companyId,table.requestedAt),
  ],
);

export const openingBalances = pgTable('opening_balances', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  accountId: uuid('account_id').notNull().references(() => financialAccounts.id),
  amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
  source:text('source').notNull().default('none'),
  balanceAsOf: date('balance_as_of').notNull(),
  ...auditColumns,
});

export const openingBalanceEntries=pgTable('opening_balance_entries',{
  id:uuid('id').primaryKey(),openingBalanceId:uuid('opening_balance_id').notNull().references(()=>openingBalances.id),
  lineNumber:integer('line_number').notNull(),accountCode:text('account_code').notNull(),accountName:text('account_name').notNull(),
  side:text('side').notNull(),amount:numeric('amount',{precision:20,scale:2}).notNull(),
},(table)=>[uniqueIndex('opening_balance_entries_balance_line_unique').on(table.openingBalanceId,table.lineNumber)]);

export const ledgerInitializations = pgTable(
  'ledger_initializations',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    accountId: uuid('account_id').notNull().references(() => financialAccounts.id),
    periodId: uuid('period_id').notNull().references(() => accountingPeriods.id),
    openingBalanceId: uuid('opening_balance_id').notNull().references(() => openingBalances.id),
    status: text('status').notNull().default('draft'),
    ...auditColumns,
  },
  (table) => [uniqueIndex('ledger_initializations_company_unique').on(table.tenantId, table.companyId)],
);

export const counterparties = pgTable(
  'counterparties',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    type: text('type').notNull(),
    taxId: text('tax_id'),
    contactName: text('contact_name'),
    phone: text('phone'),
    notes: text('notes'),
    isRelatedParty: boolean('is_related_party').notNull().default(false),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('counterparties_company_type_name_unique').on(table.tenantId, table.companyId, table.type, table.normalizedName),
    index('counterparties_company_idx').on(table.tenantId, table.companyId),
  ],
);

export const businessEvents = pgTable(
  'business_events',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    eventType: text('event_type').notNull(),
    occurredOn: date('occurred_on').notNull(),
    amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
    counterpartyId: uuid('counterparty_id').notNull().references(() => counterparties.id),
    description: text('description').notNull(),
    source: text('source').notNull().default('manual'),
    status: text('status').notNull().default('draft'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by'),
    importRowId: uuid('import_row_id'),
    sourceFingerprint: text('source_fingerprint'),
    ...auditColumns,
  },
  (table) => [
    index('business_events_company_date_idx').on(table.tenantId, table.companyId, table.occurredOn),
    uniqueIndex('business_events_source_fingerprint_unique').on(table.tenantId, table.companyId, table.sourceFingerprint),
  ],
);

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    importType: text('import_type').notNull(),
    fileName: text('file_name').notNull(),
    fileHash: text('file_hash').notNull(),
    status: text('status').notNull(),
    totalRows: integer('total_rows').notNull(),
    validRows: integer('valid_rows').notNull(),
    invalidRows: integer('invalid_rows').notNull(),
    duplicateRows: integer('duplicate_rows').notNull(),
    batchErrors: jsonb('batch_errors').notNull().default([]),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by'),
    ...auditColumns,
  },
  (table) => [index('import_batches_company_created_idx').on(table.tenantId, table.companyId, table.createdAt)],
);

export const bankImportRows = pgTable(
  'bank_import_rows',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    batchId: uuid('batch_id').notNull().references(() => importBatches.id),
    rowNumber: integer('row_number').notNull(),
    occurredOn: date('occurred_on'),
    description: text('description'),
    counterpartyName: text('counterparty_name'),
    counterpartyId: uuid('counterparty_id'),
    direction: text('direction'),
    amount: numeric('amount', { precision: 20, scale: 2 }),
    balance: numeric('balance', { precision: 20, scale: 2 }),
    fingerprint: text('fingerprint').notNull(),
    status: text('status').notNull(),
    errors: jsonb('errors').notNull(),
    businessEventId: uuid('business_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('bank_import_rows_batch_idx').on(table.batchId, table.rowNumber)],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    direction: text('direction').notNull(),
    kind: text('kind').notNull(),
    color: text('color').notNull(),
    invoiceNumber: text('invoice_number').notNull(),
    issuedOn: date('issued_on').notNull(),
    counterpartyId: uuid('counterparty_id').notNull().references(() => counterparties.id),
    amountExcludingTax: numeric('amount_excluding_tax', { precision: 20, scale: 2 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 20, scale: 2 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 20, scale: 2 }).notNull(),
    remarks: text('remarks'),
    source: text('source').notNull().default('manual'),
    status: text('status').notNull().default('draft'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by'),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('invoices_company_direction_number_unique').on(
      table.tenantId, table.companyId, table.direction, table.invoiceNumber,
    ),
    index('invoices_company_date_idx').on(table.tenantId, table.companyId, table.issuedOn),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    type: text('type').notNull(), title: text('title').notNull(),
    accountingMonth: text('accounting_month').notNull(),
    status: text('status').notNull().default('active'),
    currentVersion: integer('current_version').notNull().default(1),
    ...auditColumns,
  },
  (table) => [index('documents_company_month_idx').on(table.tenantId, table.companyId, table.accountingMonth)],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    documentId: uuid('document_id').notNull().references(() => documents.id),
    versionNumber: integer('version_number').notNull(), fileName: text('file_name').notNull(),
    mediaType: text('media_type').notNull(), byteSize: integer('byte_size').notNull(),
    sha256: text('sha256').notNull(), storageKey: text('storage_key').notNull(),
    scanStatus: text('scan_status').notNull(), scanEngine: text('scan_engine').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').notNull(),
  },
  (table) => [
    uniqueIndex('document_versions_document_number_unique').on(table.documentId, table.versionNumber),
    uniqueIndex('document_versions_company_hash_unique').on(table.tenantId, table.companyId, table.sha256),
  ],
);

export const evidenceLinks = pgTable(
  'evidence_links',
  {
    id: uuid('id').primaryKey(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    documentId: uuid('document_id').notNull().references(() => documents.id),
    businessEventId: uuid('business_event_id').notNull().references(() => businessEvents.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').notNull(),
  },
  (table) => [
    uniqueIndex('evidence_links_document_event_unique').on(table.documentId, table.businessEventId),
    index('evidence_links_event_idx').on(table.tenantId, table.companyId, table.businessEventId),
  ],
);

export const vouchers = pgTable(
  'vouchers',
  {
    id: uuid('id').primaryKey(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    voucherDate: date('voucher_date').notNull(), summary: text('summary').notNull(),
    sourceBusinessEventId: uuid('source_business_event_id').notNull().references(() => businessEvents.id),
    templateVersion: text('template_version').notNull(), ruleVersion: text('rule_version').notNull(),
    status: text('status').notNull().default('draft'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversalOfVoucherId: uuid('reversal_of_voucher_id'),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('vouchers_source_rule_unique').on(table.tenantId, table.companyId, table.sourceBusinessEventId, table.ruleVersion),
    uniqueIndex('vouchers_reversal_of_unique').on(table.reversalOfVoucherId),
    index('vouchers_company_date_idx').on(table.tenantId, table.companyId, table.voucherDate),
  ],
);

export const voucherEntries = pgTable(
  'voucher_entries',
  {
    id: uuid('id').primaryKey(), voucherId: uuid('voucher_id').notNull().references(() => vouchers.id),
    lineNumber: integer('line_number').notNull(), accountCode: text('account_code').notNull(),
    accountName: text('account_name').notNull(), side: text('side').notNull(),
    amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
  },
  (table) => [uniqueIndex('voucher_entries_voucher_line_unique').on(table.voucherId, table.lineNumber)],
);

export const invoiceSettlements = pgTable(
  'invoice_settlements',
  {
    id:uuid('id').primaryKey(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),
    companyId:uuid('company_id').notNull().references(()=>companies.id),
    invoiceId:uuid('invoice_id').notNull().references(()=>invoices.id),
    paymentEventId:uuid('payment_event_id').notNull().references(()=>businessEvents.id),
    amount:numeric('amount',{precision:20,scale:2}).notNull(),
    createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),createdBy:uuid('created_by').notNull(),
  },
  (table)=>[
    uniqueIndex('invoice_settlements_pair_unique').on(table.invoiceId,table.paymentEventId),
    index('invoice_settlements_company_idx').on(table.tenantId,table.companyId),
  ],
);
