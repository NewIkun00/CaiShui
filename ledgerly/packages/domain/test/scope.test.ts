import { describe, expect, it } from 'vitest';
import { evaluateScope, ScopeDecision, type CompanyProfile } from '../src/index.js';

const supportedProfile: CompanyProfile = {
  entityType: 'one_person_llc',
  vatTaxpayerStatus: 'small_scale',
  vatFilingCycle: 'quarterly',
  incomeTaxCollection: 'audit',
  industry: 'modern_service',
  hasInventory: false,
  hasBranches: false,
  hasImportExport: false,
  hasForeignCurrency: false,
  hasSpecialVatFivePercent: false,
  hasDifferenceTax: false,
  hasCrossRegionPrepayment: false,
  hasComplexPayroll: false,
  hasShareholderTransactions: false,
  hasComplexTaxAdjustments: false,
  sourceDocumentsComplete: true,
};

describe('scope decision table', () => {
  it('allows a supported Jiangsu modern-service profile to continue', () => {
    expect(evaluateScope(supportedProfile)).toEqual({
      decision: ScopeDecision.Green,
      reasons: [],
      nextAction: 'continue_setup',
    });
  });

  it('routes shareholder transactions to mandatory review', () => {
    const result = evaluateScope({ ...supportedProfile, hasShareholderTransactions: true });
    expect(result.decision).toBe(ScopeDecision.Yellow);
    expect(result.reasons.map((reason) => reason.code)).toContain('SHAREHOLDER_TRANSACTIONS');
  });

  it('rejects unsupported structural scenarios and red outranks yellow', () => {
    const result = evaluateScope({
      ...supportedProfile,
      vatTaxpayerStatus: 'general',
      hasShareholderTransactions: true,
      hasImportExport: true,
    });
    expect(result.decision).toBe(ScopeDecision.Red);
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      'GENERAL_VAT_TAXPAYER',
      'HAS_IMPORT_EXPORT',
    ]);
  });
});
