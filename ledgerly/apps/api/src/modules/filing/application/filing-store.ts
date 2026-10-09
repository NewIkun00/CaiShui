import type {
  FilingAdjustmentStatus,
  FilingAdjustmentType,
  FilingCalendarSource,
  FilingEvidenceKind,
  FilingPackageBlockerCode,
  FilingPackageStatus,
  FilingTaskStatus,
} from '@ledgerly/domain';
export type FilingTaxType = 'vat' | 'surcharge' | 'corporate_income_tax' | 'stamp_duty';
export interface FilingCalendarEntry {
  readonly id: string;
  readonly taxType: FilingTaxType;
  readonly label: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dueDate: string;
}
export interface FilingCalendar {
  readonly id: string;
  readonly name: string;
  readonly versionTag: string;
  readonly jurisdictionCode: string;
  readonly year: number;
  readonly source: FilingCalendarSource;
  readonly contentHash: string;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly entries: readonly FilingCalendarEntry[];
}
export interface FilingSopStep {
  readonly code: string;
  readonly title: string;
  readonly instruction: string;
}
export interface FilingSop {
  readonly id: string;
  readonly name: string;
  readonly versionTag: string;
  readonly jurisdictionCode: string;
  readonly source: FilingCalendarSource;
  readonly steps: readonly FilingSopStep[];
  readonly contentHash: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}
export interface FilingTask {
  readonly id: string;
  readonly companyId: string;
  readonly calendarId: string;
  readonly calendarEntryId: string;
  readonly calendarName: string;
  readonly calendarSourceType: FilingCalendarSource['type'];
  readonly taxType: FilingTaxType;
  readonly label: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dueDate: string;
  readonly status: FilingTaskStatus;
  readonly version: number;
  readonly filedAt?: Date | undefined;
  readonly filedBy?: string | undefined;
  readonly paidAt?: Date | undefined;
  readonly paidBy?: string | undefined;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}
export interface FilingPackageReviewDecision {
  readonly reviewCaseId: string;
  readonly version: number;
  readonly status: 'approved';
  readonly decisionHash: string;
}
export interface FilingPackageSnapshot {
  readonly filingTaskId: string;
  readonly filingCalendarId: string;
  readonly filingCalendarHash: string;
  readonly calculationRunId: string;
  readonly taxResultSource?: 'test_fixture' | 'calculation_result' | undefined;
  readonly inputHash?: string | undefined;
  readonly ruleVersionId?: string | undefined;
  readonly ruleHash?: string | undefined;
  readonly resultHash?: string | undefined;
  readonly reviewDecisions: readonly FilingPackageReviewDecision[];
  readonly sopVersionId: string;
  readonly sopHash: string;
}
export interface FilingPackage {
  readonly id: string;
  readonly companyId: string;
  readonly packageNumber: number;
  readonly status: FilingPackageStatus;
  readonly version: number;
  readonly correctionOfPackageId?: string | undefined;
  readonly snapshot: FilingPackageSnapshot;
  readonly contentHash: string;
  readonly blockers: readonly FilingPackageBlockerCode[];
  readonly frozenAt?: Date | undefined;
  readonly frozenBy?: string | undefined;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}
export interface FilingEvidence {
  readonly id: string;
  readonly companyId: string;
  readonly filingTaskId: string;
  readonly filingPackageId: string;
  readonly kind: FilingEvidenceKind;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly documentHash: string;
  readonly externalReference: string;
  readonly occurredAt: Date;
  readonly reportedResultHash?: string | undefined;
  readonly contentHash: string;
  readonly note: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}
