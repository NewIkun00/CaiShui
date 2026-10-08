import { RuleVersionStatus, type RuleApplicability, type TaxType } from './policy-rule.js';

export enum CalculationRunStatus {
  Ready = 'ready',
  DecisionRequired = 'decision_required',
}

export enum CalculationDecisionCode {
  ScopeProfileMissing = 'SCOPE_PROFILE_MISSING',
  ScopeNotEligible = 'SCOPE_NOT_ELIGIBLE',
  NoConfirmedFacts = 'NO_CONFIRMED_FACTS',
  NoMatchingRule = 'NO_MATCHING_RULE',
  MultipleMatchingRules = 'MULTIPLE_MATCHING_RULES',
  ImplementationNotRegistered = 'IMPLEMENTATION_NOT_REGISTERED',
}

export interface CalculationContext {
  readonly taxType: TaxType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly jurisdictionCodes: readonly string[];
  readonly taxpayerStatus: string;
  readonly filingCycle: string;
  readonly industry: string;
  readonly tags: readonly string[];
  readonly confirmedFactIds: readonly string[];
}

export interface CalculationRuleCandidate {
  readonly ruleVersionId: string;
  readonly rulePackageId: string;
  readonly taxType: TaxType;
  readonly jurisdictions: readonly string[];
  readonly effectiveFrom: string;
  readonly effectiveTo?: string | undefined;
  readonly applicability: RuleApplicability;
  readonly contentHash: string;
  readonly calculationImplementation: string;
  readonly status: RuleVersionStatus;
}

export interface CalculationDecisionRequired {
  readonly status: CalculationRunStatus.DecisionRequired;
  readonly decision: {
    readonly code: CalculationDecisionCode;
    readonly message: string;
    readonly candidateRuleVersionIds: readonly string[];
  };
}

export interface CalculationReady {
  readonly status: CalculationRunStatus.Ready;
  readonly rule: CalculationRuleCandidate;
}

export type CalculationReadiness = CalculationDecisionRequired | CalculationReady;

export interface CalculationExplanationStep {
  readonly sequence: number;
  readonly key: 'scope_validation' | 'fact_snapshot' | 'rule_selection' | 'implementation_readiness';
  readonly category: 'validation' | 'selection';
  readonly status: 'passed' | 'blocked';
  readonly inputs: Readonly<Record<string, string | number | readonly string[]>>;
  readonly output: Readonly<Record<string, string | number | readonly string[]>>;
  readonly explanation: string;
}

