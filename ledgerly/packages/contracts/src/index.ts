import { z } from 'zod';

export const bootstrapTenantSchema = z.object({
  tenantName: z.string().trim().min(1).max(100),
  company: z.object({
    name: z.string().trim().min(1).max(200),
    unifiedSocialCreditCode: z.string().regex(/^\d{18}$/),
    provinceCode: z.literal('32'),
    cityCode: z.string().regex(/^32\d{2}$/),
  }),
});

export type BootstrapTenantInput = z.infer<typeof bootstrapTenantSchema>;

export const companySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  unifiedSocialCreditCode: z.string(),
  provinceCode: z.string(),
  cityCode: z.string(),
  status: z.enum(['draft', 'active', 'suspended']),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
});

export type CompanyResponse = z.infer<typeof companySchema>;

export const bootstrapTenantResponseSchema = z.object({
  tenantId: z.string().uuid(),
  company: companySchema,
});

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    traceId: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const companyProfileSchema = z.object({
  entityType: z.enum(['one_person_llc', 'other']),
  vatTaxpayerStatus: z.enum(['small_scale', 'general']),
  vatFilingCycle: z.enum(['quarterly', 'monthly']),
  incomeTaxCollection: z.enum(['audit', 'assessed']),
  industry: z.enum(['modern_service', 'other']),
  hasInventory: z.boolean(),
  hasBranches: z.boolean(),
  hasImportExport: z.boolean(),
  hasForeignCurrency: z.boolean(),
  hasSpecialVatFivePercent: z.boolean(),
  hasDifferenceTax: z.boolean(),
  hasCrossRegionPrepayment: z.boolean(),
  hasComplexPayroll: z.boolean(),
  hasShareholderTransactions: z.boolean(),
  hasComplexTaxAdjustments: z.boolean(),
  sourceDocumentsComplete: z.boolean(),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

export const scopeEvaluationSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  companyId: z.string().uuid(),
  profile: companyProfileSchema,
  decision: z.enum(['green', 'yellow', 'red']),
  reasons: z.array(z.object({
    code: z.string(),
    message: z.string(),
    severity: z.enum(['yellow', 'red']),
  })),
  nextAction: z.enum(['continue_setup', 'manual_review', 'unsupported']),
  evaluatedAt: z.string().datetime(),
});

export type ScopeEvaluationResponse = z.infer<typeof scopeEvaluationSchema>;

export const ledgerSetupSchema = z.object({
  accountName: z.string().trim().min(1).max(100),
  accountType: z.enum(['bank', 'cash']),
  bankName: z.string().trim().min(1).max(100).optional(),
  accountNumberLast4: z.string().regex(/^\d{4}$/).optional(),
  openingBalance: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/),
  openingBalanceSource:z.enum(['none','paid_in_capital','shareholder_advance']),
  openingBalanceAsOf: z.iso.date(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
}).superRefine((value, context) => {
  if (value.accountType === 'bank' && (!value.bankName || !value.accountNumberLast4)) {
    context.addIssue({ code: 'custom', message: '银行账户需要开户行和账号后四位' });
  }
  const zero=Number(value.openingBalance)===0;
  if(zero&&value.openingBalanceSource!=='none')context.addIssue({code:'custom',message:'零余额不需要资金来源',path:['openingBalanceSource']});
  if(!zero&&value.openingBalanceSource==='none')context.addIssue({code:'custom',message:'非零余额必须选择资金来源',path:['openingBalanceSource']});
});

export type LedgerSetupRequest = z.infer<typeof ledgerSetupSchema>;

export const ledgerSetupResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  accountId: z.string().uuid(),
  periodId: z.string().uuid(),
  accountName: z.string(),
  accountType: z.enum(['bank', 'cash']),
  bankName: z.string().optional(),
  accountNumberLast4: z.string().optional(),
  openingBalance: z.string(),
  openingBalanceSource:z.enum(['none','paid_in_capital','shareholder_advance']),
  openingEntries:z.array(z.object({lineNumber:z.number().int().positive(),accountCode:z.string(),accountName:z.string(),side:z.enum(['debit','credit']),amount:z.string()})),
  openingBalanceAsOf: z.iso.date(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  status: z.literal('draft'),
  periodStatus: z.enum(['open','locked']),
  createdAt: z.string().datetime(),
});

export type LedgerSetupResponse = z.infer<typeof ledgerSetupResponseSchema>;

export const counterpartyInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(['customer', 'supplier', 'shareholder', 'employee', 'other']),
  taxId: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{18}$/).optional(),
  contactName: z.string().trim().max(100).optional(),
  phone: z.string().trim().regex(/^[0-9+\-() ]{6,30}$/).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type CounterpartyInputRequest = z.infer<typeof counterpartyInputSchema>;

