import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type {
  PolicySourceInputRequest,
  RulePackageInputRequest,
  RuleVersionInputRequest,
  RuleVersionReviewRequest,
  RuleTestEvidenceRequest,
  RuleApprovalRequest,
  RuleScheduleRequest,
  RuleActivationRequest,
  RuleWithdrawalRequest,
  GoldenFixtureSetInputRequest,
} from '@ledgerly/contracts';
import {
  createPolicySource,
  createRulePackage,
  createRuleVersion,
  acceptRuleTestEvidence,
  reviewRuleVersion,
  approveRuleVersion,
  scheduleRuleVersion,
  activateRuleVersion,
  withdrawRuleVersion,
  createGoldenFixtureSet,
  PolicyRuleError,
  RuleReviewKind,
  RuleVersionStatus,
  TaxType,
  type RuleParameterValue,
} from '@ledgerly/domain';
import { createHash, randomUUID } from 'node:crypto';
import type { RequestContext } from '../../organization/application/organization.service.js';
import {
  POLICY_RULE_STORE,
  type PolicyRuleStore,
  type SavedPolicySource,
  type SavedRulePackage,
  type SavedRuleVersion,
  type SavedGoldenFixtureSet,
  type SavedGoldenFixtureExecution,
} from './policy-rule-store.js';
import {
  EmptyRuleCalculationRegistry,
  RULE_CALCULATION_REGISTRY,
  type RuleCalculationRegistry,
} from './rule-calculation-registry.js';

@Injectable()
export class PolicyRuleService {
  constructor(
    @Inject(POLICY_RULE_STORE) private readonly store: PolicyRuleStore,
    @Optional() private readonly clock: () => Date = () => new Date(),
    @Optional() @Inject(RULE_CALCULATION_REGISTRY)
    private readonly calculationRegistry: RuleCalculationRegistry = new EmptyRuleCalculationRegistry(),
  ) {}

  async createPolicySource(input: PolicySourceInputRequest, context: RequestContext): Promise<SavedPolicySource> {
    const source = createPolicySource(input);
    if (await this.store.policySourceDuplicate(source.documentNumber, source.contentHash)) {
      throw new ConflictException({ code: 'POLICY_SOURCE_EXISTS', message: 'Policy source already exists' });
    }
    return this.store.savePolicySource({
      id: randomUUID(), actorId: context.actorId, traceId: context.traceId,
      createdAt: new Date(), source,
    });
  }

  listPolicySources(): Promise<readonly SavedPolicySource[]> {
    return this.store.listPolicySources();
  }

  async createRulePackage(input: RulePackageInputRequest, context: RequestContext): Promise<SavedRulePackage> {
    const rulePackage = createRulePackage({ ...input, taxType: input.taxType as TaxType });
    if (await this.store.rulePackageCodeExists(rulePackage.code)) {
      throw new ConflictException({ code: 'RULE_PACKAGE_EXISTS', message: 'Rule package code already exists' });
    }
    return this.store.saveRulePackage({
      id: randomUUID(), actorId: context.actorId, traceId: context.traceId,
      createdAt: new Date(), rulePackage,
    });
  }

  listRulePackages(): Promise<readonly SavedRulePackage[]> {
    return this.store.listRulePackages();
  }

  async createRuleVersion(
    rulePackageId: string,
    input: RuleVersionInputRequest,
    context: RequestContext,
  ): Promise<SavedRuleVersion> {
    if (!await this.store.findRulePackage(rulePackageId)) throw new NotFoundException('Rule package not found');
    const uniqueSourceIds = [...new Set(input.sourceIds)].sort();
    const sourceChecks = await Promise.all(uniqueSourceIds.map((id) => this.store.policySourceExists(id)));
    if (sourceChecks.some((exists) => !exists)) {
      throw new NotFoundException('One or more policy sources were not found');
    }
    if (await this.store.ruleVersionExists(rulePackageId, input.versionTag)) {
      throw new ConflictException({ code: 'RULE_VERSION_EXISTS', message: 'Rule version already exists' });
    }
    const contentHash = sha256Canonical({
      rulePackageId, ...input, sourceIds: uniqueSourceIds,
    });
    const ruleVersion = createRuleVersion({
      ...input,
      sourceIds: uniqueSourceIds,
      parameters: input.parameters as Readonly<Record<string, RuleParameterValue>>,
      contentHash,
    });
    return this.store.saveRuleVersion({
      id: randomUUID(), rulePackageId, actorId: context.actorId, traceId: context.traceId,
      createdAt: new Date(), ruleVersion,
    });
  }

