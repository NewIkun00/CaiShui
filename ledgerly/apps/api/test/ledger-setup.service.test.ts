import { describe, expect, it } from 'vitest';
import { OrganizationService } from '../src/modules/organization/application/organization.service.js';
import { MemoryOrganizationStore } from '../src/modules/organization/infrastructure/memory-organization.store.js';
import { ProfileScopeService } from '../src/modules/profile-scope/application/profile-scope.service.js';
import { MemoryScopeStore } from '../src/modules/profile-scope/infrastructure/memory-scope.store.js';
import { LedgerSetupService } from '../src/modules/ledger-setup/application/ledger-setup.service.js';
import { MemoryLedgerSetupStore } from '../src/modules/ledger-setup/infrastructure/memory-ledger-setup.store.js';

const actorId = '10000000-0000-4000-8000-000000000001';

async function fixture(shareholderTransactions: boolean) {
  const organizations = new MemoryOrganizationStore();
  const scopes = new MemoryScopeStore();
  const created = await new OrganizationService(organizations).bootstrap({
    tenantName: '测试租户',
    company: { name: '常州市测试科技有限公司', unifiedSocialCreditCode: '913204001234567890', provinceCode: '32', cityCode: '3204' },
  }, { actorId, traceId: 'create' });
  await new ProfileScopeService(organizations, scopes).evaluate(created.company.id, {
    entityType: 'one_person_llc', vatTaxpayerStatus: 'small_scale', vatFilingCycle: 'quarterly',
    incomeTaxCollection: 'audit', industry: 'modern_service', hasInventory: false,
    hasBranches: false, hasImportExport: false, hasForeignCurrency: false,
    hasSpecialVatFivePercent: false, hasDifferenceTax: false, hasCrossRegionPrepayment: false,
    hasComplexPayroll: false, hasShareholderTransactions: shareholderTransactions,
    hasComplexTaxAdjustments: false, sourceDocumentsComplete: true,
  }, { actorId, tenantId: created.tenantId, traceId: 'scope' });
  return { created, service: new LedgerSetupService(organizations, scopes, new MemoryLedgerSetupStore()) };
}

describe('LedgerSetupService', () => {
  it('creates the account, opening balance and period only after a green decision', async () => {
    const { created, service } = await fixture(false);
    const result = await service.create(created.company.id, {
      accountName: '基本户', accountType: 'bank', bankName: '招商银行',
      accountNumberLast4: '1234', openingBalance: '88.50', openingBalanceSource:'paid_in_capital',
      openingBalanceAsOf: '2026-09-30', periodStart: '2026-10-01', periodEnd: '2026-10-31',
    }, { actorId, tenantId: created.tenantId, traceId: 'setup' });
    expect(result).toMatchObject({ openingBalance: '88.50', openingBalanceSource:'paid_in_capital',periodStart: '2026-10-01' });
    expect(result.openingEntries).toEqual([
      expect.objectContaining({lineNumber:1,accountCode:'1002',side:'debit',amount:'88.50'}),
      expect.objectContaining({lineNumber:2,accountCode:'3001',side:'credit',amount:'88.50'}),
    ]);
  });

  it('blocks a yellow decision from creating a ledger setup', async () => {
    const { created, service } = await fixture(true);
    await expect(service.create(created.company.id, {
      accountName: '库存现金', accountType: 'cash', openingBalance: '0.00', openingBalanceSource:'none',
      openingBalanceAsOf: '2026-09-30', periodStart: '2026-10-01', periodEnd: '2026-10-31',
    }, { actorId, tenantId: created.tenantId, traceId: 'setup' }))
      .rejects.toMatchObject({ status: 409 });
  });
});
