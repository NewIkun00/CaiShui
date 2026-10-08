import type {
  GoldenFixtureSet, PolicySource, RulePackage, RuleReviewKind, RuleTestEvidenceInput,
  RuleVersion, RuleVersionStatus, RuleShadowCaseDifference,
} from '@ledgerly/domain';

export interface SavedPolicySource extends PolicySource {
  readonly id: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface SavedRulePackage extends RulePackage {
  readonly id: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface SavedRuleVersion extends RuleVersion {
  readonly id: string;
  readonly rulePackageId: string;
  readonly recordVersion: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly technicalReviewedBy?: string | undefined;
  readonly taxReviewedBy?: string | undefined;
  readonly testedBy?: string | undefined;
  readonly testedAt?: Date | undefined;
  readonly approvedBy?: string | undefined;
  readonly approvedAt?: Date | undefined;
  readonly scheduledBy?: string | undefined;
  readonly scheduledAt?: Date | undefined;
  readonly activationAt?: Date | undefined;
  readonly activatedBy?: string | undefined;
  readonly activatedAt?: Date | undefined;
  readonly supersededByRuleVersionId?: string | undefined;
  readonly supersededAt?: Date | undefined;
  readonly withdrawnBy?: string | undefined;
  readonly withdrawnAt?: Date | undefined;
}

export interface SavedGoldenFixtureSet extends GoldenFixtureSet {
  readonly id: string;
  readonly ruleVersionId: string;
  readonly signedOffBy: string;
  readonly signedOffAt: Date;
}

export interface SavedGoldenFixtureExecution {
  readonly id: string;
  readonly ruleVersionId: string;
  readonly fixtureSetId: string;
  readonly implementationKey: string;
  readonly status: 'passed' | 'failed';
  readonly totalFixtures: number;
  readonly passedFixtures: number;
  readonly artifactHash: string;
  readonly results: readonly {
    readonly caseId: string;
    readonly passed: boolean;
    readonly expected: Readonly<Record<string, unknown>>;
    readonly actual?: Readonly<Record<string, unknown>> | undefined;
    readonly steps: readonly Readonly<Record<string, unknown>>[];
    readonly error?: string | undefined;
  }[];
  readonly executedBy: string;
  readonly executedAt: Date;
}

export interface SavedRuleShadowRun {
  readonly id: string;
  readonly rulePackageId: string;
  readonly baselineRuleVersionId: string;
  readonly candidateRuleVersionId: string;
  readonly fixtureSetId: string;
  readonly fixtureSetContentHash: string;
  readonly baselineImplementationKey: string;
  readonly candidateImplementationKey: string;
  readonly status: 'identical' | 'differences_found' | 'execution_failed';
  readonly totalFixtures: number;
  readonly identicalFixtures: number;
  readonly changedFixtures: number;
  readonly failedFixtures: number;
  readonly artifactHash: string;
  readonly differences: readonly RuleShadowCaseDifference[];
  readonly executedBy: string;
  readonly executedAt: Date;
}

interface GovernedRecord {
  readonly id: string;
  readonly actorId: string;
  readonly traceId: string;
  readonly createdAt: Date;
}

export interface SavePolicySourceRecord extends GovernedRecord {
  readonly source: PolicySource;
}

export interface SaveRulePackageRecord extends GovernedRecord {
  readonly rulePackage: RulePackage;
}

export interface SaveRuleVersionRecord extends GovernedRecord {
  readonly rulePackageId: string;
  readonly ruleVersion: RuleVersion;
}

export interface ReviewRuleVersionRecord {
  readonly current: SavedRuleVersion;
  readonly expectedVersion: number;
  readonly kind: RuleReviewKind;
  readonly nextStatus: RuleVersionStatus;
  readonly actorId: string;
  readonly traceId: string;
  readonly note: string;
  readonly occurredAt: Date;
}

export interface RecordRuleTestEvidenceRecord {
  readonly current: SavedRuleVersion;
  readonly expectedVersion: number;
  readonly evidence: RuleTestEvidenceInput;
  readonly nextStatus: RuleVersionStatus;
  readonly actorId: string;
  readonly traceId: string;
  readonly occurredAt: Date;
}

export interface SaveGoldenFixtureSetRecord {
  readonly id: string;
  readonly current: SavedRuleVersion;
  readonly fixtureSet: GoldenFixtureSet;
  readonly actorId: string;
  readonly traceId: string;
  readonly occurredAt: Date;
}

export interface SaveGoldenFixtureExecutionRecord {
  readonly execution: SavedGoldenFixtureExecution;
  readonly traceId: string;
}

export interface SaveRuleShadowRunRecord {
  readonly run: SavedRuleShadowRun;
  readonly traceId: string;
}

export interface ApproveRuleVersionRecord {
  readonly current: SavedRuleVersion;
  readonly expectedVersion: number;
  readonly nextStatus: RuleVersionStatus;
  readonly actorId: string;
  readonly traceId: string;
  readonly note: string;
  readonly occurredAt: Date;
}

export interface ScheduleRuleVersionRecord extends ApproveRuleVersionRecord {
  readonly activationAt: Date;
}

export type ActivateRuleVersionRecord = ApproveRuleVersionRecord;
export type WithdrawRuleVersionRecord = ApproveRuleVersionRecord;

export const POLICY_RULE_STORE = Symbol('POLICY_RULE_STORE');

export interface PolicyRuleStore {
  savePolicySource(record: SavePolicySourceRecord): Promise<SavedPolicySource>;
  listPolicySources(): Promise<readonly SavedPolicySource[]>;
  policySourceExists(sourceId: string): Promise<boolean>;
  policySourceDuplicate(documentNumber: string, contentHash: string): Promise<boolean>;
  saveRulePackage(record: SaveRulePackageRecord): Promise<SavedRulePackage>;
  listRulePackages(): Promise<readonly SavedRulePackage[]>;
  findRulePackage(rulePackageId: string): Promise<SavedRulePackage | null>;
  rulePackageCodeExists(code: string): Promise<boolean>;
  saveRuleVersion(record: SaveRuleVersionRecord): Promise<SavedRuleVersion>;
  listRuleVersions(rulePackageId: string): Promise<readonly SavedRuleVersion[]>;
  findRuleVersion(rulePackageId: string, ruleVersionId: string): Promise<SavedRuleVersion | null>;
  ruleVersionExists(rulePackageId: string, versionTag: string): Promise<boolean>;
  reviewRuleVersion(record: ReviewRuleVersionRecord): Promise<SavedRuleVersion | null>;
  recordRuleTestEvidence(record: RecordRuleTestEvidenceRecord): Promise<SavedRuleVersion | null>;
  saveGoldenFixtureSet(record: SaveGoldenFixtureSetRecord): Promise<SavedGoldenFixtureSet>;
  listGoldenFixtureSets(ruleVersionId: string): Promise<readonly SavedGoldenFixtureSet[]>;
  findGoldenFixtureSet(ruleVersionId: string, fixtureSetVersion: string): Promise<SavedGoldenFixtureSet | null>;
  findGoldenFixtureSetById(ruleVersionId: string, fixtureSetId: string): Promise<SavedGoldenFixtureSet | null>;
  saveGoldenFixtureExecution(record: SaveGoldenFixtureExecutionRecord): Promise<SavedGoldenFixtureExecution>;
  findSuccessfulGoldenFixtureExecution(
    ruleVersionId: string, fixtureSetId: string, artifactHash: string,
  ): Promise<SavedGoldenFixtureExecution | null>;
  saveRuleShadowRun(record: SaveRuleShadowRunRecord): Promise<{readonly run:SavedRuleShadowRun;readonly created:boolean}>;
  listRuleShadowRuns(rulePackageId: string): Promise<readonly SavedRuleShadowRun[]>;
  findRuleShadowRun(rulePackageId: string, runId: string): Promise<SavedRuleShadowRun | null>;
  approveRuleVersion(record: ApproveRuleVersionRecord): Promise<SavedRuleVersion | null>;
  scheduleRuleVersion(record: ScheduleRuleVersionRecord): Promise<SavedRuleVersion | null>;
  activateRuleVersion(record: ActivateRuleVersionRecord): Promise<SavedRuleVersion | null>;
  withdrawRuleVersion(record: WithdrawRuleVersionRecord): Promise<SavedRuleVersion | null>;
}
