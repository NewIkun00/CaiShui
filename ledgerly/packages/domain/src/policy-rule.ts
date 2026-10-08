export enum TaxType {
  Vat = 'vat',
  Surcharge = 'surcharge',
  CorporateIncomeTax = 'corporate_income_tax',
  StampDuty = 'stamp_duty',
}

export enum RuleVersionStatus {
  Draft = 'draft',
  TechnicalReviewed = 'technical_reviewed',
  TaxReviewed = 'tax_reviewed',
  Tested = 'tested',
  Approved = 'approved',
  Scheduled = 'scheduled',
  Active = 'active',
  Superseded = 'superseded',
  Withdrawn = 'withdrawn',
}

export enum RuleReviewKind {
  Technical = 'technical',
  Tax = 'tax',
}

export const requiredRuleTestScenarios = Object.freeze([
  'normal', 'boundary', 'cross_period', 'red_invoice', 'correction', 'exception',
] as const);
export type RuleTestScenario = typeof requiredRuleTestScenarios[number];

export interface PolicySourceInput {
  readonly documentNumber: string;
  readonly title: string;
  readonly officialUrl: string;
  readonly issuingAuthority: string;
  readonly publishedOn: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string | undefined;
  readonly summary: string;
  readonly contentHash: string;
  readonly lastVerifiedOn: string;
}

export interface PolicySource extends PolicySourceInput {
  readonly officialUrl: string;
}

export interface RulePackageInput {
  readonly code: string;
  readonly name: string;
  readonly taxType: TaxType;
  readonly jurisdictions: readonly string[];
  readonly description: string;
}

export interface RulePackage extends RulePackageInput {
  readonly jurisdictions: readonly string[];
}

export type RuleParameterValue = string | boolean | readonly string[];

export interface RuleApplicability {
  readonly taxpayerStatuses: readonly string[];
  readonly filingCycles: readonly string[];
  readonly industries: readonly string[];
  readonly requiredTags: readonly string[];
  readonly excludedTags: readonly string[];
}

export interface RuleVersionInput {
  readonly versionTag: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string | undefined;
  readonly sourceIds: readonly string[];
  readonly applicability: RuleApplicability;
  readonly calculationImplementation: string;
  readonly parameters: Readonly<Record<string, RuleParameterValue>>;
  readonly explanation: string;
  readonly contentHash: string;
}

export interface RuleVersion extends RuleVersionInput {
  readonly status: RuleVersionStatus;
}

export interface RuleReviewState {
  readonly status: RuleVersionStatus;
  readonly editorId: string;
  readonly technicalReviewedBy?: string | undefined;
  readonly taxReviewedBy?: string | undefined;
}

export interface RuleReviewResult {
  readonly status: RuleVersionStatus;
  readonly technicalReviewedBy?: string | undefined;
  readonly taxReviewedBy?: string | undefined;
}

export interface RuleTestEvidenceInput {
  readonly fixtureSetVersion: string;
  readonly totalFixtures: number;
  readonly passedFixtures: number;
  readonly coveredScenarios: readonly RuleTestScenario[];
  readonly artifactHash: string;
  readonly note: string;
}

export interface GoldenFixtureInput {
  readonly caseId: string;
  readonly scenario: RuleTestScenario;
  readonly input: Readonly<Record<string, unknown>>;
  readonly expected: Readonly<Record<string, unknown>>;
  readonly explanation: string;
}

export interface GoldenFixtureSetInput {
  readonly fixtureSetVersion: string;
  readonly redactionAttested: boolean;
  readonly professionalNote: string;
  readonly fixtures: readonly GoldenFixtureInput[];
  readonly contentHash: string;
}

export interface GoldenFixtureSet extends GoldenFixtureSetInput {
  readonly fixtures: readonly GoldenFixtureInput[];
}

export type RuleShadowCaseStatus = 'identical' | 'output_changed' | 'steps_changed' |
  'output_and_steps_changed' | 'baseline_failed' | 'candidate_failed' | 'both_failed';

export interface RuleShadowExecutionCase {
  readonly caseId: string;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly steps: readonly Readonly<Record<string, unknown>>[];
  readonly error?: string | undefined;
}