export interface FilingClosure {
  readonly id: string;
  readonly companyId: string;
  readonly filingTaskId: string;
  readonly filingPackageId: string;
  readonly packageContentHash: string;
  readonly resultHash: string;
  readonly evidenceIds: readonly string[];
  readonly contentHash: string;
  readonly note: string;
  readonly closedAt: Date;
  readonly closedBy: string;
}
export interface FilingAdjustmentEvidence { readonly documentId:string;readonly documentVersion:number;readonly documentHash:string }
export interface FilingAdjustmentWorkOrder {
  readonly id:string;readonly companyId:string;readonly filingTaskId:string;readonly sourcePackageId:string;
  readonly type:FilingAdjustmentType;readonly status:FilingAdjustmentStatus;readonly version:number;readonly reason:string;
  readonly evidence:readonly FilingAdjustmentEvidence[];readonly reviewedBy?:string|undefined;readonly resolutionPackageId?:string|undefined;
  readonly resolutionEvidence:readonly FilingAdjustmentEvidence[];readonly resolutionNote?:string|undefined;
  readonly openedAt:Date;readonly openedBy:string;readonly updatedAt:Date;readonly updatedBy:string;
}
export interface CreateFilingCalendarRecord {
  readonly tenantId: string;
  readonly calendar: FilingCalendar;
  readonly traceId: string;
}
export interface CreateFilingSopRecord {
  readonly tenantId: string;
  readonly sop: FilingSop;
  readonly traceId: string;
}
export interface GenerateFilingTasksRecord {
  readonly tenantId: string;
  readonly companyId: string;
  readonly calendar: FilingCalendar;
  readonly tasks: readonly FilingTask[];
  readonly actorId: string;
  readonly traceId: string;
  readonly occurredAt: Date;
}
export interface TransitionFilingTaskRecord {
  readonly tenantId: string;
  readonly companyId: string;
  readonly taskId: string;
  readonly expectedVersion: number;
  readonly status: FilingTaskStatus;
  readonly action: string;
  readonly note: string;
  readonly actorId: string;
  readonly traceId: string;
  readonly occurredAt: Date;
}
export interface CreateFilingPackageRecord {
  readonly tenantId: string;
  readonly package: Omit<FilingPackage, 'packageNumber'>;
  readonly traceId: string;
}
export interface FreezeFilingPackageRecord {
  readonly tenantId: string;
  readonly companyId: string;
  readonly packageId: string;
  readonly expectedVersion: number;
  readonly note: string;
  readonly actorId: string;
  readonly traceId: string;
  readonly occurredAt: Date;
}
export interface CreateFilingEvidenceRecord {
  readonly tenantId: string;
  readonly evidence: FilingEvidence;
  readonly traceId: string;
}
export interface CreateFilingClosureRecord {
  readonly tenantId: string;
  readonly closure: FilingClosure;
  readonly traceId: string;
}
export interface CreateFilingAdjustmentRecord { readonly tenantId:string;readonly workOrder:FilingAdjustmentWorkOrder;readonly traceId:string }
export interface TransitionFilingAdjustmentRecord { readonly tenantId:string;readonly companyId:string;readonly workOrderId:string;readonly expectedVersion:number;readonly next:FilingAdjustmentWorkOrder;readonly action:string;readonly note:string;readonly traceId:string }
export const FILING_STORE = Symbol('FILING_STORE');
export interface FilingStore {
  createCalendar(
    record: CreateFilingCalendarRecord,
  ): Promise<{ calendar: FilingCalendar; created: boolean }>;
  listCalendars(tenantId: string): Promise<readonly FilingCalendar[]>;
  findCalendar(tenantId: string, id: string): Promise<FilingCalendar | null>;
  createSop(record: CreateFilingSopRecord): Promise<{ sop: FilingSop; created: boolean }>;
  listSops(tenantId: string): Promise<readonly FilingSop[]>;
  findSop(tenantId: string, id: string): Promise<FilingSop | null>;
  generateTasks(
    record: GenerateFilingTasksRecord,
  ): Promise<{ items: readonly FilingTask[]; createdCount: number }>;
  listTasks(tenantId: string, companyId: string): Promise<readonly FilingTask[]>;
  findTask(tenantId: string, companyId: string, id: string): Promise<FilingTask | null>;
  transitionTask(record: TransitionFilingTaskRecord): Promise<FilingTask | null>;
  createPackage(record: CreateFilingPackageRecord): Promise<FilingPackage>;
  listPackages(tenantId: string, companyId: string): Promise<readonly FilingPackage[]>;
  findPackage(tenantId: string, companyId: string, id: string): Promise<FilingPackage | null>;
  freezePackage(record: FreezeFilingPackageRecord): Promise<FilingPackage | null>;
  createEvidence(record: CreateFilingEvidenceRecord): Promise<FilingEvidence>;
  listEvidence(
    tenantId: string,
    companyId: string,
    packageId: string,
  ): Promise<readonly FilingEvidence[]>;
  createClosure(record: CreateFilingClosureRecord): Promise<FilingClosure | null>;
  listClosures(tenantId: string, companyId: string): Promise<readonly FilingClosure[]>;
  findClosureByPackage(
    tenantId: string,
    companyId: string,
    packageId: string,
  ): Promise<FilingClosure | null>;
  createAdjustment(record:CreateFilingAdjustmentRecord):Promise<FilingAdjustmentWorkOrder>;
  listAdjustments(tenantId:string,companyId:string):Promise<readonly FilingAdjustmentWorkOrder[]>;
  findAdjustment(tenantId:string,companyId:string,id:string):Promise<FilingAdjustmentWorkOrder|null>;
  transitionAdjustment(record:TransitionFilingAdjustmentRecord):Promise<FilingAdjustmentWorkOrder|null>;
}