export const counterpartyResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  type: z.enum(['customer', 'supplier', 'shareholder', 'employee', 'other']),
  taxId: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  isRelatedParty: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
});

export type CounterpartyResponse = z.infer<typeof counterpartyResponseSchema>;

export const counterpartyListResponseSchema = z.object({
  items: z.array(counterpartyResponseSchema),
});

export const businessEventInputSchema = z.object({
  type: z.enum([
    'service_completed', 'invoice_issued', 'money_received', 'expense_incurred',
    'money_paid', 'capital_contribution', 'shareholder_advance',
  ]),
  occurredOn: z.iso.date(),
  amount: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/).refine((value) => Number(value) > 0),
  counterpartyId: z.string().uuid(),
  description: z.string().trim().min(1).max(500),
});

export type BusinessEventInputRequest = z.infer<typeof businessEventInputSchema>;

export const businessEventResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  type: businessEventInputSchema.shape.type,
  occurredOn: z.iso.date(),
  amount: z.string(),
  counterpartyId: z.string().uuid(),
  description: z.string(),
  source: z.enum(['manual', 'import']),
  status: z.enum(['draft', 'confirmed']),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  confirmedAt: z.string().datetime().optional(),
});

export type BusinessEventResponse = z.infer<typeof businessEventResponseSchema>;

export const businessEventListResponseSchema = z.object({ items: z.array(businessEventResponseSchema) });

export const bankCsvImportRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255).refine((name) => name.toLowerCase().endsWith('.csv')),
  content: z.string().min(1).max(2_000_000),
});

export type BankCsvImportRequest = z.infer<typeof bankCsvImportRequestSchema>;

export const bankImportRowSchema = z.object({
  id: z.string().uuid(), rowNumber: z.number().int().positive(),
  occurredOn: z.string().optional(), description: z.string().optional(),
  counterpartyName: z.string().optional(), counterpartyId: z.string().uuid().optional(),
  direction: z.enum(['income', 'expense']).optional(), amount: z.string().optional(),
  balance: z.string().optional(), fingerprint: z.string(),
  status: z.enum(['valid', 'invalid', 'duplicate']), errors: z.array(z.string()),
  businessEventId: z.string().uuid().optional(),
});

export const bankImportBatchSchema = z.object({
  id: z.string().uuid(), companyId: z.string().uuid(), fileName: z.string(), fileHash: z.string(),
  status: z.enum(['validated', 'has_errors', 'confirmed']), totalRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(), invalidRows: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(), rows: z.array(bankImportRowSchema),
  batchErrors: z.array(z.string()),
  createdAt: z.string().datetime(), confirmedAt: z.string().datetime().optional(),
});

export type BankImportBatchResponse = z.infer<typeof bankImportBatchSchema>;

const invoiceDirectionSchema = z.enum(['input', 'output']);
const invoiceKindSchema = z.enum(['ordinary', 'special']);
const invoiceColorSchema = z.enum(['blue', 'red']);
const invoiceSourceSchema = z.enum(['manual', 'mock_ocr']);

export const invoiceInputSchema = z.object({
  direction: invoiceDirectionSchema,
  kind: invoiceKindSchema,
  color: invoiceColorSchema,
  invoiceNumber: z.string().trim().min(8).max(40),
  issuedOn: z.iso.date(),
  counterpartyId: z.string().uuid(),
  amountExcludingTax: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/),
  taxAmount: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/),
  totalAmount: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/),
  remarks: z.string().trim().max(500).optional(),
  source: invoiceSourceSchema.default('manual'),
});

export type InvoiceInputRequest = z.infer<typeof invoiceInputSchema>;

export const invoiceResponseSchema = z.object({
  id: z.string().uuid(), companyId: z.string().uuid(),
  direction: invoiceDirectionSchema, kind: invoiceKindSchema, color: invoiceColorSchema,
  invoiceNumber: z.string(), issuedOn: z.iso.date(), counterpartyId: z.string().uuid(),
  amountExcludingTax: z.string(), taxAmount: z.string(), totalAmount: z.string(),
  remarks: z.string().optional(), source: invoiceSourceSchema,
  status: z.enum(['draft', 'confirmed']), version: z.number().int().positive(),
  createdAt: z.string().datetime(), confirmedAt: z.string().datetime().optional(),
});

export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;
export const invoiceListResponseSchema = z.object({ items: z.array(invoiceResponseSchema) });

export const mockInvoiceExtractionRequestSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
});

export const mockInvoiceExtractionResponseSchema = z.object({
  candidate: z.object({
    direction: invoiceDirectionSchema.optional(), kind: invoiceKindSchema.optional(),
    color: invoiceColorSchema.optional(), invoiceNumber: z.string().optional(),
    issuedOn: z.iso.date().optional(), counterpartyName: z.string().optional(),
    counterpartyId: z.string().uuid().optional(), amountExcludingTax: z.string().optional(),
    taxAmount: z.string().optional(), totalAmount: z.string().optional(), remarks: z.string().optional(),
  }),
  confidence: z.number().min(0).max(1), warnings: z.array(z.string()),
  provider: z.literal('deterministic-mock-v1'), requiresConfirmation: z.literal(true),
});

export type MockInvoiceExtractionResponse = z.infer<typeof mockInvoiceExtractionResponseSchema>;

const documentTypeSchema = z.enum(['invoice', 'bank_receipt', 'contract', 'screenshot', 'payroll', 'other']);
const allowedDocumentMediaTypes = ['application/pdf', 'application/ofd', 'image/jpeg', 'image/png'] as const;

export const documentUploadSchema = z.object({
  type: documentTypeSchema,
  title: z.string().trim().min(1).max(200),
  accountingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  fileName: z.string().trim().min(1).max(255),
  mediaType: z.enum(allowedDocumentMediaTypes),
  contentBase64: z.string().min(1).max(7_000_000).regex(/^[A-Za-z0-9+/]*={0,2}$/),
});

export type DocumentUploadRequest = z.infer<typeof documentUploadSchema>;

export const documentVersionUploadSchema = documentUploadSchema.pick({ fileName: true, mediaType: true, contentBase64: true });
export type DocumentVersionUploadRequest = z.infer<typeof documentVersionUploadSchema>;

export const documentVersionSchema = z.object({
  id: z.string().uuid(), versionNumber: z.number().int().positive(), fileName: z.string(),
  mediaType: z.enum(allowedDocumentMediaTypes), byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/), scanStatus: z.literal('clean'), scanEngine: z.string(),
  createdAt: z.string().datetime(),
});

export const documentResponseSchema = z.object({
  id: z.string().uuid(), companyId: z.string().uuid(), type: documentTypeSchema,
  title: z.string(), accountingMonth: z.string(), status: z.literal('active'),
  currentVersion: z.number().int().positive(), versions: z.array(documentVersionSchema),
  linkedBusinessEventIds: z.array(z.string().uuid()), createdAt: z.string().datetime(),
});

export type DocumentResponse = z.infer<typeof documentResponseSchema>;
export const documentListResponseSchema = z.object({ items: z.array(documentResponseSchema) });
export const documentUploadResponseSchema = z.object({ document: documentResponseSchema, duplicate: z.boolean() });
export const documentContentResponseSchema = z.object({
  fileName: z.string(), mediaType: z.enum(allowedDocumentMediaTypes), contentBase64: z.string(),
});

export const chartAccountSchema = z.object({
  code:z.string(),name:z.string(),category:z.enum(['asset','liability','equity','revenue','expense']),
  normalSide:z.enum(['debit','credit']),enabled:z.literal(true),
});
export const chartOfAccountsResponseSchema = z.object({ templateVersion:z.string(),items:z.array(chartAccountSchema) });