export interface RuleShadowCaseDifference {
  readonly caseId: string;
  readonly status: RuleShadowCaseStatus;
  readonly outputChanged: boolean;
  readonly stepsChanged: boolean;
  readonly baseline: RuleShadowExecutionCase;
  readonly candidate: RuleShadowExecutionCase;
}

export interface RuleShadowComparison {
  readonly status: 'identical' | 'differences_found' | 'execution_failed';
  readonly totalFixtures: number;
  readonly identicalFixtures: number;
  readonly changedFixtures: number;
  readonly failedFixtures: number;
  readonly differences: readonly RuleShadowCaseDifference[];
}

export interface RuleApprovalState extends RuleReviewState {
  readonly testedBy?: string | undefined;
}

export interface RuleScheduleInput {
  readonly status: RuleVersionStatus;
  readonly approvedBy?: string | undefined;
  readonly actorId: string;
  readonly activationAt: Date;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string | undefined;
  readonly now: Date;
  readonly note: string;
}

export interface RuleActivationInput {
  readonly status: RuleVersionStatus;
  readonly approvedBy?: string | undefined;
  readonly actorId: string;
  readonly activationAt?: Date | undefined;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string | undefined;
  readonly now: Date;
  readonly note: string;
}

export interface RuleWithdrawalInput {
  readonly status: RuleVersionStatus;
  readonly approvedBy?: string | undefined;
  readonly actorId: string;
  readonly note: string;
}

export class PolicyRuleError extends Error {
  override readonly name = 'PolicyRuleError';
}

export function createPolicySource(input: PolicySourceInput): PolicySource {
  const officialUrl = input.officialUrl.trim();
  assertOfficialUrl(officialUrl);
  assertNonEmpty(input.documentNumber, 'Policy document number');
  assertNonEmpty(input.title, 'Policy title');
  assertNonEmpty(input.issuingAuthority, 'Issuing authority');
  assertNonEmpty(input.summary, 'Policy summary');
  assertIsoDate(input.publishedOn, 'Published date');
  assertDateRange(input.effectiveFrom, input.effectiveTo);
  assertIsoDate(input.lastVerifiedOn, 'Verification date');
  if (!/^[0-9a-f]{64}$/.test(input.contentHash)) {
    throw new PolicyRuleError('Policy content hash must be a lowercase SHA-256 value');
  }
  return Object.freeze({
    ...input,
    documentNumber: input.documentNumber.trim(),
    title: input.title.trim(),
    officialUrl,
    issuingAuthority: input.issuingAuthority.trim(),
    summary: input.summary.trim(),
  });
}

export function createRulePackage(input: RulePackageInput): RulePackage {
  const code = input.code.trim();
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(code)) {
    throw new PolicyRuleError('Rule package code must be a stable lowercase identifier');
  }
  assertNonEmpty(input.name, 'Rule package name');
  assertNonEmpty(input.description, 'Rule package description');
  const jurisdictions = normalizeList(input.jurisdictions, 'Jurisdictions');
  if (!jurisdictions.every((value) => /^CN(?:-[A-Z0-9]{2,6})?$/.test(value))) {
    throw new PolicyRuleError('Jurisdiction codes must use CN or CN-* format');
  }
  return Object.freeze({
    ...input,
    code,
    name: input.name.trim(),
    description: input.description.trim(),
    jurisdictions,
  });
}

export function createRuleVersion(input: RuleVersionInput): RuleVersion {
  if (!/^\d{4}\.\d{2}\.\d{2}-\d+$/.test(input.versionTag)) {
    throw new PolicyRuleError('Rule version must use YYYY.MM.DD-N format');
  }
  assertDateRange(input.effectiveFrom, input.effectiveTo);
  const sourceIds = normalizeList(input.sourceIds, 'Policy sources');
  if (!/^[a-z][a-z0-9-]*-v\d+$/.test(input.calculationImplementation)) {
    throw new PolicyRuleError('Calculation implementation must reference a versioned implementation key');
  }
  assertNonEmpty(input.explanation, 'Rule explanation');
  if (!/^[0-9a-f]{64}$/.test(input.contentHash)) {
    throw new PolicyRuleError('Rule content hash must be a lowercase SHA-256 value');
  }
  return Object.freeze({
    ...input,
    sourceIds,
    applicability: Object.freeze({
      taxpayerStatuses: normalizeList(input.applicability.taxpayerStatuses, 'Taxpayer statuses'),
      filingCycles: normalizeList(input.applicability.filingCycles, 'Filing cycles'),
      industries: normalizeList(input.applicability.industries, 'Industries'),
      requiredTags: normalizeOptionalList(input.applicability.requiredTags),
      excludedTags: normalizeOptionalList(input.applicability.excludedTags),
    }),
    explanation: input.explanation.trim(),
    status: RuleVersionStatus.Draft,
  });
}