export function buildCalculationReadinessSteps(
  scopeState: 'missing' | 'eligible' | 'ineligible',
  confirmedFactIds: readonly string[],
  readiness: CalculationReadiness,
): readonly CalculationExplanationStep[] {
  const scopePassed = scopeState === 'eligible';
  const factsPassed = confirmedFactIds.length > 0;
  const rulePassed = readiness.status === CalculationRunStatus.Ready;
  const implementationMissing=readiness.status===CalculationRunStatus.DecisionRequired&&readiness.decision.code===CalculationDecisionCode.ImplementationNotRegistered;
  const ruleSelected=rulePassed||implementationMissing;
  const selectedRuleVersionId=readiness.status===CalculationRunStatus.Ready?readiness.rule.ruleVersionId:implementationMissing?readiness.decision.candidateRuleVersionIds[0]??'':'';
  return Object.freeze([
    Object.freeze({
      sequence: 1, key: 'scope_validation', category: 'validation',
      status: scopePassed ? 'passed' : 'blocked', inputs: Object.freeze({ scopeState }),
      output: Object.freeze({ eligible: String(scopePassed) }),
      explanation: scopeState === 'missing' ? '缺少公司适用性画像，计算被阻断。'
        : scopePassed ? '公司最新适用性评估为绿色，可继续计算准备。'
          : '公司最新适用性评估需要人工复核或超出自动化范围。',
    }),
    Object.freeze({
      sequence: 2, key: 'fact_snapshot', category: 'validation',
      status: scopePassed && factsPassed ? 'passed' : 'blocked',
      inputs: Object.freeze({ confirmedFactIds: Object.freeze([...confirmedFactIds]) }),
      output: Object.freeze({ confirmedFactCount: confirmedFactIds.length }),
      explanation: !scopePassed ? '前置适用性校验未通过，事实快照不可用于试算。'
        : factsPassed ? `已冻结 ${confirmedFactIds.length} 条属期内确认事实。`
          : '属期内没有已确认业务事实，计算被阻断。',
    }),
    Object.freeze({
      sequence: 3, key: 'rule_selection', category: 'selection',
      status: scopePassed && factsPassed && ruleSelected ? 'passed' : 'blocked',
      inputs: Object.freeze({ candidateRuleVersionIds: readiness.status === CalculationRunStatus.Ready
        ? [readiness.rule.ruleVersionId] : readiness.decision.candidateRuleVersionIds }),
      output: Object.freeze({ selectedRuleVersionId }),
      explanation: ruleSelected ? '已锁定唯一活动规则版本及其内容哈希。'
        : `规则选择未完成：${readiness.status === CalculationRunStatus.DecisionRequired
          ? readiness.decision.message : 'unknown'}`,
    }),
    Object.freeze({
      sequence:4,key:'implementation_readiness',category:'validation',status:rulePassed?'passed':'blocked',
      inputs:Object.freeze({selectedRuleVersionId}),output:Object.freeze({implementationRegistered:String(rulePassed)}),
      explanation:implementationMissing?'活动规则引用的版本化计算实现未在当前部署注册，禁止生成税额。':rulePassed?'版本化计算实现已注册，可进入确定性计算。':'规则尚未唯一选定，无法校验计算实现。',
    }),
  ]);
}

export function selectRuleForCalculation(
  context: CalculationContext,
  candidates: readonly CalculationRuleCandidate[],
): CalculationReadiness {
  assertPeriod(context.periodStart, context.periodEnd);
  if (context.confirmedFactIds.length === 0) {
    return decision(CalculationDecisionCode.NoConfirmedFacts,
      'No confirmed business facts exist for the requested period', []);
  }
  const tags = new Set(context.tags);
  const matches = candidates.filter((candidate) =>
    candidate.status === RuleVersionStatus.Active && candidate.taxType === context.taxType &&
    candidate.effectiveFrom <= context.periodStart &&
    (!candidate.effectiveTo || candidate.effectiveTo >= context.periodEnd) &&
    candidate.jurisdictions.some((code) => context.jurisdictionCodes.includes(code)) &&
    candidate.applicability.taxpayerStatuses.includes(context.taxpayerStatus) &&
    candidate.applicability.filingCycles.includes(context.filingCycle) &&
    candidate.applicability.industries.includes(context.industry) &&
    candidate.applicability.requiredTags.every((tag) => tags.has(tag)) &&
    candidate.applicability.excludedTags.every((tag) => !tags.has(tag)));
  if (matches.length === 0) {
    return decision(CalculationDecisionCode.NoMatchingRule,
      'No active rule version uniquely matches the company, period, and applicability', []);
  }
  if (matches.length > 1) {
    return decision(CalculationDecisionCode.MultipleMatchingRules,
      'Multiple active rule versions match; calculation is blocked pending rule governance',
      matches.map((item) => item.ruleVersionId).sort());
  }
  return Object.freeze({ status: CalculationRunStatus.Ready, rule: matches[0]! });
}

function decision(
  code: CalculationDecisionCode, message: string, candidateRuleVersionIds: readonly string[],
): CalculationDecisionRequired {
  return Object.freeze({
    status: CalculationRunStatus.DecisionRequired,
    decision: Object.freeze({ code, message, candidateRuleVersionIds: Object.freeze([...candidateRuleVersionIds]) }),
  });
}

function assertPeriod(start: string, end: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
    throw new Error('Calculation period must be a valid ordered ISO date range');
  }
}
