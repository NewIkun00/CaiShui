import { describe, expect, it } from 'vitest';
import {
  bootstrapTenantResponseSchema,
  ledgerSetupResponseSchema,
  periodReopenRequestCreationResponseSchema,
  reconciliationOverviewSchema,
  scopeEvaluationSchema,
} from '../src/index.js';

const tenantId = '10000000-0000-4000-8000-000000000001';
const companyId = '20000000-0000-4000-8000-000000000002';
const now = '2026-10-08T00:00:00.000Z';
const profile = {
  entityType: 'one_person_llc', vatTaxpayerStatus: 'small_scale', vatFilingCycle: 'quarterly',
  incomeTaxCollection: 'audit', industry: 'modern_service', hasInventory: false, hasBranches: false,
  hasImportExport: false, hasForeignCurrency: false, hasSpecialVatFivePercent: false,
  hasDifferenceTax: false, hasCrossRegionPrepayment: false, hasComplexPayroll: false,
  hasShareholderTransactions: false, hasComplexTaxAdjustments: false, sourceDocumentsComplete: true,
} as const;

describe('onboarding and review response contracts', () => {
  it('parses bootstrap and complete scope evaluation responses', () => {
    expect(bootstrapTenantResponseSchema.parse({
      tenantId,
      company: {
        id: companyId, tenantId, name: '测试企业', unifiedSocialCreditCode: '913200001234567890',
        provinceCode: '32', cityCode: '3201', status: 'draft', version: 1, createdAt: now,
      },
    }).company.status).toBe('draft');
    expect(scopeEvaluationSchema.parse({
      id: '30000000-0000-4000-8000-000000000003',
      profileId: '40000000-0000-4000-8000-000000000004', companyId, profile,
      decision: 'green', reasons: [], nextAction: 'continue_setup', evaluatedAt: now,
    }).profile.vatFilingCycle).toBe('quarterly');
  });

  it('parses the complete ledger setup response', () => {
    expect(ledgerSetupResponseSchema.parse({
      id: '50000000-0000-4000-8000-000000000005', companyId,
      accountId: '60000000-0000-4000-8000-000000000006',
      periodId: '70000000-0000-4000-8000-000000000007', accountName: '基本户', accountType: 'bank',
      bankName: '测试银行', accountNumberLast4: '1234', openingBalance: '100.00',
      openingBalanceSource: 'paid_in_capital', openingBalanceAsOf: '2026-10-01',
      openingEntries: [
        { lineNumber: 1, accountCode: '1002', accountName: '银行存款', side: 'debit', amount: '100.00' },
        { lineNumber: 2, accountCode: '4001', accountName: '实收资本', side: 'credit', amount: '100.00' },
      ],
      periodStart: '2026-10-01', periodEnd: '2026-12-31', status: 'draft', periodStatus: 'open',
      createdAt: now,
    }).openingEntries).toHaveLength(2);
  });

  it('validates review requests and reconciliation overviews', () => {
    expect(periodReopenRequestCreationResponseSchema.parse({
      created: true,
      request: {
        id: '80000000-0000-4000-8000-000000000008', companyId,
        periodId: '70000000-0000-4000-8000-000000000007', periodStart: '2026-10-01',
        periodEnd: '2026-12-31', reason: '发现需复核的原始凭证', status: 'pending', version: 1,
        requestedAt: now, requestedBy: '90000000-0000-4000-8000-000000000009',
      },
    }).created).toBe(true);
    expect(reconciliationOverviewSchema.parse({ invoices: [], payments: [], settlements: [] }))
      .toEqual({ invoices: [], payments: [], settlements: [] });
  });
});
