import { describe, expect, it } from 'vitest';
import { OrganizationService } from '../src/modules/organization/application/organization.service.js';
import { MemoryOrganizationStore } from '../src/modules/organization/infrastructure/memory-organization.store.js';
import { ProfileScopeService } from '../src/modules/profile-scope/application/profile-scope.service.js';
import { MemoryScopeStore } from '../src/modules/profile-scope/infrastructure/memory-scope.store.js';
import { LedgerSetupService } from '../src/modules/ledger-setup/application/ledger-setup.service.js';
import { MemoryLedgerSetupStore } from '../src/modules/ledger-setup/infrastructure/memory-ledger-setup.store.js';
import { CounterpartyService } from '../src/modules/counterparty/application/counterparty.service.js';
import { MemoryCounterpartyStore } from '../src/modules/counterparty/infrastructure/memory-counterparty.store.js';
import { BusinessEventService } from '../src/modules/business-event/application/business-event.service.js';
import { MemoryBusinessEventStore } from '../src/modules/business-event/infrastructure/memory-business-event.store.js';

const actorId = '10000000-0000-4000-8000-000000000001';

async function fixture(counterpartyType: 'customer' | 'shareholder') {
  const organizations = new MemoryOrganizationStore(); const scopes = new MemoryScopeStore();
  const setups = new MemoryLedgerSetupStore(); const counterparties = new MemoryCounterpartyStore();
  const created = await new OrganizationService(organizations).bootstrap({ tenantName: '测试', company: {
    name: '常州市测试科技有限公司', unifiedSocialCreditCode: '913204001234567890', provinceCode: '32', cityCode: '3204',
  } }, { actorId, traceId: 'create' });
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
  const party = await new CounterpartyService(organizations, setups, counterparties)
    .create(created.company.id, { name: counterpartyType === 'shareholder' ? '张三' : '示例客户', type: counterpartyType }, context);
  return { created, context, party, setups, service: new BusinessEventService(setups, counterparties, new MemoryBusinessEventStore()) };
}

describe('BusinessEventService', () => {
  it('creates a draft and confirms it with an optimistic version transition', async () => {
    const { created, context, party, service } = await fixture('customer');
    const draft = await service.create(created.company.id, {
      type: 'service_completed', occurredOn: '2026-10-08', amount: '1200.50',
      counterpartyId: party.id, description: '完成网站开发第一阶段',
    }, context);
    const confirmed = await service.confirm(created.company.id, draft.id, context);
    expect(confirmed).toMatchObject({ status: 'confirmed', version: 2 });
  });

  it('requires a shareholder counterparty for capital contributions', async () => {
    const { created, context, party, service } = await fixture('customer');
    await expect(service.create(created.company.id, {
      type: 'capital_contribution', occurredOn: '2026-10-08', amount: '10000',
      counterpartyId: party.id, description: '股东投资款',
    }, context)).rejects.toMatchObject({ status: 409 });
  });

  it('blocks new facts after the accounting period is locked', async () => {
    const { created, context, party, setups, service } = await fixture('customer');
    await setups.lockCurrentPeriod({ tenantId:context.tenantId, companyId:created.company.id, actorId, traceId:'lock', lockedAt:new Date() });
    await expect(service.create(created.company.id, {
      type:'service_completed', occurredOn:'2026-10-08', amount:'100.00', counterpartyId:party.id, description:'锁账后事项',
    }, context)).rejects.toMatchObject({ status:409, response:{ code:'ACCOUNTING_PERIOD_LOCKED' } });
  });
});
