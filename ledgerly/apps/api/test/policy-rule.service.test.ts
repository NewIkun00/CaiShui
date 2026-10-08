import { describe, expect, it } from 'vitest';
import { PolicyRuleService } from '../src/modules/policy-rule/application/policy-rule.service.js';
import { MemoryPolicyRuleStore } from '../src/modules/policy-rule/infrastructure/memory-policy-rule.store.js';
import { RuleVersionStatus } from '@ledgerly/domain';

const actorId = '10000000-0000-4000-8000-000000000001';
const context = { actorId, traceId: 'policy-rule-test' };
const contentHash = 'a'.repeat(64);

function policySourceInput() {
  return {
    documentNumber: '测试公告〔2026〕1号', title: '规则治理测试政策',
    officialUrl: 'https://www.chinatax.gov.cn/test-policy', issuingAuthority: '国家税务总局',
    publishedOn: '2026-01-01', effectiveFrom: '2026-01-01',
    summary: '测试用政策来源，不代表生产政策口径。', contentHash, lastVerifiedOn: '2026-10-08',
  } as const;
}

describe('PolicyRuleService', () => {
  it('creates a traceable draft rule version without activating it', async () => {
    const service = new PolicyRuleService(new MemoryPolicyRuleStore());
    const source = await service.createPolicySource(policySourceInput(), context);
    const rulePackage = await service.createRulePackage({
      code: 'vat.cn-js.small-scale', name: '江苏小规模增值税', taxType: 'vat',
      jurisdictions: ['CN', 'CN-JS'], description: '测试规则包，不包含生产政策参数。',
    }, context);
    const version = await service.createRuleVersion(rulePackage.id, {
      versionTag: '2026.10.08-1', effectiveFrom: '2026-10-08', sourceIds: [source.id],
      applicability: {
        taxpayerStatuses: ['small_scale'], filingCycles: ['quarterly'], industries: ['modern_service'],
        requiredTags: [], excludedTags: ['special_vat_five_percent'],
      },
      calculationImplementation: 'vat-small-scale-v1', parameters: {},
      explanation: '仅验证规则治理链路，不包含税率或生产计算。',
    }, context);
    expect(version.status).toBe('draft');
    expect(version.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await service.listRuleVersions(rulePackage.id)).toHaveLength(1);
  });

  it('rejects a duplicate policy source snapshot', async () => {
    const service = new PolicyRuleService(new MemoryPolicyRuleStore());
    await service.createPolicySource(policySourceInput(), context);
    await expect(service.createPolicySource(policySourceInput(), context))
      .rejects.toMatchObject({ status: 409 });
  });

  it('requires every rule version to reference an existing policy source', async () => {
    const service = new PolicyRuleService(new MemoryPolicyRuleStore());
    const rulePackage = await service.createRulePackage({
      code: 'vat.cn-js.test', name: '测试规则包', taxType: 'vat', jurisdictions: ['CN-JS'],
      description: '用于验证政策来源完整性。',
    }, context);
    await expect(service.createRuleVersion(rulePackage.id, {
      versionTag: '2026.10.08-1', effectiveFrom: '2026-10-08',
      sourceIds: ['20000000-0000-4000-8000-000000000001'],
      applicability: {
        taxpayerStatuses: ['small_scale'], filingCycles: ['quarterly'], industries: ['modern_service'],
        requiredTags: [], excludedTags: [],
      },
      calculationImplementation: 'vat-test-v1', parameters: {}, explanation: '测试。',
    }, context)).rejects.toMatchObject({ status: 404 });
  });

  it('enforces editor, technical reviewer, and tax reviewer separation', async () => {
    let now = new Date('2026-10-08T00:00:00Z');
    const store = new MemoryPolicyRuleStore();
    const service = new PolicyRuleService(store, () => now, {
      find: (key) => ({
        key,
        execute: (input) => ({
          output: { result: String(input['fact']).replace('input-', 'expected-') },
          steps: [{ key: 'test-only', explanation: '仅用于自动化测试的确定性实现。' }],
        }),
      }),
    });
    const source = await service.createPolicySource(policySourceInput(), context);
    const rulePackage = await service.createRulePackage({
      code: 'vat.cn-js.review-test', name: '双人审核测试规则包', taxType: 'vat',
      jurisdictions: ['CN-JS'], description: '用于验证审核职责分离。',
    }, context);
    const draft = await service.createRuleVersion(rulePackage.id, {
      versionTag: '2026.10.08-1', effectiveFrom: '2026-10-08', sourceIds: [source.id],
      applicability: {
        taxpayerStatuses: ['small_scale'], filingCycles: ['quarterly'], industries: ['modern_service'],
        requiredTags: [], excludedTags: [],
      },
      calculationImplementation: 'vat-review-test-v1', parameters: {}, explanation: '双人审核测试。',
    }, context);
    await expect(service.reviewRuleVersion(rulePackage.id, draft.id, {
      kind: 'technical', expectedVersion: 1, note: '编辑人不能自审。',
    }, context)).rejects.toMatchObject({ status: 409 });
    const technicalContext = { actorId: '20000000-0000-4000-8000-000000000002', traceId: 'technical-review' };
    const technical = await service.reviewRuleVersion(rulePackage.id, draft.id, {
      kind: 'technical', expectedVersion: 1, note: '工程实现、适用范围与确定性检查通过。',
    }, technicalContext);
    expect(technical.status).toBe('technical_reviewed');
    await expect(service.reviewRuleVersion(rulePackage.id, draft.id, {
      kind: 'tax', expectedVersion: 2, note: '同一审核人不能完成财税复核。',
    }, technicalContext)).rejects.toMatchObject({ status: 409 });
    const tax = await service.reviewRuleVersion(rulePackage.id, draft.id, {
      kind: 'tax', expectedVersion: 2, note: '财税口径与政策来源核对通过。',
    }, { actorId: '30000000-0000-4000-8000-000000000003', traceId: 'tax-review' });
    expect(tax.status).toBe('tax_reviewed');
    expect(tax.recordVersion).toBe(3);
    const taxContext = { actorId: '30000000-0000-4000-8000-000000000003', traceId: 'test-evidence' };
    const fixtureSet = await service.createGoldenFixtureSet(rulePackage.id, draft.id, {
      fixtureSetVersion: '2026.10.08-1', redactionAttested: true,
      professionalNote: '专业复核人确认样本已脱敏；这里只验证治理链路，不代表生产政策口径。',
      fixtures: ['normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception']
        .map((scenario, index) => ({
          caseId: `case-${index + 1}`, scenario: scenario as 'normal' | 'boundary' | 'cross_period' |
            'red_invoice' | 'correction' | 'exception',
          input: { fact: `input-${index + 1}` }, expected: { result: `expected-${index + 1}` },
          explanation: '专业签审的脱敏期望输出。',
        })),
    }, taxContext);
    expect(fixtureSet.fixtures).toHaveLength(6);
    await expect(new PolicyRuleService(store, () => now).executeGoldenFixtureSet(
      rulePackage.id, draft.id, fixtureSet.id, taxContext,
    )).rejects.toMatchObject({ status: 409 });
    const execution = await service.executeGoldenFixtureSet(
      rulePackage.id, draft.id, fixtureSet.id, taxContext,
    );
    expect(execution).toMatchObject({ status: 'passed', totalFixtures: 6, passedFixtures: 6 });
    await expect(service.recordRuleTestEvidence(rulePackage.id, draft.id, {
      expectedVersion: 3, fixtureSetVersion: '2026.10.08-1', totalFixtures: 6, passedFixtures: 6,
      coveredScenarios: ['normal', 'boundary'], artifactHash: 'c'.repeat(64), note: '覆盖场景不足。',
    }, taxContext)).rejects.toMatchObject({ status: 409 });
    await expect(service.recordRuleTestEvidence(rulePackage.id, draft.id, {
      expectedVersion: 3, fixtureSetVersion: '2026.10.08-1', totalFixtures: 6, passedFixtures: 6,
      coveredScenarios: ['normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception'],
      artifactHash: 'c'.repeat(64), note: '非财税审核人不能签署测试证据。',
    }, technicalContext)).rejects.toMatchObject({ status: 409 });
    const tested = await service.recordRuleTestEvidence(rulePackage.id, draft.id, {
      expectedVersion: 3, fixtureSetVersion: '2026.10.08-1', totalFixtures: 6, passedFixtures: 6,
      coveredScenarios: ['normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception'],
      artifactHash: execution.artifactHash, note: '全部脱敏黄金样本通过并完成财税签审。',
    }, taxContext);
    expect(tested.status).toBe('tested');
    expect(tested.recordVersion).toBe(4);
    expect(tested.testedBy).toBe(taxContext.actorId);
    await expect(service.approveRuleVersion(rulePackage.id, draft.id, {
      expectedVersion: 4, note: '参与过财税复核的人不能再审批。',
    }, taxContext)).rejects.toMatchObject({ status: 409 });
    const approvalContext = { actorId: '40000000-0000-4000-8000-000000000004', traceId: 'rule-approval' };
    const approved = await service.approveRuleVersion(rulePackage.id, draft.id, {
      expectedVersion: 4, note: '独立审批通过，准许进入定时发布准备。',
    }, approvalContext);
    expect(approved.status).toBe('approved');
    expect(approved.recordVersion).toBe(5);
    expect(approved.approvedBy).toBe(approvalContext.actorId);
    await expect(service.scheduleRuleVersion(rulePackage.id, draft.id, {
      expectedVersion: 5, activationAt: '2099-10-09T00:00:00+08:00', note: '非审批人不能安排发布。',
    }, technicalContext)).rejects.toMatchObject({ status: 409 });
    const scheduled = await service.scheduleRuleVersion(rulePackage.id, draft.id, {
      expectedVersion: 5, activationAt: '2099-10-09T00:00:00+08:00', note: '安排在规则有效期内按时激活。',
    }, approvalContext);
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.recordVersion).toBe(6);
    expect(scheduled.scheduledBy).toBe(approvalContext.actorId);
    expect(scheduled.activationAt?.toISOString()).toBe('2099-10-08T16:00:00.000Z');
    await expect(service.activateRuleVersion(rulePackage.id, draft.id, {
      expectedVersion: 6, note: '计划时间尚未到达。',
    }, approvalContext)).rejects.toMatchObject({ status: 409 });
    now = new Date('2099-10-08T16:00:00.000Z');
    const active = await service.activateRuleVersion(rulePackage.id, draft.id, {
      expectedVersion: 6, note: '计划时间已到，执行正式激活。',
    }, approvalContext);
    expect(active.status).toBe('active');
    expect(active.recordVersion).toBe(7);
    await expect(service.withdrawRuleVersion(rulePackage.id, draft.id, {
      expectedVersion: 7, note: '非审批人无权执行紧急撤回。',
    }, technicalContext)).rejects.toMatchObject({ status: 409 });
    const withdrawn = await service.withdrawRuleVersion(rulePackage.id, draft.id, {
      expectedVersion: 7, note: '发现异常，执行紧急撤回并保留发布记录。',
    }, approvalContext);
    expect(withdrawn.status).toBe('withdrawn');
    expect(withdrawn.recordVersion).toBe(8);
    expect(withdrawn.withdrawnBy).toBe(approvalContext.actorId);
  });

  it('rejects stale review commands with optimistic locking', async () => {
    const service = new PolicyRuleService(new MemoryPolicyRuleStore());
    const source = await service.createPolicySource(policySourceInput(), context);
    const rulePackage = await service.createRulePackage({
      code: 'vat.cn-js.lock-test', name: '乐观锁测试规则包', taxType: 'vat',
      jurisdictions: ['CN-JS'], description: '用于验证审核并发控制。',
    }, context);
    const draft = await service.createRuleVersion(rulePackage.id, {
      versionTag: '2026.10.08-1', effectiveFrom: '2026-10-08', sourceIds: [source.id],
      applicability: {
        taxpayerStatuses: ['small_scale'], filingCycles: ['quarterly'], industries: ['modern_service'],
        requiredTags: [], excludedTags: [],
      },
      calculationImplementation: 'vat-lock-test-v1', parameters: {}, explanation: '乐观锁测试。',
    }, context);
    await expect(service.reviewRuleVersion(rulePackage.id, draft.id, {
      kind: 'technical', expectedVersion: 2, note: '使用过期版本提交审核。',
    }, { actorId: '20000000-0000-4000-8000-000000000002', traceId: 'stale-review' }))
      .rejects.toMatchObject({ status: 409 });
  });

  it('supersedes the previous active version when a replacement activates', async () => {
    const store = new MemoryPolicyRuleStore();
    const baseVersion = {
      effectiveFrom: '2026-01-01', sourceIds: ['90000000-0000-4000-8000-000000000009'],
      applicability: {
        taxpayerStatuses: ['test'], filingCycles: ['monthly'], industries: ['test'],
        requiredTags: [], excludedTags: [],
      },
      calculationImplementation: 'vat-store-test-v1', parameters: {}, explanation: '存储状态机测试。',
      contentHash: 'f'.repeat(64),
    } as const;
    const oldActive = await store.saveRuleVersion({
      id: '50000000-0000-4000-8000-000000000005',
      rulePackageId: '60000000-0000-4000-8000-000000000006', actorId, traceId: 'old-active',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ruleVersion: { ...baseVersion, versionTag: '2026.01.01-1', status: RuleVersionStatus.Active },
    });
    const replacement = await store.saveRuleVersion({
      id: '70000000-0000-4000-8000-000000000007',
      rulePackageId: oldActive.rulePackageId, actorId, traceId: 'replacement',
      createdAt: new Date('2026-10-08T00:00:00Z'),
      ruleVersion: { ...baseVersion, versionTag: '2026.10.08-1', status: RuleVersionStatus.Scheduled },
    });
    await store.activateRuleVersion({
      current: replacement, expectedVersion: 1, nextStatus: RuleVersionStatus.Active,
      actorId, traceId: 'activate-replacement', note: '激活替代版本。',
      occurredAt: new Date('2026-10-09T00:00:00Z'),
    });
    const versions = await store.listRuleVersions(oldActive.rulePackageId);
    expect(versions.find((item) => item.id === oldActive.id)).toMatchObject({
      status: RuleVersionStatus.Superseded, supersededByRuleVersionId: replacement.id,
    });
    expect(versions.find((item) => item.id === replacement.id)?.status).toBe(RuleVersionStatus.Active);
  });
});