export function reviewRuleVersion(
  current: RuleReviewState,
  kind: RuleReviewKind,
  reviewerId: string,
  note: string,
): RuleReviewResult {
  if (!reviewerId.trim()) throw new PolicyRuleError('Reviewer is required');
  if (!note.trim()) throw new PolicyRuleError('Review note is required');
  if (reviewerId === current.editorId) {
    throw new PolicyRuleError('Rule editor cannot review the same rule version');
  }
  if (kind === RuleReviewKind.Technical) {
    if (current.status !== RuleVersionStatus.Draft) {
      throw new PolicyRuleError('Technical review requires a draft rule version');
    }
    return Object.freeze({
      status: RuleVersionStatus.TechnicalReviewed,
      technicalReviewedBy: reviewerId,
      ...(current.taxReviewedBy ? { taxReviewedBy: current.taxReviewedBy } : {}),
    });
  }
  if (current.status !== RuleVersionStatus.TechnicalReviewed || !current.technicalReviewedBy) {
    throw new PolicyRuleError('Tax review requires a completed technical review');
  }
  if (reviewerId === current.technicalReviewedBy) {
    throw new PolicyRuleError('Technical and tax reviews require different reviewers');
  }
  return Object.freeze({
    status: RuleVersionStatus.TaxReviewed,
    technicalReviewedBy: current.technicalReviewedBy,
    taxReviewedBy: reviewerId,
  });
}

export function acceptRuleTestEvidence(
  status: RuleVersionStatus,
  input: RuleTestEvidenceInput,
): RuleVersionStatus {
  if (status !== RuleVersionStatus.TaxReviewed) {
    throw new PolicyRuleError('Test evidence requires a tax-reviewed rule version');
  }
  if (!/^\d{4}\.\d{2}\.\d{2}-\d+$/.test(input.fixtureSetVersion)) {
    throw new PolicyRuleError('Fixture set version must use YYYY.MM.DD-N format');
  }
  if (!Number.isInteger(input.totalFixtures) || input.totalFixtures <= 0 ||
      !Number.isInteger(input.passedFixtures) || input.passedFixtures !== input.totalFixtures) {
    throw new PolicyRuleError('Every signed fixture must pass before a rule can be tested');
  }
  const covered = new Set(input.coveredScenarios);
  const missing = requiredRuleTestScenarios.filter((scenario) => !covered.has(scenario));
  if (missing.length > 0) {
    throw new PolicyRuleError(`Rule test evidence is missing scenarios: ${missing.join(', ')}`);
  }
  if (!/^[0-9a-f]{64}$/.test(input.artifactHash)) {
    throw new PolicyRuleError('Test evidence artifact hash must be a lowercase SHA-256 value');
  }
  assertNonEmpty(input.note, 'Test evidence note');
  return RuleVersionStatus.Tested;
}