export const voucherEntrySchema = z.object({
  id:z.string().uuid(),lineNumber:z.number().int().positive(),accountCode:z.string(),accountName:z.string(),
  side:z.enum(['debit','credit']),amount:z.string(),
});
export const voucherResponseSchema = z.object({
  id:z.string().uuid(),companyId:z.string().uuid(),voucherDate:z.iso.date(),summary:z.string(),
  sourceBusinessEventId:z.string().uuid(),templateVersion:z.string(),ruleVersion:z.string(),
  status:z.enum(['draft','confirmed','reversed']),version:z.number().int().positive(),entries:z.array(voucherEntrySchema),
  createdAt:z.string().datetime(),
  confirmedAt:z.string().datetime().optional(),reversedAt:z.string().datetime().optional(),reversalOfVoucherId:z.string().uuid().optional(),
});
export type VoucherResponse=z.infer<typeof voucherResponseSchema>;
export const voucherListResponseSchema=z.object({items:z.array(voucherResponseSchema)});
export const voucherGenerationResponseSchema=z.object({voucher:voucherResponseSchema,generated:z.boolean()});
export const voucherConfirmRequestSchema=z.object({expectedVersion:z.number().int().positive()});
export type VoucherConfirmRequest=z.infer<typeof voucherConfirmRequestSchema>;
export const voucherReversalRequestSchema=z.object({reversalDate:z.iso.date(),reason:z.string().trim().min(1).max(300),expectedVersion:z.number().int().positive()});
export type VoucherReversalRequest=z.infer<typeof voucherReversalRequestSchema>;
export const accountingPeriodLockResponseSchema=z.object({
  periodId:z.string().uuid(),periodStart:z.iso.date(),periodEnd:z.iso.date(),status:z.literal('locked'),
});
export const ledgerResponseSchema=z.object({
  period:z.object({start:z.iso.date(),end:z.iso.date(),status:z.enum(['open','locked'])}),
  openingBalance:z.object({accountName:z.string(),amount:z.string(),source:z.enum(['none','paid_in_capital','shareholder_advance']),asOf:z.iso.date(),includedInTrialBalance:z.literal(true),entries:z.array(z.object({lineNumber:z.number().int().positive(),accountCode:z.string(),accountName:z.string(),side:z.enum(['debit','credit']),amount:z.string()}))}),
  journal:z.array(z.object({voucherId:z.string().uuid(),voucherDate:z.iso.date(),summary:z.string(),status:z.enum(['confirmed','reversed']),reversalOfVoucherId:z.string().uuid().optional(),accountCode:z.string(),accountName:z.string(),side:z.enum(['debit','credit']),amount:z.string()})),
  trialBalance:z.array(z.object({accountCode:z.string(),accountName:z.string(),openingDebit:z.string(),openingCredit:z.string(),debitMovement:z.string(),creditMovement:z.string(),endingDebit:z.string(),endingCredit:z.string()})),
});
export type LedgerResponse=z.infer<typeof ledgerResponseSchema>;
const financialReportAmountSchema=z.string().regex(/^-?(0|[1-9]\d*)\.\d{2}$/);
const financialReportLineSchema=z.object({
  accountCode:z.string(),accountName:z.string(),amount:financialReportAmountSchema,
}).strict();
export const financialReportsResponseSchema=z.object({
  period:z.object({start:z.iso.date(),end:z.iso.date(),status:z.enum(['open','locked'])}).strict(),
  basis:z.object({
    templateVersion:z.string(),source:z.literal('confirmed_vouchers_and_opening_entries'),
    includesDraftVouchers:z.literal(false),
  }).strict(),
  profitStatement:z.object({
    revenue:z.array(financialReportLineSchema),expenses:z.array(financialReportLineSchema),
    totalRevenue:financialReportAmountSchema,totalExpenses:financialReportAmountSchema,
    profit:financialReportAmountSchema,
  }).strict(),
  balanceSheet:z.object({
    assets:z.array(financialReportLineSchema),liabilities:z.array(financialReportLineSchema),
    equity:z.array(financialReportLineSchema),currentPeriodProfit:financialReportAmountSchema,
    totalAssets:financialReportAmountSchema,totalLiabilities:financialReportAmountSchema,
    totalEquity:financialReportAmountSchema,difference:financialReportAmountSchema,balanced:z.boolean(),
  }).strict(),
}).strict();
export type FinancialReportsResponse=z.infer<typeof financialReportsResponseSchema>;
export const periodReopenRequestInputSchema=z.object({reason:z.string().trim().min(5).max(500)});
export type PeriodReopenRequestInput=z.infer<typeof periodReopenRequestInputSchema>;
export const periodReopenRequestResponseSchema=z.object({
  id:z.string().uuid(),companyId:z.string().uuid(),periodId:z.string().uuid(),periodStart:z.iso.date(),periodEnd:z.iso.date(),
  reason:z.string(),status:z.literal('pending'),version:z.number().int().positive(),requestedAt:z.string().datetime(),requestedBy:z.string().uuid(),
});
export type PeriodReopenRequestResponse=z.infer<typeof periodReopenRequestResponseSchema>;
export const periodReopenRequestListResponseSchema=z.object({items:z.array(periodReopenRequestResponseSchema)});
export const periodReopenRequestCreationResponseSchema=z.object({request:periodReopenRequestResponseSchema,created:z.boolean()});

