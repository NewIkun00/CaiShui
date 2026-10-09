import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  FilingCalendarInput,
  FilingPackageFreezeInput,
  FilingPackageInput,
  FilingSopInput,
  FilingTestResultFixtureInput,
  FilingTaskGenerationInput,
  FilingTaskTransitionInput,
} from '@ledgerly/contracts';
import {
  assertCorrectionParent,
  assertFilingCalendarSource,
  CalculationRunStatus,
  deriveFilingTaskTiming,
  filingPackageFreezeBlockers,
  FilingError,
  FilingPackageError,
  transitionFilingTask,
} from '@ledgerly/domain';
import { createHash, randomUUID } from 'node:crypto';
import {
  ORGANIZATION_STORE,
  type OrganizationStore,
} from '../../organization/application/organization-store.js';
import type { RequestContext } from '../../organization/application/organization.service.js';
import {
  CALCULATION_STORE,
  type CalculationStore,
} from '../../calculation/application/calculation-store.js';
import {
  REVIEW_CASE_STORE,
  type ReviewCase,
  type ReviewCaseStore,
} from '../../review-case/application/review-case-store.js';
import {
  FILING_STORE,
  type FilingCalendar,
  type FilingPackage,
  type FilingPackageSnapshot,
  type FilingSop,
  type FilingStore,
  type FilingTask,
} from './filing-store.js';
import {
  TAX_RESULT_REFERENCE_PORT,
  type TaxResultReferencePort,
} from './tax-result-reference.port.js';

