import { describe, expect, it } from 'vitest';
import { DocumentStatus, DocumentType } from '@ledgerly/domain';
import type { OrganizationStore } from '../src/modules/organization/application/organization-store.js';
import { FilingEvidenceService } from '../src/modules/filing/application/filing-evidence.service.js';
import { FilingAdjustmentService } from '../src/modules/filing/application/filing-adjustment.service.js';
import { MemoryFilingStore } from '../src/modules/filing/infrastructure/memory-filing.store.js';
import { MemoryDocumentStore } from '../src/modules/document/infrastructure/memory-document.store.js';

const actorId = '10000000-0000-4000-8000-000000000001',
  tenantId = '20000000-0000-4000-8000-000000000002',
  companyId = '30000000-0000-4000-8000-000000000003',
  taskId = '40000000-0000-4000-8000-000000000004',
  packageId = '50000000-0000-4000-8000-000000000005',
  calendarId = '60000000-0000-4000-8000-000000000006',
  entryId = '70000000-0000-4000-8000-000000000007',
  resultHash = 'a'.repeat(64),
  context = { actorId, tenantId, traceId: 'r4-test' };
const organizations: OrganizationStore = {
  bootstrap: () => Promise.resolve(),
  findCompany: (tenant, company) =>
    Promise.resolve(
      tenant === tenantId && company === companyId ? ({ id: companyId } as never) : null,
    ),
  recordDeniedCompanyAccess: () => Promise.resolve(),
};

async function fixture() {
  const filing = new MemoryFilingStore(),
    documents = new MemoryDocumentStore(),
    service = new FilingEvidenceService(filing, organizations, documents),
    now = new Date('2026-10-09T00:00:00Z');
  await filing.createCalendar({
    tenantId,
    traceId: 'seed',
    calendar: {
      id: calendarId,
      name: 'R4 测试日历',
      versionTag: 'r4-test',
      jurisdictionCode: 'CN-JS',
      year: 2026,
      source: { type: 'test_fixture', title: 'R4 非生产测试' },
      contentHash: 'b'.repeat(64),
      createdAt: now,
      createdBy: actorId,
      entries: [
        {
          id: entryId,
          taxType: 'vat',
          label: 'R4 测试申报',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          dueDate: '2026-10-09',
        },
      ],
    },
  });
  const task = {
    id: taskId,
    companyId,
    calendarId,
    calendarEntryId: entryId,
    calendarName: 'R4 测试日历',
    calendarSourceType: 'test_fixture' as const,
    taxType: 'vat' as const,
    label: 'R4 测试申报',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    dueDate: '2026-10-09',
    status: 'paid' as const,
    version: 3,
    filedAt: now,
    filedBy: actorId,
    paidAt: now,
    paidBy: actorId,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };
  await filing.generateTasks({
    tenantId,
    companyId,
    calendar: (await filing.findCalendar(tenantId, calendarId))!,
    tasks: [task],
    actorId,
    traceId: 'seed',
    occurredAt: now,
  });
  await filing.createPackage({
    tenantId,
    traceId: 'seed',
    package: {
      id: packageId,
      companyId,
      status: 'frozen',
      version: 2,
      snapshot: {
        filingTaskId: taskId,
        filingCalendarId: calendarId,
        filingCalendarHash: 'b'.repeat(64),
        calculationRunId: '80000000-0000-4000-8000-000000000008',
        taxResultSource: 'test_fixture',
        inputHash: 'c'.repeat(64),
        ruleVersionId: '90000000-0000-4000-8000-000000000009',
        ruleHash: 'd'.repeat(64),
        resultHash,
        reviewDecisions: [],
        sopVersionId: 'a0000000-0000-4000-8000-00000000000a',
        sopHash: 'e'.repeat(64),
      },
      contentHash: 'f'.repeat(64),
      blockers: [],
      frozenAt: now,
      frozenBy: actorId,
      createdAt: now,
      createdBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
    },
  });
  const save = async (id: string, hash: string) =>
    documents.save({
      id,
      tenantId,
      companyId,
      actorId,
      traceId: 'seed',
      createdAt: now,
      document: {
        type: DocumentType.Other,
        title: 'R4 测试凭证',
        accountingMonth: '2026-09',
        status: DocumentStatus.Active,
        currentVersion: 1,
      },
      version: {
        id: `${id.slice(0, -1)}f`,
        versionNumber: 1,
        fileName: 'proof.pdf',
        mediaType: 'application/pdf',
        byteSize: 10,
        sha256: hash,
        storageKey: `${id}/v1`,
        scanStatus: 'clean',
        scanEngine: 'test',
        createdAt: now,
        createdBy: actorId,
      },
    });
  return { filing, documents, service, save };
}