export const settlementInputSchema=z.object({invoiceId:z.string().uuid(),paymentEventId:z.string().uuid(),amount:z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/).refine(value=>Number(value)>0)});
export type SettlementInputRequest=z.infer<typeof settlementInputSchema>;
export const settlementResponseSchema=z.object({id:z.string().uuid(),companyId:z.string().uuid(),invoiceId:z.string().uuid(),paymentEventId:z.string().uuid(),amount:z.string(),createdAt:z.string().datetime()});
export const reconciliationOverviewSchema=z.object({
  invoices:z.array(z.object({invoiceId:z.string().uuid(),direction:z.enum(['input','output']),invoiceNumber:z.string(),issuedOn:z.iso.date(),counterpartyId:z.string().uuid(),totalAmount:z.string(),allocatedAmount:z.string(),outstandingAmount:z.string(),status:z.enum(['open','settled'])})),
  payments:z.array(z.object({paymentEventId:z.string().uuid(),type:z.enum(['money_received','money_paid']),occurredOn:z.iso.date(),counterpartyId:z.string().uuid(),description:z.string(),totalAmount:z.string(),allocatedAmount:z.string(),unallocatedAmount:z.string(),status:z.enum(['open','settled'])})),
  settlements:z.array(settlementResponseSchema),
});
export type ReconciliationOverview=z.infer<typeof reconciliationOverviewSchema>;

export const reconciliationIssueTriageStatusSchema=z.enum(['open','investigating','needs_documents','ready_for_recheck']);
export const reconciliationCheckIssueSchema=z.object({
  id:z.string().uuid(),code:z.enum(['INVOICE_OUTSTANDING','PAYMENT_UNALLOCATED','ACCOUNT_BALANCE_ROLLFORWARD_MISMATCH','TRIAL_BALANCE_UNBALANCED']),severity:z.enum(['yellow','red']),
  subjectType:z.enum(['invoice','payment','account','ledger']),subjectId:z.string().min(1),amount:z.string(),message:z.string(),suggestedAction:z.string(),
  triageStatus:reconciliationIssueTriageStatusSchema,triageVersion:z.number().int().positive(),triageNote:z.string().optional(),
  triagedBy:z.string().uuid().optional(),triagedAt:z.string().datetime().optional(),
}).strict();
export const reconciliationCheckRunResponseSchema=z.object({
  id:z.string().uuid(),companyId:z.string().uuid(),periodId:z.string().uuid(),periodStart:z.iso.date(),periodEnd:z.iso.date(),
  inputSnapshot:z.object({
    invoices:z.array(z.object({invoiceId:z.string().uuid(),invoiceNumber:z.string(),outstandingAmount:z.string()}).strict()),
    payments:z.array(z.object({paymentEventId:z.string().uuid(),description:z.string(),unallocatedAmount:z.string()}).strict()),
    accounts:z.array(z.object({accountCode:z.string(),accountName:z.string(),openingDebit:z.string(),openingCredit:z.string(),debitMovement:z.string(),creditMovement:z.string(),endingDebit:z.string(),endingCredit:z.string()}).strict()),
  }).strict(),
  inputHash:z.string().regex(/^[0-9a-f]{64}$/),grade:z.enum(['green','yellow','red']),blocksFiling:z.boolean(),
  totalIssues:z.number().int().nonnegative(),yellowIssues:z.number().int().nonnegative(),redIssues:z.number().int().nonnegative(),
  issues:z.array(reconciliationCheckIssueSchema),createdAt:z.string().datetime(),createdBy:z.string().uuid(),
}).strict().superRefine((value,context)=>{
  const expectedGrade=value.redIssues>0?'red':value.yellowIssues>0?'yellow':'green';
  if(value.totalIssues!==value.yellowIssues+value.redIssues||value.totalIssues!==value.issues.length){context.addIssue({code:'custom',message:'勾稽差异汇总与明细数量不一致'});}
  if(value.grade!==expectedGrade||value.blocksFiling!==(value.totalIssues>0)){context.addIssue({code:'custom',message:'勾稽等级、阻断状态与差异数量不一致'});}
});
export type ReconciliationCheckRunResponse=z.infer<typeof reconciliationCheckRunResponseSchema>;
export const reconciliationIssueTriageInputSchema=z.object({
  status:reconciliationIssueTriageStatusSchema.exclude(['open']),note:z.string().trim().min(5).max(500),expectedVersion:z.number().int().positive(),
}).strict();
export type ReconciliationIssueTriageInput=z.infer<typeof reconciliationIssueTriageInputSchema>;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const officialPolicyUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && (url.hostname === 'gov.cn' || url.hostname.endsWith('.gov.cn'));
}, '必须使用 gov.cn 官方 HTTPS 链接');

export const policySourceInputSchema = z.object({
  documentNumber: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  officialUrl: officialPolicyUrlSchema,
  issuingAuthority: z.string().trim().min(1).max(200),
  publishedOn: z.iso.date(), effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().optional(),
  summary: z.string().trim().min(1).max(2000), contentHash: sha256Schema,
  lastVerifiedOn: z.iso.date(),
}).refine((value) => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, {
  message: '失效日不得早于生效日', path: ['effectiveTo'],
});
export type PolicySourceInputRequest = z.infer<typeof policySourceInputSchema>;

