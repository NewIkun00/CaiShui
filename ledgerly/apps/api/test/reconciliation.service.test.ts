import { describe, expect, it } from 'vitest';
import { AccountingService } from '../src/modules/accounting/application/accounting.service.js';
import { MemoryVoucherStore } from '../src/modules/accounting/infrastructure/memory-voucher.store.js';
import { BusinessEventService } from '../src/modules/business-event/application/business-event.service.js';
import { MemoryBusinessEventStore } from '../src/modules/business-event/infrastructure/memory-business-event.store.js';
import { CounterpartyService } from '../src/modules/counterparty/application/counterparty.service.js';
import { MemoryCounterpartyStore } from '../src/modules/counterparty/infrastructure/memory-counterparty.store.js';
import { InvoiceService } from '../src/modules/invoice/application/invoice.service.js';
import { MemoryInvoiceStore } from '../src/modules/invoice/infrastructure/memory-invoice.store.js';
import { MockInvoiceExtractionProvider } from '../src/modules/invoice/infrastructure/mock-invoice-extraction.provider.js';
import { LedgerSetupService } from '../src/modules/ledger-setup/application/ledger-setup.service.js';
import { MemoryLedgerSetupStore } from '../src/modules/ledger-setup/infrastructure/memory-ledger-setup.store.js';
import { OrganizationService } from '../src/modules/organization/application/organization.service.js';
import { MemoryOrganizationStore } from '../src/modules/organization/infrastructure/memory-organization.store.js';
import { ProfileScopeService } from '../src/modules/profile-scope/application/profile-scope.service.js';
import { MemoryScopeStore } from '../src/modules/profile-scope/infrastructure/memory-scope.store.js';
import { ReconciliationService } from '../src/modules/reconciliation/application/reconciliation.service.js';
import { MemoryReconciliationCheckStore } from '../src/modules/reconciliation/infrastructure/memory-reconciliation-check.store.js';
import { MemorySettlementStore } from '../src/modules/reconciliation/infrastructure/memory-settlement.store.js';

const actorId = '10000000-0000-4000-8000-000000000001';

async function fixture() {
  const organizations = new MemoryOrganizationStore(); const scopes = new MemoryScopeStore();
  const setups = new MemoryLedgerSetupStore(); const parties = new MemoryCounterpartyStore();
  const events = new MemoryBusinessEventStore(); const invoices = new MemoryInvoiceStore();
  const settlements = new MemorySettlementStore(); const checks = new MemoryReconciliationCheckStore();
  const created = await new OrganizationService(organizations).bootstrap({
    tenantName: '测试', company: { name: '常州市测试科技有限公司', unifiedSocialCreditCode: '913204001234567890', provinceCode: '32', cityCode: '3204' },
  }, { actorId, traceId: 'create' });
  const context = { actorId, tenantId: created.tenantId, traceId: 'test' };
  await new ProfileScopeService(organizations, scopes).evaluate(created.company.id, {
    entityType: 'one_person_llc', vatTaxpayerStatus: 'small_scale', vatFilingCycle: 'quarterly',
    incomeTaxCollection: 'audit', industry: 'modern_service', hasInventory: false, hasBranches: false,
    hasImportExport: false, hasForeignCurrency: false, hasSpecialVatFivePercent: false,
    hasDifferenceTax: false, hasCrossRegionPrepayment: false, hasComplexPayroll: false,
    hasShareholderTransactions: false, hasComplexTaxAdjustments: false, sourceDocumentsComplete: true,
  }, context);
  await new LedgerSetupService(organizations, scopes, setups).create(created.company.id, {
    accountName: '基本户', accountType: 'bank', bankName: '招商银行', accountNumberLast4: '1234',
    openingBalance: '0', openingBalanceSource: 'none', openingBalanceAsOf: '2026-09-30',
    periodStart: '2026-10-01', periodEnd: '2026-10-31',
  }, context);
  const party = await new CounterpartyService(organizations, setups, parties)
    .create(created.company.id, { name: '示例客户', type: 'customer' }, context);
  const invoiceService = new InvoiceService(setups, parties, invoices, new MockInvoiceExtractionProvider());
  const eventService = new BusinessEventService(setups, parties, events);
  const service = new ReconciliationService(invoices, events, settlements, setups, checks);
  const accounting = new AccountingService(setups, events, new MemoryVoucherStore(), settlements);
  async function invoice(number: string, total = '106.00') {
    const draft = await invoiceService.create(created.company.id, {
      direction: 'output', kind: 'ordinary', color: 'blue', invoiceNumber: number, issuedOn: '2026-10-08',
      counterpartyId: party.id, amountExcludingTax: (Number(total) - 6).toFixed(2), taxAmount: '6.00',
      totalAmount: total, source: 'manual',
    }, context);
    return invoiceService.confirm(created.company.id, draft.id, context);
  }
  async function payment(amount: string) {
    const draft = await eventService.create(created.company.id, {
      type: 'money_received', occurredOn: '2026-10-09', amount, counterpartyId: party.id, description: '收到客户款',
    }, context);
    return eventService.confirm(created.company.id, draft.id, context);
  }
  return { created, context, service, accounting, invoice, payment, setups };
}

