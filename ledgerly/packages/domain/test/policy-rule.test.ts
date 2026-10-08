import { describe, expect, it } from 'vitest';
import {
  createPolicySource,
  createGoldenFixtureSet,
  acceptRuleTestEvidence,
  activateRuleVersion,
  approveRuleVersion,
  createRulePackage,
  createRuleVersion,
  reviewRuleVersion,
  RuleReviewKind,
  scheduleRuleVersion,
  RuleVersionStatus,
  TaxType,
  withdrawRuleVersion,
  type RuleTestScenario,
} from '../src/index.js';

const hash = 'a'.repeat(64);

describe('policy and rule governance domain', () => {
  it('accepts an official source and normalizes a rule package', () => {
    const source = createPolicySource({
      documentNumber: '财政部 税务总局公告示例号', title: '测试政策',
      officialUrl: 'https://www.chinatax.gov.cn/example', issuingAuthority: '国家税务总局',
      publishedOn: '2026-01-01', effectiveFrom: '2026-01-01', summary: '仅用于领域测试。',
      contentHash: hash, lastVerifiedOn: '2026-10-08',
    });
    const rulePackage = createRulePackage({
      code: 'vat.cn-js.small-scale', name: '江苏小规模增值税', taxType: TaxType.Vat,
      jurisdictions: ['CN-JS', 'CN-JS', 'CN'], description: '版本化规则包，不包含未经签审的生产参数。',
    });
    expect(source.officialUrl).toContain('chinatax.gov.cn');
    expect(rulePackage.jurisdictions).toEqual(['CN', 'CN-JS']);
  });

  it('rejects non-official policy links', () => {
    expect(() => createPolicySource({
      documentNumber: '示例', title: '示例', officialUrl: 'https://example.com/article',
      issuingAuthority: '示例机关', publishedOn: '2026-01-01', effectiveFrom: '2026-01-01',
      summary: '示例', contentHash: hash, lastVerifiedOn: '2026-10-08',
    })).toThrow('official gov.cn domain');
  });

  it('rejects impossible calendar dates', () => {
    expect(() => createPolicySource({
      documentNumber: '示例', title: '示例', officialUrl: 'https://www.chinatax.gov.cn/example',
      issuingAuthority: '示例机关', publishedOn: '2026-02-31', effectiveFrom: '2026-01-01',
      summary: '示例', contentHash: hash, lastVerifiedOn: '2026-10-08',
    })).toThrow('ISO date');
  });

  it('creates only a draft version with traceable sources and an implementation key', () => {
    const version = createRuleVersion({
      versionTag: '2026.10.08-1', effectiveFrom: '2026-10-08', sourceIds: ['source-1'],
      applicability: {
        taxpayerStatuses: ['small_scale'], filingCycles: ['quarterly'], industries: ['modern_service'],
        requiredTags: [], excludedTags: ['special_vat_five_percent'],
      },
      calculationImplementation: 'vat-small-scale-v1', parameters: {},
      explanation: '测试版本，不包含生产税率。', contentHash: hash,
    });
    expect(version.status).toBe(RuleVersionStatus.Draft);
  });

  it('requires separate editor, technical reviewer, and tax reviewer identities', () => {
    const technical = reviewRuleVersion({ status: RuleVersionStatus.Draft, editorId: 'editor' },
      RuleReviewKind.Technical, 'technical-reviewer', '工程实现与适用范围检查通过。');
    expect(technical.status).toBe(RuleVersionStatus.TechnicalReviewed);
    const tax = reviewRuleVersion({ ...technical, editorId: 'editor' },
      RuleReviewKind.Tax, 'tax-reviewer', '财税口径检查通过。');
    expect(tax.status).toBe(RuleVersionStatus.TaxReviewed);
    expect(() => reviewRuleVersion({ status: RuleVersionStatus.Draft, editorId: 'editor' },
      RuleReviewKind.Technical, 'editor', '自审。')).toThrow('editor cannot review');
    expect(() => reviewRuleVersion({ ...technical, editorId: 'editor' },
      RuleReviewKind.Tax, 'technical-reviewer', '重复审核。')).toThrow('different reviewers');
  });

  it('accepts test evidence only when every required scenario passes', () => {
    const status = acceptRuleTestEvidence(RuleVersionStatus.TaxReviewed, {
      fixtureSetVersion: '2026.10.08-1', totalFixtures: 12, passedFixtures: 12,
      coveredScenarios: ['normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception'],
      artifactHash: hash, note: '由专业人员签审的脱敏黄金样本。',
    });
    expect(status).toBe(RuleVersionStatus.Tested);
    expect(() => acceptRuleTestEvidence(RuleVersionStatus.TaxReviewed, {
      fixtureSetVersion: '2026.10.08-1', totalFixtures: 12, passedFixtures: 11,
      coveredScenarios: ['normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception'],
      artifactHash: hash, note: '存在失败样本。',
    })).toThrow('Every signed fixture must pass');
    expect(() => acceptRuleTestEvidence(RuleVersionStatus.TaxReviewed, {
      fixtureSetVersion: '2026.10.08-1', totalFixtures: 6, passedFixtures: 6,
      coveredScenarios: ['normal', 'boundary'], artifactHash: hash, note: '覆盖不完整。',
    })).toThrow('missing scenarios');
  });

  it('requires immutable golden fixtures to cover every governed scenario', () => {
    const fixtures = ['normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception']
      .map((scenario, index) => ({
        caseId: `case-${index + 1}`, scenario: scenario as RuleTestScenario,
        input: { fact: `input-${index + 1}` }, expected: { outcome: `expected-${index + 1}` },
        explanation: '由专业人员提供并脱敏的期望结果。',
      }));
    const fixtureSet = createGoldenFixtureSet({
      fixtureSetVersion: '2026.10.08-1', redactionAttested: true,
      professionalNote: '仅用于验证黄金样本治理结构，不代表生产政策口径。', fixtures, contentHash: hash,
    });
    expect(fixtureSet.fixtures).toHaveLength(6);
    expect(() => createGoldenFixtureSet({
      fixtureSetVersion: '2026.10.08-1', redactionAttested: true,
      professionalNote: '场景覆盖不足。', fixtures: fixtures.slice(0, 2), contentHash: hash,
    })).toThrow('missing scenarios');
  });

  it('separates approval duties and schedules only inside the effective period', () => {
    expect(approveRuleVersion({
      status: RuleVersionStatus.Tested, editorId: 'editor', technicalReviewedBy: 'technical',
      taxReviewedBy: 'tax', testedBy: 'tax',
    }, 'approver', '独立批准。')).toBe(RuleVersionStatus.Approved);
    expect(() => approveRuleVersion({
      status: RuleVersionStatus.Tested, editorId: 'editor', technicalReviewedBy: 'technical',
      taxReviewedBy: 'tax', testedBy: 'tax',
    }, 'tax', '审核人与批准人相同。')).toThrow('independent');
    expect(scheduleRuleVersion({
      status: RuleVersionStatus.Approved, approvedBy: 'approver', actorId: 'approver',
      activationAt: new Date('2026-10-10T00:00:00Z'), effectiveFrom: '2026-10-01',
      effectiveTo: '2026-12-31', now: new Date('2026-10-09T00:00:00Z'), note: '灰度发布时间。',
    })).toBe(RuleVersionStatus.Scheduled);
    expect(() => scheduleRuleVersion({
      status: RuleVersionStatus.Approved, approvedBy: 'approver', actorId: 'approver',
      activationAt: new Date('2027-01-01T00:00:00Z'), effectiveFrom: '2026-10-01',
      effectiveTo: '2026-12-31', now: new Date('2026-10-09T00:00:00Z'), note: '超出生效期。',
    })).toThrow('effective period');
  });

  it('activates only when due and permits emergency withdrawal by the approver', () => {
    const activation = {
      status: RuleVersionStatus.Scheduled, approvedBy: 'approver', actorId: 'approver',
      activationAt: new Date('2026-10-10T00:00:00Z'), effectiveFrom: '2026-10-01',
      effectiveTo: '2026-12-31', note: '到期激活。',
    } as const;
    expect(() => activateRuleVersion({
      ...activation, now: new Date('2026-10-09T23:59:59Z'),
    })).toThrow('before its scheduled time');
    expect(activateRuleVersion({
      ...activation, now: new Date('2026-10-10T00:00:00Z'),
    })).toBe(RuleVersionStatus.Active);
    expect(withdrawRuleVersion({
      status: RuleVersionStatus.Active, approvedBy: 'approver', actorId: 'approver',
      note: '发现异常，立即停用并保留审计记录。',
    })).toBe(RuleVersionStatus.Withdrawn);
    expect(() => withdrawRuleVersion({
      status: RuleVersionStatus.Active, approvedBy: 'approver', actorId: 'other', note: '无权停用。',
    })).toThrow('Only the rule approver');
  });
});
