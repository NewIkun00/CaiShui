import { describe, expect, it } from 'vitest';
import {
  CalculationDecisionCode, CalculationRunStatus, RuleVersionStatus, TaxType, selectRuleForCalculation,
  buildCalculationReadinessSteps,
  type CalculationContext, type CalculationRuleCandidate,
} from '../src/index.js';

const context: CalculationContext = {
  taxType: TaxType.Vat, periodStart: '2026-10-01', periodEnd: '2026-12-31',
  jurisdictionCodes: ['CN', 'CN-JS'], taxpayerStatus: 'small_scale', filingCycle: 'quarterly',
  industry: 'modern_service', tags: [], confirmedFactIds: ['fact-1'],
};
const rule: CalculationRuleCandidate = {
  ruleVersionId: 'rule-v1', rulePackageId: 'rule', taxType: TaxType.Vat,
  jurisdictions: ['CN-JS'], effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
  applicability: {
    taxpayerStatuses: ['small_scale'], filingCycles: ['quarterly'], industries: ['modern_service'],
    requiredTags: [], excludedTags: ['special_vat_five_percent'],
  },
  contentHash: 'a'.repeat(64), calculationImplementation: 'vat-test-v1', status: RuleVersionStatus.Active,
};

describe('calculation readiness', () => {
  it('selects exactly one active applicable rule', () => {
    expect(selectRuleForCalculation(context, [rule])).toMatchObject({
      status: CalculationRunStatus.Ready, rule: { ruleVersionId: 'rule-v1' },
    });
  });

  it('blocks instead of guessing when facts or rules are missing or ambiguous', () => {
    expect(selectRuleForCalculation({ ...context, confirmedFactIds: [] }, [rule])).toMatchObject({
      decision: { code: CalculationDecisionCode.NoConfirmedFacts },
    });
    expect(selectRuleForCalculation(context, [])).toMatchObject({
      decision: { code: CalculationDecisionCode.NoMatchingRule },
    });
    expect(selectRuleForCalculation(context, [rule, { ...rule, ruleVersionId: 'rule-v2' }])).toMatchObject({
      decision: { code: CalculationDecisionCode.MultipleMatchingRules,
        candidateRuleVersionIds: ['rule-v1', 'rule-v2'] },
    });
  });

  it('builds a deterministic explanation chain for readiness decisions', () => {
    const readiness = selectRuleForCalculation(context, [rule]);
    const steps = buildCalculationReadinessSteps('eligible', context.confirmedFactIds, readiness);
    expect(steps.map((step) => `${step.sequence}:${step.key}:${step.status}`)).toEqual([
      '1:scope_validation:passed', '2:fact_snapshot:passed', '3:rule_selection:passed',
      '4:implementation_readiness:passed',
    ]);
    const blocked = buildCalculationReadinessSteps('missing', [], selectRuleForCalculation({
      ...context, confirmedFactIds: [],
    }, []));
    expect(blocked.every((step) => step.status === 'blocked')).toBe(true);
  });
});