describe('ReconciliationService', () => {
  it('fully reconciles an invoice and payment and unlocks voucher generation', async () => {
    const { created, context, service, accounting, invoice, payment } = await fixture();
    const inv = await invoice('12345678'); const pay = await payment('106.00');
    await service.create(created.company.id, { invoiceId: inv.id, paymentEventId: pay.id, amount: '106.00' }, context);
    const overview = await service.overview(created.company.id, context);
    expect(overview.invoices[0]?.status).toBe('settled'); expect(overview.payments[0]?.status).toBe('settled');
    const generated = await accounting.generate(created.company.id, pay.id, context);
    expect(generated.voucher.entries.map((item) => item.accountCode)).toEqual(['1002', '1122']);
  });

  it('supports one invoice settled by multiple payments', async () => {
    const { created, context, service, invoice, payment } = await fixture();
    const inv = await invoice('12345679'); const first = await payment('60.00'); const second = await payment('46.00');
    await service.create(created.company.id, { invoiceId: inv.id, paymentEventId: first.id, amount: '60.00' }, context);
    await service.create(created.company.id, { invoiceId: inv.id, paymentEventId: second.id, amount: '46.00' }, context);
    const overview = await service.overview(created.company.id, context);
    expect(overview.invoices[0]?.allocatedAmount).toBe('106.00'); expect(overview.settlements).toHaveLength(2);
  });

  it('rejects over-allocation and duplicate pairs', async () => {
    const { created, context, service, invoice, payment } = await fixture();
    const inv = await invoice('12345680'); const pay = await payment('50.00');
    await expect(service.create(created.company.id, { invoiceId: inv.id, paymentEventId: pay.id, amount: '51.00' }, context)).rejects.toMatchObject({ status: 400 });
    await service.create(created.company.id, { invoiceId: inv.id, paymentEventId: pay.id, amount: '50.00' }, context);
    await expect(service.create(created.company.id, { invoiceId: inv.id, paymentEventId: pay.id, amount: '1.00' }, context)).rejects.toMatchObject({ status: 409 });
  });

  it('blocks new settlements after period lock', async () => {
    const { created, context, service, invoice, payment, setups } = await fixture();
    const inv = await invoice('12345681'); const pay = await payment('106.00');
    await setups.lockCurrentPeriod({ tenantId: context.tenantId, companyId: created.company.id, actorId, traceId: 'lock', lockedAt: new Date() });
    await expect(service.create(created.company.id, { invoiceId: inv.id, paymentEventId: pay.id, amount: '106.00' }, context))
      .rejects.toMatchObject({ status: 409, response: { code: 'ACCOUNTING_PERIOD_LOCKED' } });
  });

  it('freezes all differences, tracks triage and only turns green after facts are fixed', async () => {
    const { created, context, service, invoice, payment } = await fixture();
    const inv = await invoice('12345682'); const pay = await payment('106.00');
    const first = await service.runCheck(created.company.id, context);
    expect(first).toMatchObject({ grade: 'yellow', blocksFiling: true, totalIssues: 2 });
    expect((await service.runCheck(created.company.id, context)).id).toBe(first.id);
    const issue = first.issues[0]!;
    await expect(service.triageIssue(created.company.id, first.id, issue.id, {
      status: 'ready_for_recheck', note: '资料已经确认，等待重新检查。', expectedVersion: 1,
    }, context)).rejects.toMatchObject({ status: 400 });
    const triaged = await service.triageIssue(created.company.id, first.id, issue.id, {
      status: 'investigating', note: '正在核对原始流水与发票。', expectedVersion: 1,
    }, context);
    expect(triaged).toMatchObject({ triageStatus: 'investigating', triageVersion: 2 });
    await expect(service.triageIssue(created.company.id, first.id, issue.id, {
      status: 'needs_documents', note: '请补充对应的银行回单。', expectedVersion: 1,
    }, context)).rejects.toMatchObject({ status: 409 });
    await service.create(created.company.id, { invoiceId: inv.id, paymentEventId: pay.id, amount: '106.00' }, context);
    const green = await service.runCheck(created.company.id, context);
    expect(green).toMatchObject({ grade: 'green', blocksFiling: false, totalIssues: 0 });
    expect(green.id).not.toBe(first.id);
  });
});
