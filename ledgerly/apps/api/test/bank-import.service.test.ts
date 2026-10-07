import { describe, expect, it } from 'vitest';
import { OrganizationService } from '../src/modules/organization/application/organization.service.js';
import { MemoryOrganizationStore } from '../src/modules/organization/infrastructure/memory-organization.store.js';
import { ProfileScopeService } from '../src/modules/profile-scope/application/profile-scope.service.js';
import { MemoryScopeStore } from '../src/modules/profile-scope/infrastructure/memory-scope.store.js';
import { LedgerSetupService } from '../src/modules/ledger-setup/application/ledger-setup.service.js';
import { MemoryLedgerSetupStore } from '../src/modules/ledger-setup/infrastructure/memory-ledger-setup.store.js';
import { CounterpartyService } from '../src/modules/counterparty/application/counterparty.service.js';
import { MemoryCounterpartyStore } from '../src/modules/counterparty/infrastructure/memory-counterparty.store.js';
import { MemoryBusinessEventStore } from '../src/modules/business-event/infrastructure/memory-business-event.store.js';
import { BankImportService } from '../src/modules/bank-import/application/bank-import.service.js';
import { MemoryBankImportStore } from '../src/modules/bank-import/infrastructure/memory-bank-import.store.js';

const actorId = '10000000-0000-4000-8000-000000000001';
const csv = '交易日期,摘要,对方名称,收入,支出,余额\n2026-10-08,收到项目款,示例客户,1200.50,,2200.60';

async function fixture() {
  const organizations = new MemoryOrganizationStore(); const scopes = new MemoryScopeStore();
  const setups = new MemoryLedgerSetupStore(); const counterparties = new MemoryCounterpartyStore();
  const events = new MemoryBusinessEventStore();
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
    accountName: '基本户', accountType: 'bank', bankName: '招商银行', accountNumberLast4: '1234', openingBalance: '1000.10', openingBalanceSource:'paid_in_capital',
    openingBalanceAsOf: '2026-09-30', periodStart: '2026-10-01', periodEnd: '2026-10-31',
  }, context);
  await new CounterpartyService(organizations, setups, counterparties)
    .create(created.company.id, { name: '示例客户', type: 'customer' }, context);
  return {
    created, context, events, setups,
    service: new BankImportService(setups, counterparties, new MemoryBankImportStore(events)),
  };
}

describe('BankImportService', () => {
  it('validates and confirms a CSV batch into confirmed business events', async () => {
    const { created, context, events, service } = await fixture();
    const batch = await service.upload(created.company.id, { fileName: '流水.csv', content: csv }, context);
    expect(batch).toMatchObject({ status: 'validated', validRows: 1, invalidRows: 0 });
    const confirmed = await service.confirm(created.company.id, batch.id, context);
    expect(confirmed.status).toBe('confirmed');
    expect(await events.list(context.tenantId, created.company.id)).toEqual([
      expect.objectContaining({ status: 'confirmed', source: 'import' }),
    ]);
  });

  it('recognizes a previously confirmed row as a duplicate', async () => {
    const { created, context, service } = await fixture();
    const first = await service.upload(created.company.id, { fileName: '第一次.csv', content: csv }, context);
    await service.confirm(created.company.id, first.id, context);
    const second = await service.upload(created.company.id, { fileName: '第二次.csv', content: csv }, context);
    expect(second).toMatchObject({ validRows: 0, duplicateRows: 1 });
  });

  it('allows validation but blocks import confirmation after period lock', async () => {
    const { created, context, setups, service } = await fixture();
    const batch=await service.upload(created.company.id,{fileName:'待确认.csv',content:csv},context);
    await setups.lockCurrentPeriod({ tenantId:context.tenantId, companyId:created.company.id, actorId, traceId:'lock', lockedAt:new Date() });
    await expect(service.confirm(created.company.id,batch.id,context)).rejects.toMatchObject({ status:409, response:{ code:'ACCOUNTING_PERIOD_LOCKED' } });
  });
});