  async listRuleVersions(rulePackageId: string): Promise<readonly SavedRuleVersion[]> {
    if (!await this.store.findRulePackage(rulePackageId)) throw new NotFoundException('Rule package not found');
    return this.store.listRuleVersions(rulePackageId);
  }

  async reviewRuleVersion(
    rulePackageId: string,
    ruleVersionId: string,
    input: RuleVersionReviewRequest,
    context: RequestContext,
  ): Promise<SavedRuleVersion> {
    const current = await this.store.findRuleVersion(rulePackageId, ruleVersionId);
    if (!current) throw new NotFoundException('Rule version not found');
    if (current.recordVersion !== input.expectedVersion) {
      throw new ConflictException({ code: 'RULE_VERSION_CHANGED', message: 'Rule version has changed' });
    }
    let reviewed;
    try {
      reviewed = reviewRuleVersion({
        status: current.status,
        editorId: current.createdBy,
        technicalReviewedBy: current.technicalReviewedBy,
        taxReviewedBy: current.taxReviewedBy,
      }, input.kind as RuleReviewKind, context.actorId, input.note);
    } catch (error) {
      if (error instanceof PolicyRuleError) {
        throw new ConflictException({ code: 'RULE_REVIEW_REJECTED', message: error.message });
      }
      throw error;
    }
    const saved = await this.store.reviewRuleVersion({
      current, expectedVersion: input.expectedVersion, kind: input.kind as RuleReviewKind,
      nextStatus: reviewed.status, actorId: context.actorId, traceId: context.traceId,
      note: input.note.trim(), occurredAt: new Date(),
    });
    if (!saved) throw new ConflictException({ code: 'RULE_VERSION_CHANGED', message: 'Rule version has changed' });
    return saved;
  }

  async recordRuleTestEvidence(
    rulePackageId: string,
    ruleVersionId: string,
    input: RuleTestEvidenceRequest,
    context: RequestContext,
  ): Promise<SavedRuleVersion> {
    const current = await this.store.findRuleVersion(rulePackageId, ruleVersionId);
    if (!current) throw new NotFoundException('Rule version not found');
    if (current.recordVersion !== input.expectedVersion) {
      throw new ConflictException({ code: 'RULE_VERSION_CHANGED', message: 'Rule version has changed' });
    }
    if (current.taxReviewedBy !== context.actorId) {
      throw new ConflictException({
        code: 'TEST_EVIDENCE_SIGNER_MISMATCH',
        message: 'Signed test evidence must be submitted by the tax reviewer',
      });
    }
    const fixtureSet = await this.store.findGoldenFixtureSet(ruleVersionId, input.fixtureSetVersion);
    if (!fixtureSet) {
      throw new ConflictException({
        code: 'GOLDEN_FIXTURE_SET_NOT_FOUND', message: 'Signed golden fixture set was not found',
      });
    }
    const fixtureScenarios = [...new Set(fixtureSet.fixtures.map((fixture) => fixture.scenario))].sort();
    const evidenceScenarios = [...new Set(input.coveredScenarios)].sort();
    const execution = await this.store.findSuccessfulGoldenFixtureExecution(
      ruleVersionId, fixtureSet.id, input.artifactHash,
    );
    if (!execution || input.totalFixtures !== fixtureSet.fixtures.length ||
        input.totalFixtures !== execution.totalFixtures || input.passedFixtures !== execution.passedFixtures ||
        JSON.stringify(evidenceScenarios) !== JSON.stringify(fixtureScenarios)) {
      throw new ConflictException({
        code: 'TEST_EVIDENCE_FIXTURE_MISMATCH',
        message: 'Test evidence does not match the immutable golden fixture set',
      });
    }
    let nextStatus;
    try {
      nextStatus = acceptRuleTestEvidence(current.status, input);
    } catch (error) {
      if (error instanceof PolicyRuleError) {
        throw new ConflictException({ code: 'RULE_TEST_EVIDENCE_REJECTED', message: error.message });
      }
      throw error;
    }
    const saved = await this.store.recordRuleTestEvidence({
      current, expectedVersion: input.expectedVersion, evidence: input,
      nextStatus, actorId: context.actorId, traceId: context.traceId, occurredAt: new Date(),
    });
    if (!saved) throw new ConflictException({ code: 'RULE_VERSION_CHANGED', message: 'Rule version has changed' });
    return saved;
  }