export const policySourceResponseSchema = z.intersection(policySourceInputSchema, z.object({
  id: z.string().uuid(), version: z.number().int().positive(),
  createdAt: z.string().datetime(), createdBy: z.string().uuid(),
}));
export const policySourceListResponseSchema = z.object({ items: z.array(policySourceResponseSchema) }).strict();
export type PolicySourceResponse = z.infer<typeof policySourceResponseSchema>;

export const rulePackageInputSchema = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(200),
  taxType: z.enum(['vat', 'surcharge', 'corporate_income_tax', 'stamp_duty']),
  jurisdictions: z.array(z.string().regex(/^CN(?:-[A-Z0-9]{2,6})?$/)).min(1).max(20),
  description: z.string().trim().min(1).max(1000),
});
export type RulePackageInputRequest = z.infer<typeof rulePackageInputSchema>;

export const rulePackageResponseSchema = rulePackageInputSchema.extend({
  id: z.string().uuid(), version: z.number().int().positive(),
  createdAt: z.string().datetime(), createdBy: z.string().uuid(),
}).strict();
export const rulePackageListResponseSchema = z.object({ items: z.array(rulePackageResponseSchema) }).strict();
export type RulePackageResponse = z.infer<typeof rulePackageResponseSchema>;

const ruleApplicabilitySchema = z.object({
  taxpayerStatuses: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  filingCycles: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  industries: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  requiredTags: z.array(z.string().trim().min(1).max(100)).max(100),
  excludedTags: z.array(z.string().trim().min(1).max(100)).max(100),
});
const ruleParameterValueSchema = z.union([
  z.string().max(500), z.boolean(), z.array(z.string().max(100)).max(100),
]);
export const ruleVersionInputSchema = z.object({
  versionTag: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-\d+$/),
  effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().optional(),
  sourceIds: z.array(z.string().uuid()).min(1).max(50), applicability: ruleApplicabilitySchema,
  calculationImplementation: z.string().regex(/^[a-z][a-z0-9-]*-v\d+$/),
  parameters: z.record(z.string().regex(/^[a-z][A-Za-z0-9]*$/), ruleParameterValueSchema),
  explanation: z.string().trim().min(1).max(5000),
}).refine((value) => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, {
  message: '失效日不得早于生效日', path: ['effectiveTo'],
});
export type RuleVersionInputRequest = z.infer<typeof ruleVersionInputSchema>;

const ruleVersionStatusSchema = z.enum([
  'draft', 'technical_reviewed', 'tax_reviewed', 'tested', 'approved', 'scheduled',
  'active', 'superseded', 'withdrawn',
]);
export const ruleVersionResponseSchema = z.intersection(ruleVersionInputSchema, z.object({
  id: z.string().uuid(), rulePackageId: z.string().uuid(), contentHash: sha256Schema,
  status: ruleVersionStatusSchema, recordVersion: z.number().int().positive(),
  createdAt: z.string().datetime(), createdBy: z.string().uuid(),
  technicalReviewedBy: z.string().uuid().optional(), taxReviewedBy: z.string().uuid().optional(),
  testedBy: z.string().uuid().optional(), testedAt: z.string().datetime().optional(),
  approvedBy: z.string().uuid().optional(), approvedAt: z.string().datetime().optional(),
  scheduledBy: z.string().uuid().optional(), scheduledAt: z.string().datetime().optional(),
  activationAt: z.string().datetime().optional(), activatedBy: z.string().uuid().optional(),
  activatedAt: z.string().datetime().optional(), supersededByRuleVersionId: z.string().uuid().optional(),
  supersededAt: z.string().datetime().optional(), withdrawnBy: z.string().uuid().optional(),
  withdrawnAt: z.string().datetime().optional(),
}));
export const ruleVersionListResponseSchema = z.object({ items: z.array(ruleVersionResponseSchema) }).strict();
export type RuleVersionResponse = z.infer<typeof ruleVersionResponseSchema>;

export const ruleVersionReviewSchema = z.object({
  kind: z.enum(['technical', 'tax']),
  expectedVersion: z.number().int().positive(),
  note: z.string().trim().min(5).max(2000),
});
export type RuleVersionReviewRequest = z.infer<typeof ruleVersionReviewSchema>;

