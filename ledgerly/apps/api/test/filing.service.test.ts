import { describe, expect, it } from 'vitest';
import type { OrganizationStore } from '../src/modules/organization/application/organization-store.js';
import { FilingService } from '../src/modules/filing/application/filing.service.js';
import { MemoryFilingStore } from '../src/modules/filing/infrastructure/memory-filing.store.js';
import { MemoryCalculationStore } from '../src/modules/calculation/infrastructure/memory-calculation.store.js';
import { MemoryReviewCaseStore } from '../src/modules/review-case/infrastructure/memory-review-case.store.js';
import { UnavailableTaxResultReferenceAdapter } from '../src/modules/filing/infrastructure/unavailable-tax-result-reference.adapter.js';
import { MemoryTaxResultReferenceAdapter } from '../src/modules/filing/infrastructure/memory-tax-result-reference.adapter.js';
import type { TaxResultReferencePort } from '../src/modules/filing/application/tax-result-reference.port.js';

const actorId = '10000000-0000-4000-8000-000000000001',
  tenantId = '20000000-0000-4000-8000-000000000002',
  companyId = '30000000-0000-4000-8000-000000000003';
const context = { actorId, tenantId, traceId: 'filing-test' };
const organizations: OrganizationStore = {
  bootstrap: () => Promise.resolve(),
  findCompany: (tenant, company) =>
    Promise.resolve(
      tenant === tenantId && company === companyId
        ? ({
            id: companyId,
            tenantId,
            name: '测试企业',
            unifiedSocialCreditCode: '913200001234567890',
            provinceCode: '32',
            cityCode: '3201',
            status: 'draft',
            version: 1,
            createdAt: new Date(),
            createdBy: actorId,
          } as never)
        : null,
    ),
  recordDeniedCompanyAccess: () => Promise.resolve(),
};
const input = {
  name: 'R2 测试征期日历',
  versionTag: 'r2-fixture-1',
  jurisdictionCode: 'CN-JS',
  year: 2026,
  source: { type: 'test_fixture' as const, title: '仅用于 R2 流程演示' },
  entries: [
    {
      taxType: 'vat' as const,
      label: '增值税测试申报',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      dueDate: '2026-10-09',
    },
  ],
};
const sopInput = {
  name: 'R3 测试申报 SOP',
  versionTag: 'r3-fixture-1',
  jurisdictionCode: 'CN-JS',
  source: { type: 'test_fixture' as const, title: '仅用于 R3 冻结流程演示' },
  steps: [
    { code: 'prepare', title: '准备资料', instruction: '核对申报任务、计算引用和已批准复核记录' },
  ],
};
const service = () =>
  new FilingService(
    new MemoryFilingStore(),
    organizations,
    new MemoryCalculationStore(),
    new MemoryReviewCaseStore(),
    new UnavailableTaxResultReferenceAdapter(),
  );

