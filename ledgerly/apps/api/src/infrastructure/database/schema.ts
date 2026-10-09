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
import { sql } from 'drizzle-orm';

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
    decisionReason:text('decision_reason'),decidedAt:timestamp('decided_at',{withTimezone:true}),decidedBy:uuid('decided_by'),
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
    accountId:uuid('account_id').notNull().references(()=>financialAccounts.id),
    statementPeriodStart:date('statement_period_start').notNull(),
    statementPeriodEnd:date('statement_period_end').notNull(),
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

export const reconciliationCheckRuns=pgTable('reconciliation_check_runs',{
  id:uuid('id').primaryKey(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),
  companyId:uuid('company_id').notNull().references(()=>companies.id),periodId:uuid('period_id').notNull().references(()=>accountingPeriods.id),
  periodStart:date('period_start').notNull(),periodEnd:date('period_end').notNull(),inputSnapshot:jsonb('input_snapshot').notNull(),inputHash:text('input_hash').notNull(),
  grade:text('grade').notNull(),blocksFiling:boolean('blocks_filing').notNull(),totalIssues:integer('total_issues').notNull(),
  yellowIssues:integer('yellow_issues').notNull(),redIssues:integer('red_issues').notNull(),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull(),createdBy:uuid('created_by').notNull(),
},(table)=>[
  uniqueIndex('reconciliation_check_runs_input_unique').on(table.tenantId,table.companyId,table.periodId,table.inputHash),
  index('reconciliation_check_runs_company_time_idx').on(table.tenantId,table.companyId,table.createdAt),
]);

export const reconciliationCheckIssues=pgTable('reconciliation_check_issues',{
  id:uuid('id').primaryKey(),runId:uuid('run_id').notNull().references(()=>reconciliationCheckRuns.id),
  code:text('code').notNull(),severity:text('severity').notNull(),subjectType:text('subject_type').notNull(),
  subjectId:text('subject_id').notNull(),amount:numeric('amount',{precision:20,scale:2}).notNull(),message:text('message').notNull(),
  suggestedAction:text('suggested_action').notNull(),triageStatus:text('triage_status').notNull().default('open'),
  triageVersion:integer('triage_version').notNull().default(1),triageNote:text('triage_note'),triagedBy:uuid('triaged_by'),
  triagedAt:timestamp('triaged_at',{withTimezone:true}),
},(table)=>[
  uniqueIndex('reconciliation_check_issues_subject_unique').on(table.runId,table.code,table.subjectId),
  index('reconciliation_check_issues_run_idx').on(table.runId),
]);

export const reconciliationIssueTriageEvents=pgTable('reconciliation_issue_triage_events',{
  id:uuid('id').primaryKey(),issueId:uuid('issue_id').notNull().references(()=>reconciliationCheckIssues.id),
  fromStatus:text('from_status').notNull(),toStatus:text('to_status').notNull(),note:text('note').notNull(),
  version:integer('version').notNull(),actorId:uuid('actor_id').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull(),
},(table)=>[
  uniqueIndex('reconciliation_issue_triage_events_version_unique').on(table.issueId,table.version),
  index('reconciliation_issue_triage_events_issue_time_idx').on(table.issueId,table.createdAt),
]);

export const policySources = pgTable(
  'policy_sources',
  {
    id: uuid('id').primaryKey(),
    documentNumber: text('document_number').notNull(),
    title: text('title').notNull(),
    officialUrl: text('official_url').notNull(),
    issuingAuthority: text('issuing_authority').notNull(),
    publishedOn: date('published_on').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    summary: text('summary').notNull(),
    contentHash: text('content_hash').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    lastVerifiedOn: date('last_verified_on').notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('policy_sources_document_hash_unique').on(table.documentNumber, table.contentHash),
    index('policy_sources_effective_range_idx').on(table.effectiveFrom, table.effectiveTo),
  ],
);