export function createGoldenFixtureSet(input: GoldenFixtureSetInput): GoldenFixtureSet {
  if (!/^\d{4}\.\d{2}\.\d{2}-\d+$/.test(input.fixtureSetVersion)) {
    throw new PolicyRuleError('Fixture set version must use YYYY.MM.DD-N format');
  }
  if (!input.redactionAttested) throw new PolicyRuleError('Golden fixtures require a redaction attestation');
  assertNonEmpty(input.professionalNote, 'Professional fixture note');
  if (!/^[0-9a-f]{64}$/.test(input.contentHash)) {
    throw new PolicyRuleError('Fixture set content hash must be a lowercase SHA-256 value');
  }
  if (input.fixtures.length === 0) throw new PolicyRuleError('Golden fixture set cannot be empty');
  const caseIds = new Set<string>();
  const fixtures = input.fixtures.map((fixture) => {
    const caseId = fixture.caseId.trim();
    if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(caseId) || caseIds.has(caseId)) {
      throw new PolicyRuleError('Golden fixture case IDs must be unique stable identifiers');
    }
    caseIds.add(caseId);
    assertNonEmpty(fixture.explanation, 'Golden fixture explanation');
    assertJsonRecord(fixture.input, 'Golden fixture input');
    assertJsonRecord(fixture.expected, 'Golden fixture expected output');
    if (Object.keys(fixture.input).length === 0 || Object.keys(fixture.expected).length === 0) {
      throw new PolicyRuleError('Golden fixture input and expected output cannot be empty');
    }
    return Object.freeze({ ...fixture, caseId, explanation: fixture.explanation.trim() });
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  const covered = new Set(fixtures.map((fixture) => fixture.scenario));
  const missing = requiredRuleTestScenarios.filter((scenario) => !covered.has(scenario));
  if (missing.length > 0) {
    throw new PolicyRuleError(`Golden fixture set is missing scenarios: ${missing.join(', ')}`);
  }
  return Object.freeze({ ...input, professionalNote: input.professionalNote.trim(), fixtures: Object.freeze(fixtures) });
}

export function compareRuleShadowExecutions(
  baselineResults: readonly RuleShadowExecutionCase[],
  candidateResults: readonly RuleShadowExecutionCase[],
): RuleShadowComparison {
  if (baselineResults.length === 0 || candidateResults.length === 0) {
    throw new PolicyRuleError('Shadow analysis requires non-empty execution results');
  }
  const index = (items: readonly RuleShadowExecutionCase[], label: string) => {
    const result = new Map<string, RuleShadowExecutionCase>();
    for (const item of items) {
      const caseId = item.caseId.trim();
      if (!caseId || result.has(caseId)) throw new PolicyRuleError(`${label} case IDs must be unique`);
      if ((!item.output && !item.error) || (item.output && item.error)) {
        throw new PolicyRuleError(`${label} case ${caseId} must contain either output or error`);
      }
      result.set(caseId, Object.freeze({ ...item, caseId }));
    }
    return result;
  };
  const baseline = index(baselineResults, 'Baseline');
  const candidate = index(candidateResults, 'Candidate');
  const baselineIds = [...baseline.keys()].sort();
  const candidateIds = [...candidate.keys()].sort();
  if (JSON.stringify(baselineIds) !== JSON.stringify(candidateIds)) {
    throw new PolicyRuleError('Baseline and candidate must execute the same fixture cases');
  }
  const differences = baselineIds.map((caseId): RuleShadowCaseDifference => {
    const left = baseline.get(caseId)!;
    const right = candidate.get(caseId)!;
    if (left.error || right.error) {
      const status: RuleShadowCaseStatus = left.error && right.error ? 'both_failed' :
        left.error ? 'baseline_failed' : 'candidate_failed';
      return Object.freeze({ caseId, status, outputChanged: false, stepsChanged: false, baseline:left, candidate:right });
    }
    const outputChanged = !jsonEqual(left.output, right.output);
    const stepsChanged = !jsonEqual(left.steps, right.steps);
    const status: RuleShadowCaseStatus = outputChanged && stepsChanged ? 'output_and_steps_changed' :
      outputChanged ? 'output_changed' : stepsChanged ? 'steps_changed' : 'identical';
    return Object.freeze({ caseId, status, outputChanged, stepsChanged, baseline:left, candidate:right });
  });
  const failedFixtures = differences.filter((item) => item.status.endsWith('failed')).length;
  const identicalFixtures = differences.filter((item) => item.status === 'identical').length;
  const changedFixtures = differences.length - identicalFixtures - failedFixtures;
  return Object.freeze({
    status: failedFixtures > 0 ? 'execution_failed' : changedFixtures > 0 ? 'differences_found' : 'identical',
    totalFixtures: differences.length, identicalFixtures, changedFixtures, failedFixtures,
    differences: Object.freeze(differences),
  });
}

export function approveRuleVersion(
  current: RuleApprovalState,
  approverId: string,
  note: string,
): RuleVersionStatus {
  if (current.status !== RuleVersionStatus.Tested) {
    throw new PolicyRuleError('Approval requires a tested rule version');
  }
  if (!approverId.trim() || !note.trim()) throw new PolicyRuleError('Approver and approval note are required');
  const priorActors = [current.editorId, current.technicalReviewedBy, current.taxReviewedBy, current.testedBy]
    .filter((value): value is string => Boolean(value));
  if (priorActors.includes(approverId)) {
    throw new PolicyRuleError('Rule approver must be independent from editing, review, and test sign-off');
  }
  return RuleVersionStatus.Approved;
}

export function scheduleRuleVersion(input: RuleScheduleInput): RuleVersionStatus {
  if (input.status !== RuleVersionStatus.Approved || !input.approvedBy) {
    throw new PolicyRuleError('Scheduling requires an approved rule version');
  }
  if (input.actorId !== input.approvedBy) {
    throw new PolicyRuleError('Only the rule approver can schedule this version');
  }
  if (!input.note.trim()) throw new PolicyRuleError('Release schedule note is required');
  if (Number.isNaN(input.activationAt.getTime()) || input.activationAt < input.now) {
    throw new PolicyRuleError('Activation time cannot be earlier than the scheduling time');
  }
  const activationDate = input.activationAt.toISOString().slice(0, 10);
  if (activationDate < input.effectiveFrom || (input.effectiveTo && activationDate > input.effectiveTo)) {
    throw new PolicyRuleError('Activation time must fall within the rule effective period');
  }
  return RuleVersionStatus.Scheduled;
}

export function activateRuleVersion(input: RuleActivationInput): RuleVersionStatus {
  if (input.status !== RuleVersionStatus.Scheduled || !input.activationAt || !input.approvedBy) {
    throw new PolicyRuleError('Activation requires a scheduled, approved rule version');
  }
  if (input.actorId !== input.approvedBy) {
    throw new PolicyRuleError('Only the rule approver can activate this version');
  }
  if (!input.note.trim()) throw new PolicyRuleError('Activation note is required');
  if (input.now < input.activationAt) {
    throw new PolicyRuleError('Rule version cannot activate before its scheduled time');
  }
  const activationDate = input.now.toISOString().slice(0, 10);
  if (activationDate < input.effectiveFrom || (input.effectiveTo && activationDate > input.effectiveTo)) {
    throw new PolicyRuleError('Activation must occur within the rule effective period');
  }
  return RuleVersionStatus.Active;
}

export function withdrawRuleVersion(input: RuleWithdrawalInput): RuleVersionStatus {
  if (input.status !== RuleVersionStatus.Active || !input.approvedBy) {
    throw new PolicyRuleError('Withdrawal requires an active, approved rule version');
  }
  if (input.actorId !== input.approvedBy) {
    throw new PolicyRuleError('Only the rule approver can withdraw this version');
  }
  if (!input.note.trim()) throw new PolicyRuleError('Withdrawal reason is required');
  return RuleVersionStatus.Withdrawn;
}

function assertOfficialUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PolicyRuleError('Policy URL is invalid');
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !(host === 'gov.cn' || host.endsWith('.gov.cn'))) {
    throw new PolicyRuleError('Policy URL must use HTTPS on an official gov.cn domain');
  }
}