describe('FilingService', () => {
  it('creates a versioned calendar and generates company tasks idempotently', async () => {
    const app = service();
    const calendar = await app.createCalendar(input, context),
      same = await app.createCalendar(input, context);
    expect(calendar.created).toBe(true);
    expect(same).toMatchObject({ created: false, calendar: { id: calendar.calendar.id } });
    const first = await app.generate(
        companyId,
        { calendarId: calendar.calendar.id, usage: 'test' },
        context,
      ),
      second = await app.generate(
        companyId,
        { calendarId: calendar.calendar.id, usage: 'test' },
        context,
      );
    expect(first).toMatchObject({ createdCount: 1, items: [{ status: 'todo' }] });
    expect(second).toMatchObject({ createdCount: 0, items: [{ id: first.items[0]!.id }] });
  });
  it('blocks fixture calendars in production and derives overdue todos', async () => {
    const app = service(),
      calendar = (await app.createCalendar(input, context)).calendar;
    await expect(
      app.generate(companyId, { calendarId: calendar.id, usage: 'production' }, context),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'PRODUCTION_CALENDAR_SOURCE_REQUIRED' },
    });
    await app.generate(companyId, { calendarId: calendar.id, usage: 'test' }, context);
    expect(await app.todos(companyId, context, '2026-10-10')).toMatchObject([
      { status: 'todo', timing: 'overdue' },
    ]);
  });
  it('enforces optimistic forward-only task transitions', async () => {
    const app = service(),
      calendar = (await app.createCalendar(input, context)).calendar,
      task = (await app.generate(companyId, { calendarId: calendar.id, usage: 'test' }, context))
        .items[0]!;
    const filed = await app.transition(
      companyId,
      task.id,
      { expectedVersion: 1, action: 'mark_filed', note: '已在官方平台自主申报' },
      context,
    );
    expect(filed).toMatchObject({ status: 'filed', version: 2 });
    await expect(
      app.transition(
        companyId,
        task.id,
        { expectedVersion: 1, action: 'mark_paid', note: '过期版本不得写入' },
        context,
      ),
    ).rejects.toMatchObject({ response: { code: 'FILING_TASK_CHANGED' } });
    const paid = await app.transition(
      companyId,
      task.id,
      { expectedVersion: 2, action: 'mark_paid', note: '已在官方渠道完成缴款' },
      context,
    );
    expect(paid).toMatchObject({ status: 'paid', version: 3, timing: 'completed' });
  });
  it('stores immutable SOP versions idempotently and rejects content replacement', async () => {
    const app = service(),
      first = await app.createSop(sopInput, context),
      same = await app.createSop(sopInput, context);
    expect(first.created).toBe(true);
    expect(first.sop.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(same).toMatchObject({ created: false, sop: { id: first.sop.id } });
    await expect(
      app.createSop(
        {
          ...sopInput,
          steps: [{ ...sopInput.steps[0]!, instruction: '试图覆盖相同版本号下的既有不可变步骤' }],
        },
        context,
      ),
    ).rejects.toMatchObject({ status: 409, response: { code: 'FILING_SOP_VERSION_EXISTS' } });
    expect(await app.listSops(context)).toHaveLength(1);
  });
  it('creates explicit hash-only result fixtures only through the memory adapter', async () => {
    const calculations = new MemoryCalculationStore(),
      results = new MemoryTaxResultReferenceAdapter(),
      app = new FilingService(
        new MemoryFilingStore(),
        organizations,
        calculations,
        new MemoryReviewCaseStore(),
        results,
      ),
      calculationRunId = '80000000-0000-4000-8000-000000000008';
    await calculations.save({
      traceId: 'fixture',
      factIds: [],
      run: {
        id: calculationRunId,
        tenantId,
        companyId,
        taxType: 'vat',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        status: 'decision_required',
        inputSnapshot: {
          companyId,
          taxType: 'vat',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          jurisdictionCodes: ['CN-JS'],
          facts: [],
        },
        inputHash: 'd'.repeat(64),
        decision: {
          code: 'IMPLEMENTATION_NOT_REGISTERED',
          message: '测试模式不注册生产税率实现',
          candidateRuleVersionIds: [],
        },
        steps: [],
        createdAt: new Date(),
        createdBy: actorId,
      },
    });
    const fixture = await app.createTestResultFixture(
      companyId,
      { calculationRunId, attestation: 'TEST_FIXTURE_ONLY' },
      context,
    );
    expect(fixture).toMatchObject({
      source: 'test_fixture',
      calculationRunId,
      inputHash: 'd'.repeat(64),
    });
    expect(fixture.ruleContentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fixture.resultHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await results.find(tenantId, companyId, calculationRunId)).toEqual(fixture);
    const disabled = new FilingService(
      new MemoryFilingStore(),
      organizations,
      calculations,
      new MemoryReviewCaseStore(),
      new UnavailableTaxResultReferenceAdapter(),
    );
    await expect(
      disabled.createTestResultFixture(
        companyId,
        { calculationRunId, attestation: 'TEST_FIXTURE_ONLY' },
        context,
      ),
    ).rejects.toMatchObject({ response: { code: 'TEST_RESULT_FIXTURE_DISABLED' } });
  });
  it('creates and freezes a package only while every live reference still matches', async () => {
    const stores = {
        filing: new MemoryFilingStore(),
        calculations: new MemoryCalculationStore(),
        reviews: new MemoryReviewCaseStore(),
      },
      hash = 'a'.repeat(64),
      ruleVersionId = '40000000-0000-4000-8000-000000000004',
      reviewCaseId = '50000000-0000-4000-8000-000000000005';
    let resultHash = 'b'.repeat(64);
    const results: TaxResultReferencePort = {
        find: (_tenant, _company, calculationRunId) =>
          Promise.resolve({
            source: 'calculation_result',
            calculationRunId,
            inputHash: hash,
            ruleVersionId,
            ruleContentHash: hash,
            resultHash,
          }),
      },
      app = new FilingService(
        stores.filing,
        organizations,
        stores.calculations,
        stores.reviews,
        results,
      ),
      calendar = (await app.createCalendar(input, context)).calendar,
      task = (await app.generate(companyId, { calendarId: calendar.id, usage: 'test' }, context))
        .items[0]!,
      sop = (await app.createSop(sopInput, context)).sop,
      calculationRunId = '60000000-0000-4000-8000-000000000006';
    await stores.calculations.save({
      traceId: 'calc',
      factIds: [],
      run: {
        id: calculationRunId,
        tenantId,
        companyId,
        taxType: 'vat',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        status: 'ready',
        inputSnapshot: {
          companyId,
          taxType: 'vat',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          jurisdictionCodes: ['CN-JS'],
          facts: [],
        },
        inputHash: hash,
        ruleVersionId,
        ruleContentHash: hash,
        steps: [],
        createdAt: new Date(),
        createdBy: actorId,
      },
    });
    await stores.reviews.create({
      id: reviewCaseId,
      tenantId,
      companyId,
      sourceType: 'reconciliation_issue',
      sourceId: '70000000-0000-4000-8000-000000000007',
      riskLevel: 'yellow',
      blocksFiling: false,
      summary: '申报包测试复核',
      assignedTo: actorId,
      status: 'approved',
      actorId,
      traceId: 'review',
      occurredAt: new Date('2026-10-09T00:00:00Z'),
    });
    const draft = await app.createPackage(
      companyId,
      {
        filingTaskId: task.id,
        calculationRunId,
        sopVersionId: sop.id,
        reviewCaseIds: [reviewCaseId],
      },
      context,
    );
    expect(draft).toMatchObject({ status: 'draft', version: 1, blockers: [] });
    await expect(
      app.createPackage(
        companyId,
        {
          filingTaskId: task.id,
          calculationRunId,
          sopVersionId: sop.id,
          reviewCaseIds: [reviewCaseId],
          correctionOfPackageId: draft.id,
        },
        context,
      ),
    ).rejects.toMatchObject({ response: { code: 'FILING_PACKAGE_CORRECTION_REJECTED' } });
    await expect(
      app.getPackage(companyId, draft.id, {
        ...context,
        tenantId: '90000000-0000-4000-8000-000000000009',
      }),
    ).rejects.toMatchObject({ status: 404 });
    resultHash = 'c'.repeat(64);
    await expect(
      app.freezePackage(
        companyId,
        draft.id,
        { expectedVersion: 1, note: '引用变化后不得冻结' },
        context,
      ),
    ).rejects.toMatchObject({
      response: { code: 'FILING_PACKAGE_FREEZE_BLOCKED', blockers: ['REFERENCE_HASH_MISMATCH'] },
    });
    resultHash = 'b'.repeat(64);
    expect(
      await app.freezePackage(
        companyId,
        draft.id,
        { expectedVersion: 1, note: '全部引用复核完成后冻结' },
        context,
      ),
    ).toMatchObject({ status: 'frozen', version: 2, blockers: [] });
    await expect(
      app.freezePackage(
        companyId,
        draft.id,
        { expectedVersion: 1, note: '并发页面的过期版本不得覆盖' },
        context,
      ),
    ).rejects.toMatchObject({ response: { code: 'FILING_PACKAGE_CHANGED' } });
    await expect(
      app.freezePackage(
        companyId,
        draft.id,
        { expectedVersion: 2, note: '冻结终态不可再次修改' },
        context,
      ),
    ).rejects.toMatchObject({
      response: { code: 'FILING_PACKAGE_FREEZE_BLOCKED', blockers: ['PACKAGE_NOT_DRAFT'] },
    });
    const redId = 'a0000000-0000-4000-8000-00000000000a';
    await stores.reviews.create({
      id: redId,
      tenantId,
      companyId,
      sourceType: 'reconciliation_issue',
      sourceId: 'b0000000-0000-4000-8000-00000000000b',
      riskLevel: 'red',
      blocksFiling: true,
      summary: '尚未解决的红色申报阻断',
      assignedTo: actorId,
      status: 'open',
      actorId,
      traceId: 'red',
      occurredAt: new Date(),
    });
    const correction = await app.createPackage(
      companyId,
      {
        filingTaskId: task.id,
        calculationRunId,
        sopVersionId: sop.id,
        reviewCaseIds: [reviewCaseId],
        correctionOfPackageId: draft.id,
      },
      context,
    );
    expect(correction).toMatchObject({
      correctionOfPackageId: draft.id,
      blockers: ['RED_REVIEW_BLOCKER'],
    });
    await expect(
      app.freezePackage(
        companyId,
        correction.id,
        { expectedVersion: 1, note: '红色阻断未解决不得冻结' },
        context,
      ),
    ).rejects.toMatchObject({
      response: { code: 'FILING_PACKAGE_FREEZE_BLOCKED', blockers: ['RED_REVIEW_BLOCKER'] },
    });
  });
});