export const rulePackages = pgTable(
  'rule_packages',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    taxType: text('tax_type').notNull(),
    jurisdictions: jsonb('jurisdictions').notNull(),
    description: text('description').notNull(),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('rule_packages_code_unique').on(table.code),
    index('rule_packages_tax_type_idx').on(table.taxType),
  ],
);

export const ruleVersions = pgTable(
  'rule_versions',
  {
    id: uuid('id').primaryKey(),
    rulePackageId: uuid('rule_package_id').notNull().references(() => rulePackages.id),
    versionTag: text('version_tag').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    applicability: jsonb('applicability').notNull(),
    calculationImplementation: text('calculation_implementation').notNull(),
    parameters: jsonb('parameters').notNull(),
    explanation: text('explanation').notNull(),
    contentHash: text('content_hash').notNull(),
    status: text('status').notNull().default('draft'),
    technicalReviewedBy: uuid('technical_reviewed_by'),
    taxReviewedBy: uuid('tax_reviewed_by'),
    testedBy: uuid('tested_by'),
    testedAt: timestamp('tested_at', { withTimezone: true }),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    scheduledBy: uuid('scheduled_by'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    activationAt: timestamp('activation_at', { withTimezone: true }),
    activatedBy: uuid('activated_by'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    supersededByRuleVersionId: uuid('superseded_by_rule_version_id'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    withdrawnBy: uuid('withdrawn_by'),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('rule_versions_package_tag_unique').on(table.rulePackageId, table.versionTag),
    uniqueIndex('rule_versions_package_hash_unique').on(table.rulePackageId, table.contentHash),
    index('rule_versions_effective_status_idx').on(table.effectiveFrom, table.effectiveTo, table.status),
    uniqueIndex('rule_versions_one_active_per_package_unique').on(table.rulePackageId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const ruleVersionReviews = pgTable(
  'rule_version_reviews',
  {
    id: uuid('id').primaryKey(),
    ruleVersionId: uuid('rule_version_id').notNull().references(() => ruleVersions.id),
    reviewKind: text('review_kind').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    note: text('note').notNull(),
    reviewedBy: uuid('reviewed_by').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('rule_version_reviews_kind_unique').on(table.ruleVersionId, table.reviewKind),
    index('rule_version_reviews_version_idx').on(table.ruleVersionId, table.reviewedAt),
  ],
);

export const ruleTestEvidence = pgTable(
  'rule_test_evidence',
  {
    id: uuid('id').primaryKey(),
    ruleVersionId: uuid('rule_version_id').notNull().references(() => ruleVersions.id),
    fixtureSetVersion: text('fixture_set_version').notNull(),
    totalFixtures: integer('total_fixtures').notNull(),
    passedFixtures: integer('passed_fixtures').notNull(),
    coveredScenarios: jsonb('covered_scenarios').notNull(),
    artifactHash: text('artifact_hash').notNull(),
    note: text('note').notNull(),
    signedOffBy: uuid('signed_off_by').notNull(),
    signedOffAt: timestamp('signed_off_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('rule_test_evidence_version_unique').on(table.ruleVersionId),
    index('rule_test_evidence_fixture_set_idx').on(table.fixtureSetVersion),
  ],
);

export const goldenFixtureSets = pgTable(
  'golden_fixture_sets',
  {
    id: uuid('id').primaryKey(),
    ruleVersionId: uuid('rule_version_id').notNull().references(() => ruleVersions.id),
    fixtureSetVersion: text('fixture_set_version').notNull(),
    contentHash: text('content_hash').notNull(),
    redactionAttested: boolean('redaction_attested').notNull(),
    professionalNote: text('professional_note').notNull(),
    signedOffBy: uuid('signed_off_by').notNull(),
    signedOffAt: timestamp('signed_off_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('golden_fixture_sets_version_unique').on(table.ruleVersionId, table.fixtureSetVersion),
    uniqueIndex('golden_fixture_sets_hash_unique').on(table.ruleVersionId, table.contentHash),
  ],
);

export const goldenFixtures = pgTable(
  'golden_fixtures',
  {
    id: uuid('id').primaryKey(),
    fixtureSetId: uuid('fixture_set_id').notNull().references(() => goldenFixtureSets.id),
    caseId: text('case_id').notNull(),
    scenario: text('scenario').notNull(),
    input: jsonb('input').notNull(),
    expected: jsonb('expected').notNull(),
    explanation: text('explanation').notNull(),
  },
  (table) => [
    uniqueIndex('golden_fixtures_case_unique').on(table.fixtureSetId, table.caseId),
    index('golden_fixtures_scenario_idx').on(table.fixtureSetId, table.scenario),
  ],
);

export const goldenFixtureExecutions = pgTable(
  'golden_fixture_executions',
  {
    id: uuid('id').primaryKey(),
    ruleVersionId: uuid('rule_version_id').notNull().references(() => ruleVersions.id),
    fixtureSetId: uuid('fixture_set_id').notNull().references(() => goldenFixtureSets.id),
    implementationKey: text('implementation_key').notNull(),
    status: text('status').notNull(),
    totalFixtures: integer('total_fixtures').notNull(),
    passedFixtures: integer('passed_fixtures').notNull(),
    artifactHash: text('artifact_hash').notNull(),
    results: jsonb('results').notNull(),
    executedBy: uuid('executed_by').notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('golden_fixture_executions_artifact_unique').on(table.ruleVersionId, table.artifactHash),
    index('golden_fixture_executions_set_idx').on(table.fixtureSetId, table.executedAt),
  ],
);

export const ruleShadowRuns = pgTable(
  'rule_shadow_runs',
  {
    id: uuid('id').primaryKey(),
    rulePackageId: uuid('rule_package_id').notNull().references(() => rulePackages.id),
    baselineRuleVersionId: uuid('baseline_rule_version_id').notNull().references(() => ruleVersions.id),
    candidateRuleVersionId: uuid('candidate_rule_version_id').notNull().references(() => ruleVersions.id),
    fixtureSetId: uuid('fixture_set_id').notNull().references(() => goldenFixtureSets.id),
    fixtureSetContentHash: text('fixture_set_content_hash').notNull(),
    baselineImplementationKey: text('baseline_implementation_key').notNull(),
    candidateImplementationKey: text('candidate_implementation_key').notNull(),
    status: text('status').notNull(),
    totalFixtures: integer('total_fixtures').notNull(),
    identicalFixtures: integer('identical_fixtures').notNull(),
    changedFixtures: integer('changed_fixtures').notNull(),
    failedFixtures: integer('failed_fixtures').notNull(),
    artifactHash: text('artifact_hash').notNull(),
    differences: jsonb('differences').notNull(),
    executedBy: uuid('executed_by').notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('rule_shadow_runs_artifact_unique').on(table.rulePackageId, table.artifactHash),
    index('rule_shadow_runs_versions_idx').on(table.baselineRuleVersionId, table.candidateRuleVersionId),
    index('rule_shadow_runs_package_time_idx').on(table.rulePackageId, table.executedAt),
  ],
);

export const ruleVersionApprovals = pgTable(
  'rule_version_approvals',
  {
    id: uuid('id').primaryKey(),
    ruleVersionId: uuid('rule_version_id').notNull().references(() => ruleVersions.id),
    note: text('note').notNull(),
    approvedBy: uuid('approved_by').notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('rule_version_approvals_version_unique').on(table.ruleVersionId),
    index('rule_version_approvals_approved_at_idx').on(table.approvedAt),
  ],
);

export const ruleReleaseSchedules = pgTable(
  'rule_release_schedules',
  {
    id: uuid('id').primaryKey(),
    ruleVersionId: uuid('rule_version_id').notNull().references(() => ruleVersions.id),
    activationAt: timestamp('activation_at', { withTimezone: true }).notNull(),
    note: text('note').notNull(),
    scheduledBy: uuid('scheduled_by').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('rule_release_schedules_version_unique').on(table.ruleVersionId),
    index('rule_release_schedules_activation_idx').on(table.activationAt),
  ],
);

export const ruleReleaseEvents = pgTable(
  'rule_release_events',
  {
    id: uuid('id').primaryKey(),
    ruleVersionId: uuid('rule_version_id').notNull().references(() => ruleVersions.id),
    eventType: text('event_type').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    relatedRuleVersionId: uuid('related_rule_version_id'),
    note: text('note').notNull(),
    actedBy: uuid('acted_by').notNull(),
    actedAt: timestamp('acted_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('rule_release_events_version_idx').on(table.ruleVersionId, table.actedAt),
    index('rule_release_events_type_idx').on(table.eventType, table.actedAt),
  ],
);

export const ruleVersionPolicySources = pgTable(
  'rule_version_policy_sources',
  {
    ruleVersionId: uuid('rule_version_id').notNull().references(() => ruleVersions.id),
    policySourceId: uuid('policy_source_id').notNull().references(() => policySources.id),
  },
  (table) => [
    uniqueIndex('rule_version_policy_sources_unique').on(table.ruleVersionId, table.policySourceId),
    index('rule_version_policy_sources_source_idx').on(table.policySourceId),
  ],
);

export const calculationRuns = pgTable(
  'calculation_runs',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    taxType: text('tax_type').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: text('status').notNull(),
    inputSnapshot: jsonb('input_snapshot').notNull(),
    inputHash: text('input_hash').notNull(),
    ruleVersionId: uuid('rule_version_id').references(() => ruleVersions.id),
    ruleContentHash: text('rule_content_hash'),
    decision: jsonb('decision'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').notNull(),
  },
  (table) => [
    index('calculation_runs_company_period_idx').on(table.tenantId, table.companyId, table.periodStart),
    index('calculation_runs_status_idx').on(table.status, table.createdAt),
    index('calculation_runs_input_hash_idx').on(table.inputHash),
  ],
);

export const calculationRunFacts = pgTable(
  'calculation_run_facts',
  {
    calculationRunId: uuid('calculation_run_id').notNull().references(() => calculationRuns.id),
    businessEventId: uuid('business_event_id').notNull().references(() => businessEvents.id),
  },
  (table) => [
    uniqueIndex('calculation_run_facts_unique').on(table.calculationRunId, table.businessEventId),
    index('calculation_run_facts_event_idx').on(table.businessEventId),
  ],
);

export const calculationRunSteps = pgTable(
  'calculation_run_steps',
  {
    id: uuid('id').primaryKey(),
    calculationRunId: uuid('calculation_run_id').notNull().references(() => calculationRuns.id),
    sequence: integer('sequence').notNull(),
    key: text('key').notNull(),
    category: text('category').notNull(),
    status: text('status').notNull(),
    inputs: jsonb('inputs').notNull(),
    output: jsonb('output').notNull(),
    explanation: text('explanation').notNull(),
  },
  (table) => [
    uniqueIndex('calculation_run_steps_sequence_unique').on(table.calculationRunId, table.sequence),
    uniqueIndex('calculation_run_steps_key_unique').on(table.calculationRunId, table.key),
  ],
);

export const reviewCases=pgTable('review_cases',{
  id:uuid('id').primaryKey(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),companyId:uuid('company_id').notNull().references(()=>companies.id),
  sourceType:text('source_type').notNull(),sourceId:uuid('source_id').notNull(),riskLevel:text('risk_level').notNull(),blocksFiling:boolean('blocks_filing').notNull(),
  summary:text('summary').notNull(),status:text('status').notNull(),assignedTo:uuid('assigned_to'),...auditColumns,
},table=>[uniqueIndex('review_cases_source_unique').on(table.tenantId,table.companyId,table.sourceType,table.sourceId),index('review_cases_queue_idx').on(table.tenantId,table.companyId,table.status,table.riskLevel),index('review_cases_assignee_idx').on(table.tenantId,table.assignedTo,table.status)]);
export const reviewCaseEvents=pgTable('review_case_events',{
  id:uuid('id').primaryKey(),reviewCaseId:uuid('review_case_id').notNull().references(()=>reviewCases.id),eventType:text('event_type').notNull(),
  fromStatus:text('from_status').notNull(),toStatus:text('to_status').notNull(),note:text('note').notNull(),caseVersion:integer('case_version').notNull(),actedBy:uuid('acted_by').notNull(),actedAt:timestamp('acted_at',{withTimezone:true}).notNull(),
},table=>[uniqueIndex('review_case_events_version_unique').on(table.reviewCaseId,table.caseVersion),index('review_case_events_case_idx').on(table.reviewCaseId,table.actedAt)]);
export const reviewCaseWorkItems=pgTable('review_case_work_items',{
  id:uuid('id').primaryKey(),reviewCaseId:uuid('review_case_id').notNull().references(()=>reviewCases.id),kind:text('kind').notNull(),content:text('content').notNull(),documentIds:jsonb('document_ids').notNull().default([]),createdAt:timestamp('created_at',{withTimezone:true}).notNull(),createdBy:uuid('created_by').notNull(),
},table=>[index('review_case_work_items_case_idx').on(table.reviewCaseId,table.createdAt)]);

export const filingCalendars=pgTable('filing_calendars',{
  id:uuid('id').primaryKey(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),name:text('name').notNull(),versionTag:text('version_tag').notNull(),
  jurisdictionCode:text('jurisdiction_code').notNull(),year:integer('year').notNull(),sourceType:text('source_type').notNull(),source:jsonb('source').notNull(),contentHash:text('content_hash').notNull(),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull(),createdBy:uuid('created_by').notNull(),
},table=>[uniqueIndex('filing_calendars_version_unique').on(table.tenantId,table.jurisdictionCode,table.year,table.versionTag),uniqueIndex('filing_calendars_hash_unique').on(table.tenantId,table.contentHash),index('filing_calendars_tenant_year_idx').on(table.tenantId,table.year)]);
export const filingCalendarEntries=pgTable('filing_calendar_entries',{
  id:uuid('id').primaryKey(),calendarId:uuid('calendar_id').notNull().references(()=>filingCalendars.id),taxType:text('tax_type').notNull(),label:text('label').notNull(),periodStart:date('period_start').notNull(),periodEnd:date('period_end').notNull(),dueDate:date('due_date').notNull(),
},table=>[uniqueIndex('filing_calendar_entries_natural_unique').on(table.calendarId,table.taxType,table.periodStart,table.periodEnd),index('filing_calendar_entries_due_idx').on(table.calendarId,table.dueDate)]);
export const filingTasks=pgTable('filing_tasks',{
  id:uuid('id').primaryKey(),tenantId:uuid('tenant_id').notNull().references(()=>tenants.id),companyId:uuid('company_id').notNull().references(()=>companies.id),calendarId:uuid('calendar_id').notNull().references(()=>filingCalendars.id),calendarEntryId:uuid('calendar_entry_id').notNull().references(()=>filingCalendarEntries.id),status:text('status').notNull(),filedAt:timestamp('filed_at',{withTimezone:true}),filedBy:uuid('filed_by'),paidAt:timestamp('paid_at',{withTimezone:true}),paidBy:uuid('paid_by'),...auditColumns,
},table=>[uniqueIndex('filing_tasks_company_entry_unique').on(table.tenantId,table.companyId,table.calendarEntryId),index('filing_tasks_todo_idx').on(table.tenantId,table.companyId,table.status),index('filing_tasks_calendar_idx').on(table.calendarId)]);
export const filingTaskEvents=pgTable('filing_task_events',{
  id:uuid('id').primaryKey(),filingTaskId:uuid('filing_task_id').notNull().references(()=>filingTasks.id),eventType:text('event_type').notNull(),fromStatus:text('from_status').notNull(),toStatus:text('to_status').notNull(),note:text('note').notNull(),taskVersion:integer('task_version').notNull(),actedBy:uuid('acted_by').notNull(),actedAt:timestamp('acted_at',{withTimezone:true}).notNull(),
},table=>[uniqueIndex('filing_task_events_version_unique').on(table.filingTaskId,table.taskVersion),index('filing_task_events_task_idx').on(table.filingTaskId,table.actedAt)]);
