import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CalculationRunInputRequest } from '@ledgerly/contracts';
import {
  BusinessEventStatus, CalculationDecisionCode, CalculationRunStatus, ScopeDecision, TaxType,
  buildCalculationReadinessSteps, selectRuleForCalculation,
  type CalculationDecisionRequired, type CalculationRuleCandidate,
  type CompanyProfile,
} from '@ledgerly/domain';
import { createHash, randomUUID } from 'node:crypto';
import { BUSINESS_EVENT_STORE, type BusinessEventStore } from '../../business-event/application/business-event-store.js';
import { ORGANIZATION_STORE, type OrganizationStore } from '../../organization/application/organization-store.js';
import type { RequestContext } from '../../organization/application/organization.service.js';
import { POLICY_RULE_STORE, type PolicyRuleStore } from '../../policy-rule/application/policy-rule-store.js';
import { RULE_CALCULATION_REGISTRY,type RuleCalculationRegistry } from '../../policy-rule/application/rule-calculation-registry.js';
import { SCOPE_STORE, type ScopeStore } from '../../profile-scope/application/scope-store.js';
import { CALCULATION_STORE, type CalculationStore, type SavedCalculationRun } from './calculation-store.js';

@Injectable()
export class CalculationService {
  constructor(
    @Inject(ORGANIZATION_STORE) private readonly organizations: OrganizationStore,
    @Inject(SCOPE_STORE) private readonly scopes: ScopeStore,
    @Inject(BUSINESS_EVENT_STORE) private readonly events: BusinessEventStore,
    @Inject(POLICY_RULE_STORE) private readonly rules: PolicyRuleStore,
    @Inject(CALCULATION_STORE) private readonly runs: CalculationStore,
    @Inject(RULE_CALCULATION_REGISTRY)private readonly calculationRegistry:RuleCalculationRegistry,
  ) {}

  async createRun(
    companyId: string, input: CalculationRunInputRequest, context: RequestContext,
  ): Promise<SavedCalculationRun> {
    if (!context.tenantId) throw new NotFoundException('Company not found');
    const company = await this.organizations.findCompany(context.tenantId, companyId);
    if (!company) throw new NotFoundException('Company not found');
    const scope = await this.scopes.findLatest(context.tenantId, companyId);
    const confirmedFacts = (await this.events.list(context.tenantId, companyId))
      .filter((event) => event.status === BusinessEventStatus.Confirmed &&
        event.occurredOn >= input.periodStart && event.occurredOn <= input.periodEnd)
      .sort((left, right) => left.id.localeCompare(right.id));
    const jurisdictionCodes = company.provinceCode === '32' ? ['CN', 'CN-JS'] : ['CN'];
    const snapshot = {
      companyId, scopeEvaluationId: scope?.id, taxType: input.taxType as TaxType,
      periodStart: input.periodStart, periodEnd: input.periodEnd, jurisdictionCodes,
      profile: scope ? { ...scope.profile } : undefined,
      facts: confirmedFacts.map((event) => ({
        id: event.id, type: event.type, occurredOn: event.occurredOn, amount: event.amount.toString(),
        counterpartyId: event.counterpartyId, description: event.description,
        source: event.source, version: event.version, confirmedAt: event.confirmedAt?.toISOString(),
      })),
    };
    let readiness: CalculationDecisionRequired | ReturnType<typeof selectRuleForCalculation>;
    if (!scope) {
      readiness = this.decision(CalculationDecisionCode.ScopeProfileMissing,
        'A completed company scope profile is required before tax calculation');
    } else if (scope.decision !== ScopeDecision.Green) {
      readiness = this.decision(CalculationDecisionCode.ScopeNotEligible,
        'The latest scope evaluation requires manual review or is outside the automated scope');
    } else {
      readiness = selectRuleForCalculation({
        taxType: input.taxType as TaxType, periodStart: input.periodStart, periodEnd: input.periodEnd,
        jurisdictionCodes, taxpayerStatus: scope.profile.vatTaxpayerStatus,
        filingCycle: scope.profile.vatFilingCycle, industry: scope.profile.industry,
        tags: this.profileTags(scope.profile), confirmedFactIds: confirmedFacts.map((event) => event.id),
      }, await this.candidates(input.taxType as TaxType));
      if(readiness.status===CalculationRunStatus.Ready&&!this.calculationRegistry.find(readiness.rule.calculationImplementation)){
        readiness={status:CalculationRunStatus.DecisionRequired,decision:{code:CalculationDecisionCode.ImplementationNotRegistered,message:'The selected active rule references a calculation implementation that is not registered in this deployment',candidateRuleVersionIds:[readiness.rule.ruleVersionId]}};
      }
    }
    const now = new Date();
    const scopeState = !scope ? 'missing' : scope.decision === ScopeDecision.Green ? 'eligible' : 'ineligible';
    const steps = buildCalculationReadinessSteps(scopeState, confirmedFacts.map((event) => event.id), readiness);
    const run: SavedCalculationRun = Object.freeze({
      id: randomUUID(), tenantId: context.tenantId, companyId, taxType: input.taxType as TaxType,
      periodStart: input.periodStart, periodEnd: input.periodEnd, status: readiness.status,
      inputSnapshot: snapshot, inputHash: sha256Canonical(snapshot),
      ...(readiness.status === CalculationRunStatus.Ready ? {
        ruleVersionId: readiness.rule.ruleVersionId, ruleContentHash: readiness.rule.contentHash,
      } : { decision: readiness.decision }),
      steps,
      createdAt: now, createdBy: context.actorId,
    });
    return this.runs.save({ run, traceId: context.traceId, factIds: confirmedFacts.map((event) => event.id) });
  }

  async listRuns(companyId: string, context: RequestContext): Promise<readonly SavedCalculationRun[]> {
    if (!context.tenantId || !await this.organizations.findCompany(context.tenantId, companyId)) {
      throw new NotFoundException('Company not found');
    }
    return this.runs.list(context.tenantId, companyId);
  }

  private async candidates(taxType: TaxType): Promise<readonly CalculationRuleCandidate[]> {
    const packages = (await this.rules.listRulePackages()).filter((item) => item.taxType === taxType);
    const candidates: CalculationRuleCandidate[] = [];
    for (const rulePackage of packages) {
      for (const version of await this.rules.listRuleVersions(rulePackage.id)) {
        candidates.push({
          ruleVersionId: version.id, rulePackageId: rulePackage.id, taxType: rulePackage.taxType,
          jurisdictions: rulePackage.jurisdictions, effectiveFrom: version.effectiveFrom,
          effectiveTo: version.effectiveTo, applicability: version.applicability,
          contentHash: version.contentHash, calculationImplementation: version.calculationImplementation,
          status: version.status,
        });
      }
    }
    return candidates;
  }

  private decision(code: CalculationDecisionCode, message: string): CalculationDecisionRequired {
    return { status: CalculationRunStatus.DecisionRequired,
      decision: { code, message, candidateRuleVersionIds: [] } };
  }

  private profileTags(profile: CompanyProfile): readonly string[] {
    const mapping: ReadonlyArray<readonly [boolean, string]> = [
      [profile.hasSpecialVatFivePercent, 'special_vat_five_percent'],
      [profile.hasDifferenceTax, 'difference_tax'],
      [profile.hasCrossRegionPrepayment, 'cross_region_prepayment'],
      [profile.hasInventory, 'inventory'], [profile.hasForeignCurrency, 'foreign_currency'],
    ];
    return mapping.filter(([enabled]) => enabled).map(([, tag]) => tag);
  }
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}