function assertDateRange(from: string, to?: string): void {
  assertIsoDate(from, 'Effective date');
  if (to) {
    assertIsoDate(to, 'Expiry date');
    if (to < from) throw new PolicyRuleError('Expiry date cannot be earlier than effective date');
  }
}

function assertIsoDate(value: string, label: string): void {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value) {
    throw new PolicyRuleError(`${label} must be an ISO date`);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new PolicyRuleError(`${label} is required`);
}

function normalizeList(values: readonly string[], label: string): readonly string[] {
  const normalized = normalizeOptionalList(values);
  if (normalized.length === 0) throw new PolicyRuleError(`${label} cannot be empty`);
  return normalized;
}

function normalizeOptionalList(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))].sort());
}

function assertJsonRecord(value: Readonly<Record<string, unknown>>, label: string): void {
  const visit = (item: unknown): boolean => item === null || typeof item === 'string' || typeof item === 'boolean' ||
    (typeof item === 'number' && Number.isFinite(item)) ||
    (Array.isArray(item) && item.every(visit)) ||
    (typeof item === 'object' && item !== null && Object.values(item as Record<string, unknown>).every(visit));
  if (!visit(value)) throw new PolicyRuleError(`${label} must contain JSON-safe values`);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right));
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalizeJson(item)]));
  }
  return value;
}
