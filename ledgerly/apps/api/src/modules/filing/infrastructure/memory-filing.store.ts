import { Injectable } from '@nestjs/common';
import type {
  CreateFilingCalendarRecord,
  CreateFilingAdjustmentRecord,
  CreateFilingClosureRecord,
  CreateFilingEvidenceRecord,
  CreateFilingPackageRecord,
  CreateFilingSopRecord,
  FilingCalendar,
  FilingAdjustmentWorkOrder,
  FilingClosure,
  FilingEvidence,
  FilingPackage,
  FilingSop,
  FilingStore,
  FilingTask,
  FreezeFilingPackageRecord,
  GenerateFilingTasksRecord,
  TransitionFilingTaskRecord,
  TransitionFilingAdjustmentRecord,
} from '../application/filing-store.js';
@Injectable()
export class MemoryFilingStore implements FilingStore {
  private readonly calendars = new Map<string, FilingCalendar[]>();
  private readonly sops = new Map<string, FilingSop[]>();
  private readonly tasks = new Map<string, FilingTask[]>();
  private readonly packages = new Map<string, FilingPackage[]>();
  private readonly evidence = new Map<string, FilingEvidence[]>();
  private readonly closures = new Map<string, FilingClosure[]>();
  private readonly adjustments = new Map<string, FilingAdjustmentWorkOrder[]>();
  private packageNumber = 0;
  createCalendar(
    record: CreateFilingCalendarRecord,
  ): Promise<{ calendar: FilingCalendar; created: boolean }> {
    const items = this.calendars.get(record.tenantId) ?? [],
      existing = items.find(
        (item) =>
          item.jurisdictionCode === record.calendar.jurisdictionCode &&
          item.year === record.calendar.year &&
          item.versionTag === record.calendar.versionTag,
      );
    if (existing) return Promise.resolve({ calendar: existing, created: false });
    this.calendars.set(record.tenantId, [record.calendar, ...items]);
    return Promise.resolve({ calendar: record.calendar, created: true });
  }
  listCalendars(tenantId: string) {
    return Promise.resolve(this.calendars.get(tenantId) ?? []);
  }
  findCalendar(tenantId: string, id: string) {
    return Promise.resolve(
      (this.calendars.get(tenantId) ?? []).find((item) => item.id === id) ?? null,
    );
  }
  createSop(record: CreateFilingSopRecord): Promise<{ sop: FilingSop; created: boolean }> {
    const items = this.sops.get(record.tenantId) ?? [],
      existing = items.find(
        (item) =>
          item.jurisdictionCode === record.sop.jurisdictionCode &&
          item.versionTag === record.sop.versionTag,
      );
    if (existing) return Promise.resolve({ sop: existing, created: false });
    this.sops.set(record.tenantId, [record.sop, ...items]);
    return Promise.resolve({ sop: record.sop, created: true });
  }
  listSops(tenantId: string) {
    return Promise.resolve(this.sops.get(tenantId) ?? []);
  }
  findSop(tenantId: string, id: string) {
    return Promise.resolve((this.sops.get(tenantId) ?? []).find((item) => item.id === id) ?? null);
  }
  generateTasks(
    record: GenerateFilingTasksRecord,
  ): Promise<{ items: readonly FilingTask[]; createdCount: number }> {
    const key = this.key(record.tenantId, record.companyId),
      current = this.tasks.get(key) ?? [];
    let createdCount = 0;
    const next = [...current];
    for (const task of record.tasks) {
      if (!next.some((item) => item.calendarEntryId === task.calendarEntryId)) {
        next.push(task);
        createdCount++;
      }
    }
    this.tasks.set(key, next);
    return Promise.resolve({
      items: next
        .filter((item) => item.calendarId === record.calendar.id)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      createdCount,
    });
  }
  listTasks(tenantId: string, companyId: string) {
    return Promise.resolve(
      (this.tasks.get(this.key(tenantId, companyId)) ?? [])
        .slice()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    );
  }
  findTask(tenantId: string, companyId: string, id: string) {
    return Promise.resolve(
      (this.tasks.get(this.key(tenantId, companyId)) ?? []).find((item) => item.id === id) ?? null,
    );
  }
  transitionTask(record: TransitionFilingTaskRecord): Promise<FilingTask | null> {
    const key = this.key(record.tenantId, record.companyId),
      items = this.tasks.get(key) ?? [],
      index = items.findIndex(
        (item) => item.id === record.taskId && item.version === record.expectedVersion,
      );
    if (index < 0) return Promise.resolve(null);
    const current = items[index]!;
    const changed: FilingTask = {
      ...current,
      status: record.status,
      version: current.version + 1,
      ...(record.status === 'filed' ? { filedAt: record.occurredAt, filedBy: record.actorId } : {}),
      ...(record.status === 'paid' ? { paidAt: record.occurredAt, paidBy: record.actorId } : {}),
      updatedAt: record.occurredAt,
      updatedBy: record.actorId,
    };
    this.tasks.set(
      key,
      items.map((item, i) => (i === index ? changed : item)),
    );
    return Promise.resolve(changed);
  }
  createPackage(record: CreateFilingPackageRecord): Promise<FilingPackage> {
    const key = this.key(record.tenantId, record.package.companyId),
      item: FilingPackage = { ...record.package, packageNumber: ++this.packageNumber };
    this.packages.set(key, [item, ...(this.packages.get(key) ?? [])]);
    return Promise.resolve(item);
  }
  listPackages(tenantId: string, companyId: string) {
    return Promise.resolve(this.packages.get(this.key(tenantId, companyId)) ?? []);
  }
  findPackage(tenantId: string, companyId: string, id: string) {
    return Promise.resolve(
      (this.packages.get(this.key(tenantId, companyId)) ?? []).find((item) => item.id === id) ??
        null,
    );
  }
  freezePackage(record: FreezeFilingPackageRecord): Promise<FilingPackage | null> {
    const key = this.key(record.tenantId, record.companyId),
      items = this.packages.get(key) ?? [],
      index = items.findIndex(
        (item) =>
          item.id === record.packageId &&
          item.version === record.expectedVersion &&
          item.status === 'draft',
      );
    if (index < 0) return Promise.resolve(null);
    const current = items[index]!,
      changed: FilingPackage = {
        ...current,
        status: 'frozen',
        version: current.version + 1,
        blockers: [],
        frozenAt: record.occurredAt,
        frozenBy: record.actorId,
        updatedAt: record.occurredAt,
        updatedBy: record.actorId,
      };
    this.packages.set(
      key,
      items.map((item, i) => (i === index ? changed : item)),
    );
    return Promise.resolve(changed);
  }
  createEvidence(record: CreateFilingEvidenceRecord) {
    const key = this.key(record.tenantId, record.evidence.companyId),
      items = this.evidence.get(key) ?? [];
    this.evidence.set(key, [record.evidence, ...items]);
    return Promise.resolve(record.evidence);
  }
  listEvidence(tenantId: string, companyId: string, packageId: string) {
    return Promise.resolve(
      (this.evidence.get(this.key(tenantId, companyId)) ?? []).filter(
        (item) => item.filingPackageId === packageId,
      ),
    );
  }
  createClosure(record: CreateFilingClosureRecord): Promise<FilingClosure | null> {
    const key = this.key(record.tenantId, record.closure.companyId),
      items = this.closures.get(key) ?? [];
    if (items.some((item) => item.filingPackageId === record.closure.filingPackageId))
      return Promise.resolve(null);
    this.closures.set(key, [record.closure, ...items]);
    return Promise.resolve(record.closure);
  }
  listClosures(tenantId: string, companyId: string) {
    return Promise.resolve(this.closures.get(this.key(tenantId, companyId)) ?? []);
  }
  findClosureByPackage(tenantId: string, companyId: string, packageId: string) {
    return Promise.resolve(
      (this.closures.get(this.key(tenantId, companyId)) ?? []).find(
        (item) => item.filingPackageId === packageId,
      ) ?? null,
    );
  }
  createAdjustment(record:CreateFilingAdjustmentRecord){const key=this.key(record.tenantId,record.workOrder.companyId),items=this.adjustments.get(key)??[];this.adjustments.set(key,[record.workOrder,...items]);return Promise.resolve(record.workOrder);}
  listAdjustments(tenantId:string,companyId:string){return Promise.resolve(this.adjustments.get(this.key(tenantId,companyId))??[]);}
  findAdjustment(tenantId:string,companyId:string,id:string){return Promise.resolve((this.adjustments.get(this.key(tenantId,companyId))??[]).find(item=>item.id===id)??null);}
  transitionAdjustment(record:TransitionFilingAdjustmentRecord):Promise<FilingAdjustmentWorkOrder|null>{const key=this.key(record.tenantId,record.companyId),items=this.adjustments.get(key)??[],index=items.findIndex(item=>item.id===record.workOrderId&&item.version===record.expectedVersion);if(index<0)return Promise.resolve(null);this.adjustments.set(key,items.map((item,i)=>i===index?record.next:item));return Promise.resolve(record.next);}
  private key(tenantId: string, companyId: string) {
    return `${tenantId}:${companyId}`;
  }
}
