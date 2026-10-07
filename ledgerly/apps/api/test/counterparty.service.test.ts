import { describe, expect, it } from 'vitest';
import { OrganizationService } from '../src/modules/organization/application/organization.service.js';
import { MemoryOrganizationStore } from '../src/modules/organization/infrastructure/memory-organization.store.js';
import { ProfileScopeService } from '../src/modules/profile-scope/application/profile-scope.service.js';
import { MemoryScopeStore } from '../src/modules/profile-scope/infrastructure/memory-scope.store.js';
import { LedgerSetupService } from '../src/modules/ledger-setup/application/ledger-setup.service.js';
import { MemoryLedgerSetupStore } from '../src/modules/ledger-setup/infrastructure/memory-ledger-setup.store.js';
import { CounterpartyService } from '../src/modules/counterparty/application/counterparty.service.js';
import { MemoryCounterpartyStore } from '../src/modules/counterparty/infrastructure/memory-counterparty.store.js';

const actorId = '10000000-0000-4000-8000-000000000001';

async function initializedCompany() {
  const organizations = new MemoryOrganizationStore(); const scopes = new MemoryScopeStore();
  const setups = new MemoryLedgerSetupStore();
  const created = await new OrganizationService(organizations).bootstrap({
    tenantName: '测试', company: { name: '常州市测试科技有限公司', unifiedSocialCreditCode: '913204001234567890', provinceCode: '32', cityCode: '3204' },
  }, { actorId, traceId: 'create' });
  const context = { actorId, tenantId: created.tenantId, traceId: 'test' };
  await new ProfileScopeService(organizations, scopes).evaluate(created.company.id, {
    entityType: 'one_person_llc', vatTaxpayerStatus: 'small_scale', vatFilingCycle: 'quarterly', incomeTaxCollection: 'audit', industry: 'modern_service',
    hasInventory: false, hasBranches: false, hasImportExport: false, hasForeignCurrency: false, hasSpecialVatFivePercent: false, hasDifferenceTax: false,
    hasCrossRegionPrepayment: false, hasComplexPayroll: false, hasShareholderTransactions: false, hasComplexTaxAdjustments: false, sourceDocumentsComplete: true,
  }, context);
  await new LedgerSetupService(organizations, scopes, setups).create(created.company.id, {
    accountName: '基本户', accountType: 'bank', bankName: '招商银行', accountNumberLast4: '1234', openingBalance: '0.00', openingBalanceSource:'none',
    openingBalanceAsOf: '2026-09-30', periodStart: '2026-10-01', periodEnd: '2026-10-31',
  }, context);
  return { created, context, service: new CounterpartyService(organizations, setups, new MemoryCounterpartyStore()) };
}

describe('CounterpartyService', () => {
  it('creates and lists a shareholder as a related party', async () => {
    const { created, context, service } = await initializedCompany();
    const saved = await service.create(created.company.id, { name: '张三', type: 'shareholder', phone: '13800000000' }, context);
    expect(saved.isRelatedParty).toBe(true);
    expect(await service.list(created.company.id, context)).toHaveLength(1);
  });

  it('rejects duplicate names within the same counterparty type', async () => {
    const { created, context, service } = await initializedCompany();
    await service.create(created.company.id, { name: '示例客户', type: 'customer' }, context);
    await expect(service.create(created.company.id, { name: ' 示例客户 ', type: 'customer' }, context))
      .rejects.toMatchObject({ status: 409 });
  });
});
