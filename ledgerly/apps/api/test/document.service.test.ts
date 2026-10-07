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
import { DocumentService } from '../src/modules/document/application/document.service.js';
import { MemoryDocumentStore } from '../src/modules/document/infrastructure/memory-document.store.js';
import { MemoryObjectStorage } from '../src/modules/document/infrastructure/memory-object-storage.js';
import { SignatureFileScanner } from '../src/modules/document/infrastructure/signature-file-scanner.js';

const actorId = '10000000-0000-4000-8000-000000000001';
const encoded = (value: string) => Buffer.from(value).toString('base64');

async function fixture() {
  const organizations = new MemoryOrganizationStore(); const scopes = new MemoryScopeStore();
  const setups = new MemoryLedgerSetupStore(); const counterparties = new MemoryCounterpartyStore();
  const events = new MemoryBusinessEventStore();
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
  const party = await new CounterpartyService(organizations, setups, counterparties)
    .create(created.company.id, { name: '示例客户', type: 'customer' }, context);
  const eventService = new BusinessEventService(setups, counterparties, events);
  const event = await eventService.create(created.company.id, {
    type: 'service_completed', occurredOn: '2026-10-08', amount: '1060.00',
    counterpartyId: party.id, description: '技术服务',
  }, context);
  return {
    created, context, event,
    service: new DocumentService(setups, events, new MemoryDocumentStore(), new MemoryObjectStorage(), new SignatureFileScanner()),
  };
}

describe('DocumentService', () => {
  it('uploads, reads and links a private document', async () => {
    const { created, context, event, service } = await fixture();
    const result = await service.upload(created.company.id, {
      type: 'contract', title: '服务合同', accountingMonth: '2026-10',
      fileName: 'contract.pdf', mediaType: 'application/pdf', contentBase64: encoded('%PDF-1.4 contract'),
    }, context);
    expect(result.duplicate).toBe(false); expect(result.document.currentVersion).toBe(1);
    const version = result.document.versions[0]!;
    const content = await service.content(created.company.id, result.document.id, version.id, context);
    expect(Buffer.from(content.contentBase64, 'base64').toString()).toBe('%PDF-1.4 contract');
    const linked = await service.linkBusinessEvent(created.company.id, result.document.id, event.id, context);
    expect(linked.linkedBusinessEventIds).toEqual([event.id]);
  });

  it('returns the existing document for an identical file', async () => {
    const { created, context, service } = await fixture();
    const input = { type: 'contract' as const, title: '合同', accountingMonth: '2026-10', fileName: 'a.pdf', mediaType: 'application/pdf' as const, contentBase64: encoded('same-content') };
    const first = await service.upload(created.company.id, input, context);
    const second = await service.upload(created.company.id, { ...input, title: '重复合同' }, context);
    expect(second.duplicate).toBe(true); expect(second.document.id).toBe(first.document.id);
  });

  it('adds an immutable second version', async () => {
    const { created, context, service } = await fixture();
    const first = await service.upload(created.company.id, {
      type: 'contract', title: '合同', accountingMonth: '2026-10', fileName: 'v1.pdf',
      mediaType: 'application/pdf', contentBase64: encoded('version-one'),
    }, context);
    const second = await service.addVersion(created.company.id, first.document.id, {
      fileName: 'v2.pdf', mediaType: 'application/pdf', contentBase64: encoded('version-two'),
    }, context);
    expect(second.document.currentVersion).toBe(2); expect(second.document.versions).toHaveLength(2);
  });

  it('rejects a known antivirus test signature before persistence', async () => {
    const { created, context, service } = await fixture();
    await expect(service.upload(created.company.id, {
      type: 'other', title: '危险文件', accountingMonth: '2026-10', fileName: 'bad.pdf',
      mediaType: 'application/pdf', contentBase64: encoded('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'),
    }, context)).rejects.toMatchObject({ status: 400 });
    expect(await service.list(created.company.id, context)).toHaveLength(0);
  });
});