describe('FilingEvidenceService', () => {
  it('archives append-only evidence, reconciles result hash and closes once', async () => {
    const { service, save } = await fixture(),
      receiptId = 'b0000000-0000-4000-8000-00000000000b',
      proofId = 'c0000000-0000-4000-8000-00000000000c',
      receiptHash = '1'.repeat(64),
      proofHash = '2'.repeat(64);
    await save(receiptId, receiptHash);
    await save(proofId, proofHash);
    await expect(
      service.close(companyId, packageId, { note: '缺少回执时不能关闭申报任务' }, context),
    ).rejects.toMatchObject({
      response: {
        code: 'FILING_CLOSURE_BLOCKED',
        blockers: ['FILING_RECEIPT_REQUIRED', 'PAYMENT_PROOF_REQUIRED'],
      },
    });
    const receipt = await service.archive(
      companyId,
      packageId,
      {
        kind: 'filing_receipt',
        documentId: receiptId,
        documentVersion: 1,
        documentHash: receiptHash,
        externalReference: 'TEST-RECEIPT-001',
        occurredAt: '2026-10-09T01:00:00.000Z',
        reportedResultHash: resultHash,
        note: '仅用于 R4 非生产回执测试',
      },
      context,
    );
    const same = await service.archive(
      companyId,
      packageId,
      {
        kind: 'filing_receipt',
        documentId: receiptId,
        documentVersion: 1,
        documentHash: receiptHash,
        externalReference: 'TEST-RECEIPT-001',
        occurredAt: '2026-10-09T01:00:00.000Z',
        reportedResultHash: resultHash,
        note: '仅用于 R4 非生产回执测试',
      },
      context,
    );
    expect(same.id).toBe(receipt.id);
    await service.archive(
      companyId,
      packageId,
      {
        kind: 'tax_payment_proof',
        documentId: proofId,
        documentVersion: 1,
        documentHash: proofHash,
        externalReference: 'TEST-PAYMENT-001',
        occurredAt: '2026-10-09T02:00:00.000Z',
        note: '仅用于 R4 非生产完税凭证测试',
      },
      context,
    );
    const closed = await service.close(
      companyId,
      packageId,
      { note: '回执、完税凭证与冻结结果核对一致' },
      context,
    );
    expect(closed).toMatchObject({
      filingPackageId: packageId,
      resultHash,
    });
    expect(closed.evidenceIds).toContain(receipt.id);
    expect(
      (await service.close(companyId, packageId, { note: '重复关闭返回同一不可变记录' }, context))
        .id,
    ).toBe(closed.id);
    await expect(
      service.archive(
        companyId,
        packageId,
        {
          kind: 'tax_payment_proof',
          documentId: proofId,
          documentVersion: 1,
          documentHash: proofHash,
          externalReference: 'TEST-PAYMENT-002',
          occurredAt: '2026-10-09T03:00:00.000Z',
          note: '关闭后不得追加凭证覆盖历史',
        },
        context,
      ),
    ).rejects.toMatchObject({ response: { code: 'FILING_PACKAGE_ALREADY_CLOSED' } });
  });
  it('blocks closure on open adjustments and requires an independent evidenced resolution',async()=>{
    const{service,filing,documents,save}=await fixture(),proofId='d0000000-0000-4000-8000-00000000000d',proofHash='3'.repeat(64),reviewerId='e0000000-0000-4000-8000-00000000000e';
    await save(proofId,proofHash);
    const adjustments=new FilingAdjustmentService(filing,organizations,documents),opened=await adjustments.create(companyId,{sourcePackageId:packageId,type:'additional_tax',reason:'测试发现冻结结果需要补充税款处理',evidenceDocumentIds:[proofId]},context);
    await expect(service.close(companyId,packageId,{note:'未完成调整工单时不得关闭'},context)).rejects.toMatchObject({response:{code:'FILING_CLOSURE_BLOCKED'}});
    const reviewer={...context,actorId:reviewerId},reviewing=await adjustments.transition(companyId,opened.id,{expectedVersion:1,action:'start_review',note:'独立复核人开始核验补税证据',resolutionEvidenceDocumentIds:[]},reviewer);
    await expect(adjustments.transition(companyId,opened.id,{expectedVersion:2,action:'resolve',note:'发起人不能解决自己的工单',resolutionEvidenceDocumentIds:[proofId]},context)).rejects.toMatchObject({response:{code:'FILING_ADJUSTMENT_TRANSITION_REJECTED'}});
    const resolved=await adjustments.transition(companyId,opened.id,{expectedVersion:reviewing.version,action:'resolve',note:'独立复核确认补税凭证完整有效',resolutionEvidenceDocumentIds:[proofId]},reviewer);
    expect(resolved).toMatchObject({status:'resolved',version:3,reviewedBy:reviewerId});
  });
});