export const ruleTestEvidenceSchema = z.object({
  expectedVersion: z.number().int().positive(),
  fixtureSetVersion: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-\d+$/),
  totalFixtures: z.number().int().positive(),
  passedFixtures: z.number().int().nonnegative(),
  coveredScenarios: z.array(z.enum([
    'normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception',
  ])).min(1),
  artifactHash: sha256Schema,
  note: z.string().trim().min(5).max(2000),
});
export type RuleTestEvidenceRequest = z.infer<typeof ruleTestEvidenceSchema>;

export const goldenFixtureSetInputSchema = z.object({
  fixtureSetVersion: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-\d+$/),
  redactionAttested: z.literal(true),
  professionalNote: z.string().trim().min(10).max(2000),
  fixtures: z.array(z.object({
    caseId: z.string().trim().regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/),
    scenario: z.enum(['normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception']),
    input: z.record(z.string(), z.unknown()), expected: z.record(z.string(), z.unknown()),
    explanation: z.string().trim().min(5).max(2000),
  })).min(6).max(500),
});
export type GoldenFixtureSetInputRequest = z.infer<typeof goldenFixtureSetInputSchema>;

export const goldenFixtureSetResponseSchema = goldenFixtureSetInputSchema.extend({
  id: z.string().uuid(), ruleVersionId: z.string().uuid(), contentHash: sha256Schema,
  signedOffBy: z.string().uuid(), signedOffAt: z.string().datetime(),
}).strict();
export const goldenFixtureSetListResponseSchema = z.object({ items: z.array(goldenFixtureSetResponseSchema) }).strict();
export type GoldenFixtureSetResponse = z.infer<typeof goldenFixtureSetResponseSchema>;

const goldenFixtureExecutionCaseSchema = z.object({
  caseId: z.string(), passed: z.boolean(), expected: z.record(z.string(), z.unknown()),
  actual: z.record(z.string(), z.unknown()).optional(),
  steps: z.array(z.record(z.string(), z.unknown())), error: z.string().optional(),
}).strict();
export const goldenFixtureExecutionResponseSchema = z.object({
  id: z.string().uuid(), ruleVersionId: z.string().uuid(), fixtureSetId: z.string().uuid(),
  implementationKey: z.string(), status: z.enum(['passed', 'failed']),
  totalFixtures: z.number().int().positive(), passedFixtures: z.number().int().nonnegative(),
  artifactHash: sha256Schema, results: z.array(goldenFixtureExecutionCaseSchema),
  executedBy: z.string().uuid(), executedAt: z.string().datetime(),
}).strict();
export type GoldenFixtureExecutionResponse = z.infer<typeof goldenFixtureExecutionResponseSchema>;

export const ruleShadowRunInputSchema = z.object({
  baselineRuleVersionId: z.string().uuid(),
  candidateRuleVersionId: z.string().uuid(),
  fixtureSetId: z.string().uuid(),
}).refine((value) => value.baselineRuleVersionId !== value.candidateRuleVersionId, {
  message: '基准版本和候选版本必须不同', path: ['candidateRuleVersionId'],
});
export type RuleShadowRunInputRequest = z.infer<typeof ruleShadowRunInputSchema>;

const ruleShadowExecutionCaseSchema = z.object({
  caseId:z.string(),output:z.record(z.string(),z.unknown()).optional(),
  steps:z.array(z.record(z.string(),z.unknown())),error:z.string().optional(),
}).strict().refine((value)=>Boolean(value.output)!==Boolean(value.error),{
  message:'每个影子执行结果必须包含 output 或 error 之一',
});
const ruleShadowCaseDifferenceSchema = z.object({
  caseId:z.string(),
  status:z.enum(['identical','output_changed','steps_changed','output_and_steps_changed','baseline_failed','candidate_failed','both_failed']),
  outputChanged:z.boolean(),stepsChanged:z.boolean(),
  baseline:ruleShadowExecutionCaseSchema,candidate:ruleShadowExecutionCaseSchema,
}).strict();
export const ruleShadowRunResponseSchema = z.object({
  id:z.string().uuid(),rulePackageId:z.string().uuid(),baselineRuleVersionId:z.string().uuid(),
  candidateRuleVersionId:z.string().uuid(),fixtureSetId:z.string().uuid(),fixtureSetContentHash:sha256Schema,
  baselineImplementationKey:z.string(),candidateImplementationKey:z.string(),
  status:z.enum(['identical','differences_found','execution_failed']),
  totalFixtures:z.number().int().positive(),identicalFixtures:z.number().int().nonnegative(),
  changedFixtures:z.number().int().nonnegative(),failedFixtures:z.number().int().nonnegative(),
  artifactHash:sha256Schema,differences:z.array(ruleShadowCaseDifferenceSchema),
  executedBy:z.string().uuid(),executedAt:z.string().datetime(),
}).strict();
export type RuleShadowRunResponse = z.infer<typeof ruleShadowRunResponseSchema>;
export const ruleShadowRunCreationResponseSchema=z.object({run:ruleShadowRunResponseSchema,created:z.boolean()}).strict();
export const ruleShadowRunListResponseSchema=z.object({items:z.array(ruleShadowRunResponseSchema)}).strict();

