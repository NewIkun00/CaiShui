import { describe, expect, it } from 'vitest';
import {
  goldenFixtureExecutionResponseSchema,
  goldenFixtureSetListResponseSchema,
  policySourceListResponseSchema,
  rulePackageListResponseSchema,
  ruleVersionListResponseSchema,
} from '../src/index.js';

const actorId = '10000000-0000-4000-8000-000000000001';
const packageId = '20000000-0000-4000-8000-000000000002';
const versionId = '30000000-0000-4000-8000-000000000003';
const fixtureSetId = '40000000-0000-4000-8000-000000000004';
const now = '2026-10-08T00:00:00.000Z';

describe('policy-rule workbench response contracts', () => {
  it('parses official policy source snapshots serialized over HTTP', () => {
    const result = policySourceListResponseSchema.parse({ items: [{
      id: '80000000-0000-4000-8000-000000000008', documentNumber: '测试公告〔2026〕1号',
      title: '测试政策来源', officialUrl: 'https://www.chinatax.gov.cn/test', issuingAuthority: '国家税务总局',
      publishedOn: '2026-01-01', effectiveFrom: '2026-01-01', summary: '仅用于验证严格 HTTP 契约。',
      contentHash: 'd'.repeat(64), lastVerifiedOn: '2026-10-08', version: 1, createdAt: now, createdBy: actorId,
    }] });
    expect(result.items[0]?.officialUrl).toContain('.gov.cn');
  });

  it('parses package and version list responses serialized over HTTP', () => {
    expect(rulePackageListResponseSchema.parse({ items: [{
      id: packageId, code: 'vat.cn.test', name: '测试规则包', taxType: 'vat',
      jurisdictions: ['CN'], description: '仅验证返回契约。', version: 1, createdAt: now, createdBy: actorId,
    }] }).items).toHaveLength(1);
    expect(ruleVersionListResponseSchema.parse({ items: [{
      id: versionId, rulePackageId: packageId, versionTag: '2026.10.08-1', effectiveFrom: '2026-10-08',
      sourceIds: ['50000000-0000-4000-8000-000000000005'], applicability: {
        taxpayerStatuses: ['test'], filingCycles: ['quarterly'], industries: ['test'], requiredTags: [], excludedTags: [],
      }, calculationImplementation: 'vat-test-v1', parameters: {}, explanation: '不含生产税率。',
      contentHash: 'a'.repeat(64), status: 'tax_reviewed', recordVersion: 3, createdAt: now,
      createdBy: actorId, technicalReviewedBy: '60000000-0000-4000-8000-000000000006', taxReviewedBy: actorId,
    }] }).items[0]?.status).toBe('tax_reviewed');
  });

  it('parses signed fixture sets and execution evidence', () => {
    const fixtures = ['normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception'].map((scenario, index) => ({
      caseId: `case-${index + 1}`, scenario, input: { fact: index }, expected: { result: index }, explanation: '专业人员已复核。',
    }));
    expect(goldenFixtureSetListResponseSchema.parse({ items: [{
      id: fixtureSetId, ruleVersionId: versionId, fixtureSetVersion: '2026.10.08-1', redactionAttested: true,
      professionalNote: '专业人员确认全部样本已脱敏并完成复核。', fixtures,
      contentHash: 'b'.repeat(64), signedOffBy: actorId, signedOffAt: now,
    }] }).items[0]?.fixtures).toHaveLength(6);
    expect(goldenFixtureExecutionResponseSchema.parse({
      id: '70000000-0000-4000-8000-000000000007', ruleVersionId: versionId, fixtureSetId,
      implementationKey: 'vat-test-v1', status: 'passed', totalFixtures: 6, passedFixtures: 6,
      artifactHash: 'c'.repeat(64), results: fixtures.map((fixture) => ({
        caseId: fixture.caseId, passed: true, expected: fixture.expected, actual: fixture.expected, steps: [{ key: 'verified' }],
      })), executedBy: actorId, executedAt: now,
    }).status).toBe('passed');
  });
});