  async executeGoldenFixtureSet(
    rulePackageId: string,
    ruleVersionId: string,
    fixtureSetId: string,
    context: RequestContext,
  ): Promise<SavedGoldenFixtureExecution> {
    const current = await this.store.findRuleVersion(rulePackageId, ruleVersionId);
    if (!current) throw new NotFoundException('Rule version not found');
    if (current.status !== RuleVersionStatus.TaxReviewed || current.taxReviewedBy !== context.actorId) {
      throw new ConflictException({
        code: 'GOLDEN_FIXTURE_EXECUTION_REJECTED',
        message: 'Fixture execution requires the tax-reviewed version and its tax reviewer',
      });
    }
    const fixtureSet = await this.store.findGoldenFixtureSetById(ruleVersionId, fixtureSetId);
    if (!fixtureSet) throw new NotFoundException('Golden fixture set not found');
    const implementation = this.calculationRegistry.find(current.calculationImplementation);
    if (!implementation) {
      throw new ConflictException({
        code: 'CALCULATION_IMPLEMENTATION_NOT_REGISTERED',
        message: 'The signed calculation implementation is not registered',
      });
    }
    const results = fixtureSet.fixtures.map((fixture) => {
      try {
        const actual = implementation.execute(fixture.input);
        const passed = JSON.stringify(canonicalize(actual.output)) === JSON.stringify(canonicalize(fixture.expected));
        return Object.freeze({
          caseId: fixture.caseId, passed, expected: fixture.expected, actual: actual.output,
          steps: actual.steps,
        });
      } catch (error) {
        return Object.freeze({
          caseId: fixture.caseId, passed: false, expected: fixture.expected, steps: [],
          error: error instanceof Error ? error.message : 'Unknown calculation error',
        });
      }
    });
    const passedFixtures = results.filter((result) => result.passed).length;
    const artifactHash = sha256Canonical({
      fixtureSetContentHash: fixtureSet.contentHash, implementationKey: implementation.key,
      results: results.map((result) => ({
        caseId: result.caseId, passed: result.passed,
        ...('actual' in result ? { actual: result.actual } : {}),
        ...('error' in result ? { error: result.error } : {}),
      })),
    });
    const execution: SavedGoldenFixtureExecution = Object.freeze({
      id: randomUUID(), ruleVersionId, fixtureSetId, implementationKey: implementation.key,
      status: passedFixtures === results.length ? 'passed' : 'failed',
      totalFixtures: results.length, passedFixtures, artifactHash, results,
      executedBy: context.actorId, executedAt: this.clock(),
    });
    return this.store.saveGoldenFixtureExecution({ execution, traceId: context.traceId });
  }

  async createGoldenFixtureSet(
    rulePackageId: string,
    ruleVersionId: string,
    input: GoldenFixtureSetInputRequest,
    context: RequestContext,
  ): Promise<SavedGoldenFixtureSet> {
    const current = await this.store.findRuleVersion(rulePackageId, ruleVersionId);
    if (!current) throw new NotFoundException('Rule version not found');
    if (current.status !== RuleVersionStatus.TaxReviewed || current.taxReviewedBy !== context.actorId) {
      throw new ConflictException({
        code: 'GOLDEN_FIXTURE_SIGNER_REJECTED',
        message: 'Golden fixtures require the tax-reviewed version and its tax reviewer',
      });
    }
    if (await this.store.findGoldenFixtureSet(ruleVersionId, input.fixtureSetVersion)) {
      throw new ConflictException({ code: 'GOLDEN_FIXTURE_SET_EXISTS', message: 'Fixture set version already exists' });
    }
    const contentHash = sha256Canonical({ ruleVersionId, ...input });
    let fixtureSet;
    try {
      fixtureSet = createGoldenFixtureSet({ ...input, contentHash });
    } catch (error) {
      if (error instanceof PolicyRuleError) {
        throw new ConflictException({ code: 'GOLDEN_FIXTURE_SET_REJECTED', message: error.message });
      }
      throw error;
    }
    return this.store.saveGoldenFixtureSet({
      id: randomUUID(), current, fixtureSet, actorId: context.actorId,
      traceId: context.traceId, occurredAt: this.clock(),
    });
  }

  async listGoldenFixtureSets(
    rulePackageId: string, ruleVersionId: string,
  ): Promise<readonly SavedGoldenFixtureSet[]> {
    if (!await this.store.findRuleVersion(rulePackageId, ruleVersionId)) {
      throw new NotFoundException('Rule version not found');
    }
    return this.store.listGoldenFixtureSets(ruleVersionId);
  }