@Injectable()
export class FilingService {
  constructor(
    @Inject(FILING_STORE) private readonly store: FilingStore,
    @Inject(ORGANIZATION_STORE) private readonly organizations: OrganizationStore,
    @Inject(CALCULATION_STORE) private readonly calculations: CalculationStore,
    @Inject(REVIEW_CASE_STORE) private readonly reviews: ReviewCaseStore,
    @Inject(TAX_RESULT_REFERENCE_PORT) private readonly taxResults: TaxResultReferencePort,
  ) {}
  async createCalendar(input: FilingCalendarInput, context: RequestContext) {
    const tenantId = this.tenant(context);
    try {
      assertFilingCalendarSource(input.source);
    } catch (error) {
      this.reject(error, 'FILING_CALENDAR_SOURCE_REJECTED');
    }
    const now = new Date(),
      contentHash = sha256(input),
      calendar: FilingCalendar = {
        id: randomUUID(),
        name: input.name,
        versionTag: input.versionTag,
        jurisdictionCode: input.jurisdictionCode,
        year: input.year,
        source: { ...input.source },
        contentHash,
        createdAt: now,
        createdBy: context.actorId,
        entries: input.entries.map((entry) => ({ id: randomUUID(), ...entry })),
      };
    const result = await this.store.createCalendar({
      tenantId,
      calendar,
      traceId: context.traceId,
    });
    if (!result.created && result.calendar.contentHash !== contentHash)
      throw new ConflictException({
        code: 'FILING_CALENDAR_VERSION_EXISTS',
        message: 'Calendar version tag already exists with different content',
      });
    return result;
  }
  listCalendars(context: RequestContext) {
    return this.store.listCalendars(this.tenant(context));
  }
  async createSop(input: FilingSopInput, context: RequestContext) {
    const tenantId = this.tenant(context);
    try {
      assertFilingCalendarSource(input.source);
    } catch (error) {
      this.reject(error, 'FILING_SOP_SOURCE_REJECTED');
    }
    const now = new Date(),
      contentHash = sha256(input),
      sop: FilingSop = {
        id: randomUUID(),
        name: input.name,
        versionTag: input.versionTag,
        jurisdictionCode: input.jurisdictionCode,
        source: { ...input.source },
        steps: input.steps.map((step) => ({ ...step })),
        contentHash,
        createdAt: now,
        createdBy: context.actorId,
      };
    const result = await this.store.createSop({ tenantId, sop, traceId: context.traceId });
    if (!result.created && result.sop.contentHash !== contentHash)
      throw new ConflictException({
        code: 'FILING_SOP_VERSION_EXISTS',
        message: 'SOP version tag already exists with different content',
      });
    return result;
  }
  listSops(context: RequestContext) {
    return this.store.listSops(this.tenant(context));
  }
  async createTestResultFixture(
    companyId: string,
    input: FilingTestResultFixtureInput,
    context: RequestContext,
  ) {
    const tenantId = await this.company(companyId, context),
      calculation = await this.calculations.find(tenantId, companyId, input.calculationRunId);
    if (!calculation) throw new NotFoundException('Calculation run not found');
    if (!this.taxResults.registerTestFixture)
      throw new ConflictException({
        code: 'TEST_RESULT_FIXTURE_DISABLED',
        message: 'Test result fixtures are available only in explicit memory mode',
      });
    const ruleContentHash = sha256({
        type: 'TEST_RULE_REFERENCE_ONLY',
        calculationRunId: calculation.id,
      }),
      reference = {
        source: 'test_fixture' as const,
        calculationRunId: calculation.id,
        inputHash: calculation.inputHash,
        ruleVersionId: uuidFromHash(ruleContentHash),
        ruleContentHash,
        resultHash: sha256({
          type: 'TEST_RESULT_REFERENCE_ONLY',
          calculationRunId: calculation.id,
          inputHash: calculation.inputHash,
        }),
      };
    return this.taxResults.registerTestFixture(tenantId, companyId, reference);
  }
  async generate(companyId: string, input: FilingTaskGenerationInput, context: RequestContext) {
    const tenantId = await this.company(companyId, context),
      calendar = await this.store.findCalendar(tenantId, input.calendarId);
    if (!calendar) throw new NotFoundException('Filing calendar not found');
    if (input.usage === 'production' && calendar.source.type !== 'official_notice')
      throw new ConflictException({
        code: 'PRODUCTION_CALENDAR_SOURCE_REQUIRED',
        message: 'Production tasks require a verified official filing calendar source',
      });
    const now = new Date(),
      tasks: FilingTask[] = calendar.entries.map((entry) => ({
        id: randomUUID(),
        companyId,
        calendarId: calendar.id,
        calendarEntryId: entry.id,
        calendarName: calendar.name,
        calendarSourceType: calendar.source.type,
        taxType: entry.taxType,
        label: entry.label,
        periodStart: entry.periodStart,
        periodEnd: entry.periodEnd,
        dueDate: entry.dueDate,
        status: 'todo',
        version: 1,
        createdAt: now,
        createdBy: context.actorId,
        updatedAt: now,
        updatedBy: context.actorId,
      }));
    const result = await this.store.generateTasks({
      tenantId,
      companyId,
      calendar,
      tasks,
      actorId: context.actorId,
      traceId: context.traceId,
      occurredAt: now,
    });
    return {
      createdCount: result.createdCount,
      items: result.items.map((task) => this.withTiming(task, chinaDate(now))),
    };
  }
  async list(companyId: string, context: RequestContext, asOf?: string) {
    const tenantId = await this.company(companyId, context);
    return (await this.store.listTasks(tenantId, companyId)).map((task) =>
      this.withTiming(task, asOf ?? chinaDate(new Date())),
    );
  }
  async todos(companyId: string, context: RequestContext, asOf?: string) {
    return (await this.list(companyId, context, asOf)).filter((task) => task.status !== 'paid');
  }
  async transition(
    companyId: string,
    id: string,
    input: FilingTaskTransitionInput,
    context: RequestContext,
  ) {
    const tenantId = await this.company(companyId, context),
      current = await this.store.findTask(tenantId, companyId, id);
    if (!current) throw new NotFoundException('Filing task not found');
    if (current.version !== input.expectedVersion)
      throw new ConflictException({
        code: 'FILING_TASK_CHANGED',
        message: 'Filing task has changed',
      });
    let status;
    try {
      status = transitionFilingTask(current.status, input.action);
    } catch (error) {
      return this.reject(error, 'FILING_TASK_TRANSITION_REJECTED');
    }
    const changed = await this.store.transitionTask({
      tenantId,
      companyId,
      taskId: id,
      expectedVersion: input.expectedVersion,
      status,
      action: input.action,
      note: input.note,
      actorId: context.actorId,
      traceId: context.traceId,
      occurredAt: new Date(),
    });
    if (!changed)
      throw new ConflictException({
        code: 'FILING_TASK_CHANGED',
        message: 'Filing task has changed',
      });
    return this.withTiming(changed, chinaDate(new Date()));
  }
  async createPackage(companyId: string, input: FilingPackageInput, context: RequestContext) {
    const tenantId = await this.company(companyId, context),
      task = await this.store.findTask(tenantId, companyId, input.filingTaskId);
    if (!task) throw new NotFoundException('Filing task not found');
    const calendar = await this.store.findCalendar(tenantId, task.calendarId);
    if (!calendar) throw new NotFoundException('Filing calendar not found');
    const calculation = await this.calculations.find(tenantId, companyId, input.calculationRunId);
    if (!calculation) throw new NotFoundException('Calculation run not found');
    if (
      String(calculation.taxType) !== task.taxType ||
      calculation.periodStart !== task.periodStart ||
      calculation.periodEnd !== task.periodEnd
    )
      throw new ConflictException({
        code: 'FILING_PACKAGE_SCOPE_MISMATCH',
        message: 'Calculation run does not match filing task tax type and period',
      });
    const sop = await this.store.findSop(tenantId, input.sopVersionId);
    if (!sop) throw new NotFoundException('Filing SOP not found');
    if (sop.jurisdictionCode !== calendar.jurisdictionCode)
      throw new ConflictException({
        code: 'FILING_PACKAGE_SOP_SCOPE_MISMATCH',
        message: 'Filing SOP jurisdiction does not match calendar',
      });
    if (input.correctionOfPackageId) {
      const parent = await this.store.findPackage(tenantId, companyId, input.correctionOfPackageId);
      if (!parent) throw new NotFoundException('Correction parent package not found');
      try {
        assertCorrectionParent(parent.status);
      } catch (error) {
        return this.packageReject(error, 'FILING_PACKAGE_CORRECTION_REJECTED');
      }
    }
    const selected = await Promise.all(
      input.reviewCaseIds.map((id) => this.reviews.find(tenantId, companyId, id)),
    );
    if (selected.some((item) => !item)) throw new NotFoundException('Review case not found');
    const decisions = (selected as ReviewCase[])
      .filter((item) => item.status === 'approved')
      .map((item) => ({
        reviewCaseId: item.id,
        version: item.version,
        status: 'approved' as const,
        decisionHash: reviewDecisionHash(item),
      }));
    const result = await this.taxResults.find(tenantId, companyId, calculation.id);
    const snapshot: FilingPackageSnapshot = {
      filingTaskId: task.id,
      filingCalendarId: calendar.id,
      filingCalendarHash: calendar.contentHash,
      calculationRunId: calculation.id,
      inputHash: calculation.inputHash,
      ...(result?.source ? { taxResultSource: result.source } : {}),
      ...(result?.ruleVersionId
        ? { ruleVersionId: result.ruleVersionId }
        : calculation.ruleVersionId
          ? { ruleVersionId: calculation.ruleVersionId }
          : {}),
      ...(result?.ruleContentHash
        ? { ruleHash: result.ruleContentHash }
        : calculation.ruleContentHash
          ? { ruleHash: calculation.ruleContentHash }
          : {}),
      ...(result?.resultHash ? { resultHash: result.resultHash } : {}),
      reviewDecisions: decisions,
      sopVersionId: sop.id,
      sopHash: sop.contentHash,
    };
    const allReviews = await this.reviews.list(tenantId, companyId, {}),
      referencesMatch = this.resultCompatible(calculation, result),
      blockers = filingPackageFreezeBlockers({
        status: 'draft',
        hasRedReviewBlocker: this.redBlocker(allReviews),
        approvedReviewCount: decisions.length,
        calculationReady: referencesMatch,
        inputHash: snapshot.inputHash,
        ruleHash: snapshot.ruleHash,
        resultHash: snapshot.resultHash,
        sopHash: snapshot.sopHash,
        referencesMatchSnapshot: referencesMatch,
      });
    const now = new Date(),
      item: Omit<FilingPackage, 'packageNumber'> = {
        id: randomUUID(),
        companyId,
        status: 'draft',
        version: 1,
        ...(input.correctionOfPackageId
          ? { correctionOfPackageId: input.correctionOfPackageId }
          : {}),
        snapshot,
        contentHash: sha256({
          snapshot,
          correctionOfPackageId: input.correctionOfPackageId ?? null,
        }),
        blockers,
        createdAt: now,
        createdBy: context.actorId,
        updatedAt: now,
        updatedBy: context.actorId,
      };
    return this.store.createPackage({ tenantId, package: item, traceId: context.traceId });
  }
  async listPackages(companyId: string, context: RequestContext) {
    const tenantId = await this.company(companyId, context);
    return this.store.listPackages(tenantId, companyId);
  }
  async getPackage(companyId: string, id: string, context: RequestContext) {
    const tenantId = await this.company(companyId, context),
      item = await this.store.findPackage(tenantId, companyId, id);
    if (!item) throw new NotFoundException('Filing package not found');
    return item;
  }
  async freezePackage(
    companyId: string,
    id: string,
    input: FilingPackageFreezeInput,
    context: RequestContext,
  ) {
    const tenantId = await this.company(companyId, context),
      item = await this.store.findPackage(tenantId, companyId, id);
    if (!item) throw new NotFoundException('Filing package not found');
    if (item.version !== input.expectedVersion)
      throw new ConflictException({
        code: 'FILING_PACKAGE_CHANGED',
        message: 'Filing package has changed',
      });
    const blockers = await this.currentPackageBlockers(tenantId, companyId, item);
    if (blockers.length)
      throw new ConflictException({
        code: 'FILING_PACKAGE_FREEZE_BLOCKED',
        message: 'Filing package cannot be frozen',
        blockers,
      });
    const changed = await this.store.freezePackage({
      tenantId,
      companyId,
      packageId: id,
      expectedVersion: input.expectedVersion,
      note: input.note,
      actorId: context.actorId,
      traceId: context.traceId,
      occurredAt: new Date(),
    });
    if (!changed)
      throw new ConflictException({
        code: 'FILING_PACKAGE_CHANGED',
        message: 'Filing package has changed',
      });
    return changed;
  }
  private async currentPackageBlockers(tenantId: string, companyId: string, item: FilingPackage) {
    const snapshot = item.snapshot,
      task = await this.store.findTask(tenantId, companyId, snapshot.filingTaskId),
      calendar = task ? await this.store.findCalendar(tenantId, task.calendarId) : null,
      calculation = await this.calculations.find(tenantId, companyId, snapshot.calculationRunId),
      sop = await this.store.findSop(tenantId, snapshot.sopVersionId),
      result = await this.taxResults.find(tenantId, companyId, snapshot.calculationRunId),
      reviews = await this.reviews.list(tenantId, companyId, {}),
      decisionMatches = await Promise.all(
        snapshot.reviewDecisions.map(async (decision) => {
          const current = await this.reviews.find(tenantId, companyId, decision.reviewCaseId);
          return Boolean(
            current &&
              current.status === 'approved' &&
              current.version === decision.version &&
              reviewDecisionHash(current) === decision.decisionHash,
          );
        }),
      ),
      referencesMatch = Boolean(
        task &&
          calendar &&
          calculation &&
          sop &&
          result &&
          task.calendarId === snapshot.filingCalendarId &&
          calendar.contentHash === snapshot.filingCalendarHash &&
          calculation.inputHash === snapshot.inputHash &&
          result.calculationRunId === snapshot.calculationRunId &&
          result.source === snapshot.taxResultSource &&
          result.inputHash === snapshot.inputHash &&
          result.ruleVersionId === snapshot.ruleVersionId &&
          result.ruleContentHash === snapshot.ruleHash &&
          result.resultHash === snapshot.resultHash &&
          this.resultCompatible(calculation, result) &&
          sop.contentHash === snapshot.sopHash &&
          decisionMatches.every(Boolean),
      );
    return filingPackageFreezeBlockers({
      status: item.status,
      hasRedReviewBlocker: this.redBlocker(reviews),
      approvedReviewCount: snapshot.reviewDecisions.length,
      calculationReady: Boolean(calculation && this.resultCompatible(calculation, result)),
      inputHash: snapshot.inputHash,
      ruleHash: snapshot.ruleHash,
      resultHash: snapshot.resultHash,
      sopHash: snapshot.sopHash,
      referencesMatchSnapshot: referencesMatch,
    });
  }
  private redBlocker(items: readonly ReviewCase[]) {
    return items.some(
      (item) => item.riskLevel === 'red' && item.blocksFiling && item.status !== 'approved',
    );
  }
  private resultCompatible(
    calculation: Awaited<ReturnType<CalculationStore['find']>>,
    result: Awaited<ReturnType<TaxResultReferencePort['find']>>,
  ) {
    if (
      !calculation ||
      !result ||
      result.calculationRunId !== calculation.id ||
      result.inputHash !== calculation.inputHash
    )
      return false;
    if (result.source === 'test_fixture') return true;
    return (
      calculation.status === CalculationRunStatus.Ready &&
      result.ruleVersionId === calculation.ruleVersionId &&
      result.ruleContentHash === calculation.ruleContentHash
    );
  }
  private withTiming(task: FilingTask, asOf: string) {
    return { ...task, timing: deriveFilingTaskTiming(task.status, task.dueDate, asOf) };
  }
  private async company(companyId: string, context: RequestContext) {
    const tenantId = this.tenant(context);
    if (!(await this.organizations.findCompany(tenantId, companyId)))
      throw new NotFoundException('Company not found');
    return tenantId;
  }
  private tenant(context: RequestContext) {
    if (!context.tenantId) throw new NotFoundException('Filing resource not found');
    return context.tenantId;
  }
  private reject(error: unknown, code: string): never {
    if (error instanceof FilingError) throw new ConflictException({ code, message: error.message });
    throw error;
  }
  private packageReject(error: unknown, code: string): never {
    if (error instanceof FilingPackageError)
      throw new ConflictException({ code, message: error.message, blockers: error.blockers });
    throw error;
  }
}
function sha256(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
function reviewDecisionHash(item: ReviewCase) {
  return sha256({
    id: item.id,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    status: item.status,
    version: item.version,
    updatedAt: item.updatedAt.toISOString(),
    updatedBy: item.updatedBy,
  });
}
function uuidFromHash(hash: string) {
  const value = `${hash.slice(0, 12)}4${hash.slice(13, 16)}8${hash.slice(17, 32)}`;
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}
function chinaDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
