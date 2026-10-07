export enum ScopeDecision {
  Green = 'green',
  Yellow = 'yellow',
  Red = 'red',
}

export interface CompanyProfile {
  readonly entityType: 'one_person_llc' | 'other';
  readonly vatTaxpayerStatus: 'small_scale' | 'general';
  readonly vatFilingCycle: 'quarterly' | 'monthly';
  readonly incomeTaxCollection: 'audit' | 'assessed';
  readonly industry: 'modern_service' | 'other';
  readonly hasInventory: boolean;
  readonly hasBranches: boolean;
  readonly hasImportExport: boolean;
  readonly hasForeignCurrency: boolean;
  readonly hasSpecialVatFivePercent: boolean;
  readonly hasDifferenceTax: boolean;
  readonly hasCrossRegionPrepayment: boolean;
  readonly hasComplexPayroll: boolean;
  readonly hasShareholderTransactions: boolean;
  readonly hasComplexTaxAdjustments: boolean;
  readonly sourceDocumentsComplete: boolean;
}

export interface ScopeReason {
  readonly code: string;
  readonly message: string;
  readonly severity: Exclude<ScopeDecision, ScopeDecision.Green>;
}

export interface ScopeEvaluation {
  readonly decision: ScopeDecision;
  readonly reasons: readonly ScopeReason[];
  readonly nextAction: 'continue_setup' | 'manual_review' | 'unsupported';
}

const redChecks: ReadonlyArray<{
  matches: (profile: CompanyProfile) => boolean;
  code: string;
  message: string;
}> = [
  { matches: (p) => p.entityType !== 'one_person_llc', code: 'ENTITY_OUT_OF_SCOPE', message: 'V1 仅支持一人有限责任公司。' },
  { matches: (p) => p.vatTaxpayerStatus !== 'small_scale', code: 'GENERAL_VAT_TAXPAYER', message: '一般纳税人超出 V1 自动化范围。' },
  { matches: (p) => p.vatFilingCycle !== 'quarterly', code: 'VAT_CYCLE_OUT_OF_SCOPE', message: 'V1 仅覆盖按季申报的小规模纳税人。' },
  { matches: (p) => p.incomeTaxCollection !== 'audit', code: 'ASSESSED_INCOME_TAX', message: '核定征收超出 V1 自动化范围。' },
  { matches: (p) => p.industry !== 'modern_service', code: 'INDUSTRY_OUT_OF_SCOPE', message: '当前仅覆盖设计、开发、咨询等现代服务业。' },
  { matches: (p) => p.hasInventory, code: 'HAS_INVENTORY', message: '存在存货核算，需使用专业财务流程。' },
  { matches: (p) => p.hasBranches, code: 'HAS_BRANCHES', message: '存在分支机构，超出 V1 范围。' },
  { matches: (p) => p.hasImportExport, code: 'HAS_IMPORT_EXPORT', message: '存在进出口业务，超出 V1 范围。' },
  { matches: (p) => p.hasForeignCurrency, code: 'HAS_FOREIGN_CURRENCY', message: '存在外币业务，超出 V1 范围。' },
  { matches: (p) => p.hasSpecialVatFivePercent, code: 'SPECIAL_VAT_RATE', message: '存在 5% 征收率业务，停止自动试算。' },
  { matches: (p) => p.hasDifferenceTax, code: 'DIFFERENCE_TAX', message: '存在差额征税业务，停止自动试算。' },
  { matches: (p) => p.hasCrossRegionPrepayment, code: 'CROSS_REGION_PREPAYMENT', message: '存在跨地区预缴业务，停止自动试算。' },
  { matches: (p) => p.hasComplexPayroll, code: 'COMPLEX_PAYROLL', message: '存在多员工复杂薪酬，超出 V1 范围。' },
];

const yellowChecks: ReadonlyArray<{
  matches: (profile: CompanyProfile) => boolean;
  code: string;
  message: string;
}> = [
  { matches: (p) => p.hasShareholderTransactions, code: 'SHAREHOLDER_TRANSACTIONS', message: '存在股东往来，开始记账前需要人工复核。' },
  { matches: (p) => p.hasComplexTaxAdjustments, code: 'COMPLEX_TAX_ADJUSTMENTS', message: '存在复杂纳税调整，必须人工复核。' },
  { matches: (p) => !p.sourceDocumentsComplete, code: 'INCOMPLETE_DOCUMENTS', message: '基础资料不完整，请补充后复核。' },
];

export function evaluateScope(profile: CompanyProfile): ScopeEvaluation {
  const redReasons: ScopeReason[] = redChecks
    .filter((rule) => rule.matches(profile))
    .map((rule) => ({ code: rule.code, message: rule.message, severity: ScopeDecision.Red }));
  if (redReasons.length > 0) {
    return Object.freeze({ decision: ScopeDecision.Red, reasons: redReasons, nextAction: 'unsupported' });
  }

  const yellowReasons: ScopeReason[] = yellowChecks
    .filter((rule) => rule.matches(profile))
    .map((rule) => ({ code: rule.code, message: rule.message, severity: ScopeDecision.Yellow }));
  if (yellowReasons.length > 0) {
    return Object.freeze({ decision: ScopeDecision.Yellow, reasons: yellowReasons, nextAction: 'manual_review' });
  }

  return Object.freeze({ decision: ScopeDecision.Green, reasons: [], nextAction: 'continue_setup' });
}