  async approveRuleVersion(
    rulePackageId: string,
    ruleVersionId: string,
    input: RuleApprovalRequest,
    context: RequestContext,
  ): Promise<SavedRuleVersion> {
    const current = await this.currentVersion(rulePackageId, ruleVersionId, input.expectedVersion);
    let nextStatus;
    try {
      nextStatus = approveRuleVersion({
        status: current.status, editorId: current.createdBy,
        technicalReviewedBy: current.technicalReviewedBy, taxReviewedBy: current.taxReviewedBy,
        testedBy: current.testedBy,
      }, context.actorId, input.note);
    } catch (error) {
      if (error instanceof PolicyRuleError) {
        throw new ConflictException({ code: 'RULE_APPROVAL_REJECTED', message: error.message });
      }
      throw error;
    }
    const saved = await this.store.approveRuleVersion({
      current, expectedVersion: input.expectedVersion, nextStatus, actorId: context.actorId,
      traceId: context.traceId, note: input.note.trim(), occurredAt: new Date(),
    });
    if (!saved) throw new ConflictException({ code: 'RULE_VERSION_CHANGED', message: 'Rule version has changed' });
    return saved;
  }

  async scheduleRuleVersion(
    rulePackageId: string,
    ruleVersionId: string,
    input: RuleScheduleRequest,
    context: RequestContext,
  ): Promise<SavedRuleVersion> {
    const current = await this.currentVersion(rulePackageId, ruleVersionId, input.expectedVersion);
    const activationAt = new Date(input.activationAt);
    const occurredAt = this.clock();
    let nextStatus;
    try {
      nextStatus = scheduleRuleVersion({
        status: current.status, approvedBy: current.approvedBy, actorId: context.actorId,
        activationAt, effectiveFrom: current.effectiveFrom, effectiveTo: current.effectiveTo,
        now: occurredAt, note: input.note,
      });
    } catch (error) {
      if (error instanceof PolicyRuleError) {
        throw new ConflictException({ code: 'RULE_SCHEDULE_REJECTED', message: error.message });
      }
      throw error;
    }
    const saved = await this.store.scheduleRuleVersion({
      current, expectedVersion: input.expectedVersion, nextStatus, actorId: context.actorId,
      traceId: context.traceId, note: input.note.trim(), occurredAt, activationAt,
    });
    if (!saved) throw new ConflictException({ code: 'RULE_VERSION_CHANGED', message: 'Rule version has changed' });
    return saved;
  }

  async activateRuleVersion(
    rulePackageId: string,
    ruleVersionId: string,
    input: RuleActivationRequest,
    context: RequestContext,
  ): Promise<SavedRuleVersion> {
    const current = await this.currentVersion(rulePackageId, ruleVersionId, input.expectedVersion);
    const occurredAt = this.clock();
    let nextStatus;
    try {
      nextStatus = activateRuleVersion({
        status: current.status, approvedBy: current.approvedBy, actorId: context.actorId,
        activationAt: current.activationAt, effectiveFrom: current.effectiveFrom,
        effectiveTo: current.effectiveTo, now: occurredAt, note: input.note,
      });
    } catch (error) {
      if (error instanceof PolicyRuleError) {
        throw new ConflictException({ code: 'RULE_ACTIVATION_REJECTED', message: error.message });
      }
      throw error;
    }
    const saved = await this.store.activateRuleVersion({
      current, expectedVersion: input.expectedVersion, nextStatus, actorId: context.actorId,
      traceId: context.traceId, note: input.note.trim(), occurredAt,
    });
    if (!saved) throw new ConflictException({ code: 'RULE_VERSION_CHANGED', message: 'Rule version has changed' });
    return saved;
  }

  async withdrawRuleVersion(
    rulePackageId: string,
    ruleVersionId: string,
    input: RuleWithdrawalRequest,
    context: RequestContext,
  ): Promise<SavedRuleVersion> {
    const current = await this.currentVersion(rulePackageId, ruleVersionId, input.expectedVersion);
    let nextStatus;
    try {
      nextStatus = withdrawRuleVersion({
        status: current.status, approvedBy: current.approvedBy, actorId: context.actorId, note: input.note,
      });
    } catch (error) {
      if (error instanceof PolicyRuleError) {
        throw new ConflictException({ code: 'RULE_WITHDRAWAL_REJECTED', message: error.message });
      }
      throw error;
    }
    const saved = await this.store.withdrawRuleVersion({
      current, expectedVersion: input.expectedVersion, nextStatus, actorId: context.actorId,
      traceId: context.traceId, note: input.note.trim(), occurredAt: this.clock(),
    });
    if (!saved) throw new ConflictException({ code: 'RULE_VERSION_CHANGED', message: 'Rule version has changed' });
    return saved;
  }

  private async currentVersion(
    rulePackageId: string, ruleVersionId: string, expectedVersion: number,
  ): Promise<SavedRuleVersion> {
    const current = await this.store.findRuleVersion(rulePackageId, ruleVersionId);
    if (!current) throw new NotFoundException('Rule version not found');
    if (current.recordVersion !== expectedVersion) {
      throw new ConflictException({ code: 'RULE_VERSION_CHANGED', message: 'Rule version has changed' });
    }
    return current;
  }
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}