export const ruleApprovalSchema = z.object({
  expectedVersion: z.number().int().positive(),
  note: z.string().trim().min(5).max(2000),
});
export type RuleApprovalRequest = z.infer<typeof ruleApprovalSchema>;

export const ruleScheduleSchema = z.object({
  expectedVersion: z.number().int().positive(),
  activationAt: z.string().datetime({ offset: true }),
  note: z.string().trim().min(5).max(2000),
});
export type RuleScheduleRequest = z.infer<typeof ruleScheduleSchema>;

export const ruleActivationSchema = z.object({
  expectedVersion: z.number().int().positive(),
  note: z.string().trim().min(5).max(2000),
});
export type RuleActivationRequest = z.infer<typeof ruleActivationSchema>;

export const ruleWithdrawalSchema = z.object({
  expectedVersion: z.number().int().positive(),
  note: z.string().trim().min(10).max(2000),
});
export type RuleWithdrawalRequest = z.infer<typeof ruleWithdrawalSchema>;

export const calculationRunInputSchema = z.object({
  taxType: z.enum(['vat', 'surcharge', 'corporate_income_tax', 'stamp_duty']),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
}).refine((value) => value.periodEnd >= value.periodStart, {
  message: '计算结束日期不得早于开始日期', path: ['periodEnd'],
});
export type CalculationRunInputRequest = z.infer<typeof calculationRunInputSchema>;

const calculationStepValueSchema=z.union([z.string(),z.number(),z.array(z.string())]);
const calculationExplanationStepSchema=z.object({
  sequence:z.number().int().positive(),
  key:z.enum(['scope_validation','fact_snapshot','rule_selection']),
  category:z.enum(['validation','selection']),status:z.enum(['passed','blocked']),
  inputs:z.record(z.string(),calculationStepValueSchema),
  output:z.record(z.string(),calculationStepValueSchema),explanation:z.string(),
}).strict();
const calculationDecisionSchema=z.object({
  code:z.enum(['SCOPE_PROFILE_MISSING','SCOPE_NOT_ELIGIBLE','NO_CONFIRMED_FACTS','NO_MATCHING_RULE','MULTIPLE_MATCHING_RULES']),
  message:z.string(),candidateRuleVersionIds:z.array(z.string().uuid()),
}).strict();
export const calculationRunResponseSchema=z.object({
  id:z.string().uuid(),tenantId:z.string().uuid(),companyId:z.string().uuid(),
  taxType:z.enum(['vat','surcharge','corporate_income_tax','stamp_duty']),
  periodStart:z.iso.date(),periodEnd:z.iso.date(),status:z.enum(['ready','decision_required']),
  inputSnapshot:z.object({
    companyId:z.string().uuid(),scopeEvaluationId:z.string().uuid().optional(),
    taxType:z.enum(['vat','surcharge','corporate_income_tax','stamp_duty']),
    periodStart:z.iso.date(),periodEnd:z.iso.date(),jurisdictionCodes:z.array(z.string()),
    profile:z.record(z.string(),z.unknown()).optional(),facts:z.array(z.record(z.string(),z.unknown())),
  }).strict(),
  inputHash:z.string().regex(/^[0-9a-f]{64}$/),
  ruleVersionId:z.string().uuid().optional(),ruleContentHash:z.string().regex(/^[0-9a-f]{64}$/).optional(),
  decision:calculationDecisionSchema.optional(),steps:z.array(calculationExplanationStepSchema),
  createdAt:z.string().datetime(),createdBy:z.string().uuid(),
}).strict().superRefine((value,context)=>{
  const ready=value.status==='ready';
  if(ready!==Boolean(value.ruleVersionId&&value.ruleContentHash)||ready===Boolean(value.decision)){
    context.addIssue({code:'custom',message:'计算运行的状态、规则和阻断决定不一致'});
  }
});
export const calculationRunListResponseSchema=z.object({items:z.array(calculationRunResponseSchema)}).strict();
export type CalculationRunResponse=z.infer<typeof calculationRunResponseSchema>;
