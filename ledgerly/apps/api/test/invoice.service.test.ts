import { describe, expect, it } from 'vitest';
import { OrganizationService } from '../src/modules/organization/application/organization.service.js';
import { MemoryOrganizationStore } from '../src/modules/organization/infrastructure/memory-organization.store.js';
import { ProfileScopeService } from '../src/modules/profile-scope/application/profile-scope.service.js';
import { MemoryScopeStore } from '../src/modules/profile-scope/infrastructure/memory-scope.store.js';
import { LedgerSetupService } from '../src/modules/ledger-setup/application/ledger-setup.service.js';
import { MemoryLedgerSetupStore } from '../src/modules/ledger-setup/infrastructure/memory-ledger-setup.store.js';
import { CounterpartyService } from '../src/modules/counterparty/application/counterparty.service.js';
import { MemoryCounterpartyStore } from '../src/modules/counterparty/infrastructure/memory-counterparty.store.js';
import { InvoiceService } from '../src/modules/invoice/application/invoice.service.js';
import { MemoryInvoiceStore } from '../src/modules/invoice/infrastructure/memory-invoice.store.js';
import { MockInvoiceExtractionProvider } from '../src/modules/invoice/infrastructure/mock-invoice-extraction.provider.js';

const actorId = '10000000-0000-4000-8000-000000000001';

async function fixture() {
  const organizations = new MemoryOrganizationStore(); const scopes = new MemoryScopeStore();
  const setups = new MemoryLedgerSetupStore(); const counterparties = new MemoryCounterpartyStore();
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
  const parties = new CounterpartyService(organizations, setups, counterparties);
  const customer = await parties.create(created.company.id, { name: '示例客户', type: 'customer' }, context);
  const supplier = await parties.create(created.company.id, { name: '示例供应商', type: 'supplier' }, context);
  return {
    created, context, customer, supplier, setups,
    service: new InvoiceService(setups, counterparties, new MemoryInvoiceStore(), new MockInvoiceExtractionProvider()),
  };
}

describe('InvoiceService', () => {
  it('creates and confirms a balanced output invoice', async () => {
    const { created, context, customer, service } = await fixture();
    const draft = await service.create(created.company.id, {
      direction: 'output', kind: 'ordinary', color: 'blue', invoiceNumber: '1234-5678',
      issuedOn: '2026-10-08', counterpartyId: customer.id, amountExcludingTax: '1000.00',
      taxAmount: '60.00', totalAmount: '1060.00', source: 'manual',
    }, context);
    const confirmed = await service.confirm(created.company.id, draft.id, context);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.invoiceNumber).toBe('12345678');
  });

  it('rejects a duplicate number in the same direction', async () => {
    const { created, context, customer, service } = await fixture();
    const input = { direction: 'output' as const, kind: 'ordinary' as const, color: 'blue' as const, invoiceNumber: '12345678', issuedOn: '2026-10-08', counterpartyId: customer.id, amountExcludingTax: '100.00', taxAmount: '6.00', totalAmount: '106.00', source: 'manual' as const };
    await service.create(created.company.id, input, context);
    await expect(service.create(created.company.id, input, context)).rejects.toMatchObject({ status: 409 });
  });

  it('requires suppliers for input invoices', async () => {
    const { created, context, customer, service } = await fixture();
    await expect(service.create(created.company.id, {
      direction: 'input', kind: 'special', color: 'blue', invoiceNumber: '87654321',
      issuedOn: '2026-10-08', counterpartyId: customer.id, amountExcludingTax: '100.00',
      taxAmount: '6.00', totalAmount: '106.00', source: 'manual',
    }, context)).rejects.toMatchObject({ status: 409 });
  });

  it('extracts a mock candidate and matches the counterparty exactly', async () => {
    const { created, context, customer, service } = await fixture();
    const result = await service.extract(created.company.id, '方向：销项\n票种：普通发票\n蓝红：蓝字\n发票号码：12345678\n开票日期：2026-10-08\n往来单位：示例客户\n不含税金额：100.00\n税额：6.00\n价税合计：106.00', context);
    expect(result.candidate.counterpartyId).toBe(customer.id);
    expect(result.requiresConfirmation).toBe(true);
  });

  it('allows extraction but blocks invoice creation after period lock', async () => {
    const { created, context, customer, setups, service } = await fixture();
    await setups.lockCurrentPeriod({ tenantId:context.tenantId, companyId:created.company.id, actorId, traceId:'lock', lockedAt:new Date() });
    await expect(service.extract(created.company.id,'方向：销项',context)).resolves.toBeDefined();
    await expect(service.create(created.company.id, {
      direction:'output', kind:'ordinary', color:'blue', invoiceNumber:'12345670', issuedOn:'2026-10-08', counterpartyId:customer.id,
      amountExcludingTax:'100.00', taxAmount:'6.00', totalAmount:'106.00', source:'manual',
    }, context)).rejects.toMatchObject({ status:409, response:{ code:'ACCOUNTING_PERIOD_LOCKED' } });
  });
});
