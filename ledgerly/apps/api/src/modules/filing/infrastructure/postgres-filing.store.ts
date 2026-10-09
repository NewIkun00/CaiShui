import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, or } from 'drizzle-orm';
import type {
  FilingCalendarSource,
  FilingPackageBlockerCode,
  FilingPackageStatus,
} from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import {
  auditEvents,
  filingAdjustmentWorkOrders,
  filingAdjustmentWorkOrderVersions,
  filingCalendarEntries,
  filingCalendars,
  filingClosures,
  filingEvidence,
  filingPackageEvents,
  filingPackages,
  filingSops,
  filingTaskEvents,
  filingTasks,
  outboxEvents,
} from '../../../infrastructure/database/schema.js';
import type {
  CreateFilingAdjustmentRecord,
  CreateFilingCalendarRecord,
  CreateFilingClosureRecord,
  CreateFilingEvidenceRecord,
  CreateFilingPackageRecord,
  CreateFilingSopRecord,
  FilingCalendar,
  FilingAdjustmentEvidence,
  FilingAdjustmentWorkOrder,
  FilingCalendarEntry,
  FilingClosure,
  FilingEvidence,
  FilingPackage,
  FilingPackageSnapshot,
  FilingSop,
  FilingSopStep,
  FilingStore,
  FilingTask,
  FreezeFilingPackageRecord,
  GenerateFilingTasksRecord,
  TransitionFilingTaskRecord,
  TransitionFilingAdjustmentRecord,
} from '../application/filing-store.js';

@Injectable()
export class PostgresFilingStore implements FilingStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async createCalendar(
    record: CreateFilingCalendarRecord,
  ): Promise<{ calendar: FilingCalendar; created: boolean }> {
    const inserted = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(filingCalendars)
        .values({
          id: record.calendar.id,
          tenantId: record.tenantId,
          name: record.calendar.name,
          versionTag: record.calendar.versionTag,
          jurisdictionCode: record.calendar.jurisdictionCode,
          year: record.calendar.year,
          sourceType: record.calendar.source.type,
          source: record.calendar.source,
          contentHash: record.calendar.contentHash,
          createdAt: record.calendar.createdAt,
          createdBy: record.calendar.createdBy,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) return null;
      await tx
        .insert(filingCalendarEntries)
        .values(
          record.calendar.entries.map((entry) => ({ ...entry, calendarId: record.calendar.id })),
        );
      await this.sideEffects(
        tx,
        record.tenantId,
        'filing_calendar',
        record.calendar.id,
        'filing_calendar.created',
        record.calendar.createdBy,
        record.traceId,
        record.calendar.createdAt,
        { versionTag: record.calendar.versionTag, sourceType: record.calendar.source.type },
      );
      return row;
    });
    if (inserted) return { calendar: record.calendar, created: true };
    const [existing] = await this.db
      .select()
      .from(filingCalendars)
      .where(
        and(
          eq(filingCalendars.tenantId, record.tenantId),
          or(
            and(
              eq(filingCalendars.jurisdictionCode, record.calendar.jurisdictionCode),
              eq(filingCalendars.year, record.calendar.year),
              eq(filingCalendars.versionTag, record.calendar.versionTag),
            ),
            eq(filingCalendars.contentHash, record.calendar.contentHash),
          ),
        ),
      )
      .limit(1);
    if (!existing) throw new Error('Filing calendar conflict');
    return { calendar: await this.hydrateCalendar(existing), created: false };
  }
  async listCalendars(tenantId: string) {
    const rows = await this.db
      .select()
      .from(filingCalendars)
      .where(eq(filingCalendars.tenantId, tenantId))
      .orderBy(asc(filingCalendars.year), asc(filingCalendars.versionTag));
    return Promise.all(rows.map((row) => this.hydrateCalendar(row)));
  }
  async findCalendar(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(filingCalendars)
      .where(and(eq(filingCalendars.tenantId, tenantId), eq(filingCalendars.id, id)))
      .limit(1);
    return row ? this.hydrateCalendar(row) : null;
  }
  async createSop(record: CreateFilingSopRecord): Promise<{ sop: FilingSop; created: boolean }> {
    const [row] = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(filingSops)
        .values({
          id: record.sop.id,
          tenantId: record.tenantId,
          name: record.sop.name,
          versionTag: record.sop.versionTag,
          jurisdictionCode: record.sop.jurisdictionCode,
          sourceType: record.sop.source.type,
          source: record.sop.source,
          steps: record.sop.steps,
          contentHash: record.sop.contentHash,
          createdAt: record.sop.createdAt,
          createdBy: record.sop.createdBy,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0])
        await this.sideEffects(
          tx,
          record.tenantId,
          'filing_sop',
          record.sop.id,
          'filing_sop.created',
          record.sop.createdBy,
          record.traceId,
          record.sop.createdAt,
          { versionTag: record.sop.versionTag, sourceType: record.sop.source.type },
        );
      return inserted;
    });
    if (row) return { sop: record.sop, created: true };
    const [existing] = await this.db
      .select()
      .from(filingSops)
      .where(
        and(
          eq(filingSops.tenantId, record.tenantId),
          or(
            and(
              eq(filingSops.jurisdictionCode, record.sop.jurisdictionCode),
              eq(filingSops.versionTag, record.sop.versionTag),
            ),
            eq(filingSops.contentHash, record.sop.contentHash),
          ),
        ),
      )
      .limit(1);
    if (!existing) throw new Error('Filing SOP conflict');
    return { sop: this.presentSop(existing), created: false };
  }
  async listSops(tenantId: string) {
    const rows = await this.db
      .select()
      .from(filingSops)
      .where(eq(filingSops.tenantId, tenantId))
      .orderBy(asc(filingSops.jurisdictionCode), asc(filingSops.versionTag));
    return rows.map((row) => this.presentSop(row));
  }
  async findSop(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(filingSops)
      .where(and(eq(filingSops.tenantId, tenantId), eq(filingSops.id, id)))
      .limit(1);
    return row ? this.presentSop(row) : null;
  }
  async generateTasks(
    record: GenerateFilingTasksRecord,
  ): Promise<{ items: readonly FilingTask[]; createdCount: number }> {
    const created = await this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(filingTasks)
        .values(
          record.tasks.map((task) => ({
            id: task.id,
            tenantId: record.tenantId,
            companyId: record.companyId,
            calendarId: task.calendarId,
            calendarEntryId: task.calendarEntryId,
            status: task.status,
            version: task.version,
            createdAt: task.createdAt,
            createdBy: task.createdBy,
            updatedAt: task.updatedAt,
            updatedBy: task.updatedBy,
          })),
        )
        .onConflictDoNothing()
        .returning();
      for (const task of rows) {
        await tx
          .insert(filingTaskEvents)
          .values({
            id: randomUUID(),
            filingTaskId: task.id,
            eventType: 'generated',
            fromStatus: 'todo',
            toStatus: 'todo',
            note: `Generated from calendar ${record.calendar.versionTag}`,
            taskVersion: 1,
            actedBy: record.actorId,
            actedAt: record.occurredAt,
          });
        await this.sideEffects(
          tx,
          record.tenantId,
          'filing_task',
          task.id,
          'filing_task.generated',
          record.actorId,
          record.traceId,
          record.occurredAt,
          {
            companyId: record.companyId,
            calendarId: record.calendar.id,
            calendarEntryId: task.calendarEntryId,
          },
        );
      }
      return rows.length;
    });
    return {
      items: (await this.listTasks(record.tenantId, record.companyId)).filter(
        (item) => item.calendarId === record.calendar.id,
      ),
      createdCount: created,
    };
  }
  async listTasks(tenantId: string, companyId: string): Promise<readonly FilingTask[]> {
    const rows = await this.db
      .select({ task: filingTasks, calendar: filingCalendars, entry: filingCalendarEntries })
      .from(filingTasks)
      .innerJoin(filingCalendars, eq(filingTasks.calendarId, filingCalendars.id))
      .innerJoin(filingCalendarEntries, eq(filingTasks.calendarEntryId, filingCalendarEntries.id))
      .where(and(eq(filingTasks.tenantId, tenantId), eq(filingTasks.companyId, companyId)))
      .orderBy(asc(filingCalendarEntries.dueDate));
    return rows.map((row) => this.presentTask(row.task, row.calendar, row.entry));
  }
  async findTask(tenantId: string, companyId: string, id: string): Promise<FilingTask | null> {
    const [row] = await this.db
      .select({ task: filingTasks, calendar: filingCalendars, entry: filingCalendarEntries })
      .from(filingTasks)
      .innerJoin(filingCalendars, eq(filingTasks.calendarId, filingCalendars.id))
      .innerJoin(filingCalendarEntries, eq(filingTasks.calendarEntryId, filingCalendarEntries.id))
      .where(
        and(
          eq(filingTasks.tenantId, tenantId),
          eq(filingTasks.companyId, companyId),
          eq(filingTasks.id, id),
        ),
      )
      .limit(1);
    return row ? this.presentTask(row.task, row.calendar, row.entry) : null;
  }
  async transitionTask(record: TransitionFilingTaskRecord): Promise<FilingTask | null> {
    const updated = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(filingTasks)
        .where(
          and(
            eq(filingTasks.id, record.taskId),
            eq(filingTasks.tenantId, record.tenantId),
            eq(filingTasks.companyId, record.companyId),
            eq(filingTasks.version, record.expectedVersion),
          ),
        )
        .limit(1);
      if (!current) return null;
      const [row] = await tx
        .update(filingTasks)
        .set({
          status: record.status,
          version: record.expectedVersion + 1,
          ...(record.status === 'filed'
            ? { filedAt: record.occurredAt, filedBy: record.actorId }
            : {}),
          ...(record.status === 'paid'
            ? { paidAt: record.occurredAt, paidBy: record.actorId }
            : {}),
          updatedAt: record.occurredAt,
          updatedBy: record.actorId,
        })
        .where(
          and(eq(filingTasks.id, record.taskId), eq(filingTasks.version, record.expectedVersion)),
        )
        .returning();
      if (!row) return null;
      await tx
        .insert(filingTaskEvents)
        .values({
          id: randomUUID(),
          filingTaskId: record.taskId,
          eventType: record.action,
          fromStatus: current.status,
          toStatus: record.status,
          note: record.note,
          taskVersion: record.expectedVersion + 1,
          actedBy: record.actorId,
          actedAt: record.occurredAt,
        });
      await this.sideEffects(
        tx,
        record.tenantId,
        'filing_task',
        record.taskId,
        `filing_task.${record.action}`,
        record.actorId,
        record.traceId,
        record.occurredAt,
        {
          companyId: record.companyId,
          fromStatus: current.status,
          toStatus: record.status,
          version: record.expectedVersion + 1,
        },
      );
      return row;
    });
    return updated ? this.findTask(record.tenantId, record.companyId, record.taskId) : null;
  }
  async createPackage(record: CreateFilingPackageRecord): Promise<FilingPackage> {
    const [row] = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(filingPackages)
        .values({
          id: record.package.id,
          tenantId: record.tenantId,
          companyId: record.package.companyId,
          status: record.package.status,
          correctionOfPackageId: record.package.correctionOfPackageId ?? null,
          snapshot: record.package.snapshot,
          contentHash: record.package.contentHash,
          blockers: record.package.blockers,
          version: record.package.version,
          createdAt: record.package.createdAt,
          createdBy: record.package.createdBy,
          updatedAt: record.package.updatedAt,
          updatedBy: record.package.updatedBy,
        })
        .returning();
      const item = inserted[0]!;
      await tx
        .insert(filingPackageEvents)
        .values({
          id: randomUUID(),
          filingPackageId: item.id,
          eventType: 'created',
          fromStatus: 'draft',
          toStatus: 'draft',
          note: 'Filing package draft created',
          packageVersion: 1,
          actedBy: record.package.createdBy,
          actedAt: record.package.createdAt,
        });
      await this.sideEffects(
        tx,
        record.tenantId,
        'filing_package',
        item.id,
        'filing_package.created',
        record.package.createdBy,
        record.traceId,
        record.package.createdAt,
        {
          companyId: record.package.companyId,
          packageNumber: item.packageNumber,
          contentHash: record.package.contentHash,
          blockers: record.package.blockers,
        },
      );
      return inserted;
    });
    return this.presentPackage(row!);
  }
  async listPackages(tenantId: string, companyId: string) {
    const rows = await this.db
      .select()
      .from(filingPackages)
      .where(and(eq(filingPackages.tenantId, tenantId), eq(filingPackages.companyId, companyId)))
      .orderBy(desc(filingPackages.packageNumber));
    return rows.map((row) => this.presentPackage(row));
  }
  async findPackage(tenantId: string, companyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(filingPackages)
      .where(
        and(
          eq(filingPackages.tenantId, tenantId),
          eq(filingPackages.companyId, companyId),
          eq(filingPackages.id, id),
        ),
      )
      .limit(1);
    return row ? this.presentPackage(row) : null;
  }
  async freezePackage(record: FreezeFilingPackageRecord): Promise<FilingPackage | null> {
    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(filingPackages)
        .set({
          status: 'frozen',
          blockers: [],
          frozenAt: record.occurredAt,
          frozenBy: record.actorId,
          version: record.expectedVersion + 1,
          updatedAt: record.occurredAt,
          updatedBy: record.actorId,
        })
        .where(
          and(
            eq(filingPackages.id, record.packageId),
            eq(filingPackages.tenantId, record.tenantId),
            eq(filingPackages.companyId, record.companyId),
            eq(filingPackages.status, 'draft'),
            eq(filingPackages.version, record.expectedVersion),
          ),
        )
        .returning();
      if (!updated) return null;
      await tx
        .insert(filingPackageEvents)
        .values({
          id: randomUUID(),
          filingPackageId: record.packageId,
          eventType: 'frozen',
          fromStatus: 'draft',
          toStatus: 'frozen',
          note: record.note,
          packageVersion: record.expectedVersion + 1,
          actedBy: record.actorId,
          actedAt: record.occurredAt,
        });
      await this.sideEffects(
        tx,
        record.tenantId,
        'filing_package',
        record.packageId,
        'filing_package.frozen',
        record.actorId,
        record.traceId,
        record.occurredAt,
        {
          companyId: record.companyId,
          packageNumber: updated.packageNumber,
          contentHash: updated.contentHash,
          version: record.expectedVersion + 1,
        },
      );
      return updated;
    });
    return row ? this.presentPackage(row) : null;
  }
  async createEvidence(record: CreateFilingEvidenceRecord): Promise<FilingEvidence> {
    const [row] = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(filingEvidence)
        .values({
          id: record.evidence.id,
          tenantId: record.tenantId,
          companyId: record.evidence.companyId,
          filingTaskId: record.evidence.filingTaskId,
          filingPackageId: record.evidence.filingPackageId,
          kind: record.evidence.kind,
          documentId: record.evidence.documentId,
          documentVersion: record.evidence.documentVersion,
          documentHash: record.evidence.documentHash,
          externalReference: record.evidence.externalReference,
          occurredAt: record.evidence.occurredAt,
          reportedResultHash: record.evidence.reportedResultHash ?? null,
          contentHash: record.evidence.contentHash,
          note: record.evidence.note,
          createdAt: record.evidence.createdAt,
          createdBy: record.evidence.createdBy,
        })
        .onConflictDoNothing()
        .returning();
      const item = inserted[0];
      if (item)
        await this.sideEffects(
          tx,
          record.tenantId,
          'filing_evidence',
          item.id,
          'filing_evidence.archived',
          record.evidence.createdBy,
          record.traceId,
          record.evidence.createdAt,
          {
            companyId: record.evidence.companyId,
            filingPackageId: record.evidence.filingPackageId,
            kind: record.evidence.kind,
            contentHash: record.evidence.contentHash,
          },
        );
      return inserted;
    });
    if (row) return this.presentEvidence(row);
    const [existing] = await this.db
      .select()
      .from(filingEvidence)
      .where(
        and(
          eq(filingEvidence.tenantId, record.tenantId),
          eq(filingEvidence.companyId, record.evidence.companyId),
          eq(filingEvidence.contentHash, record.evidence.contentHash),
        ),
      )
      .limit(1);
    if (!existing) throw new Error('Filing evidence conflict');
    return this.presentEvidence(existing);
  }
  async listEvidence(tenantId: string, companyId: string, packageId: string) {
    const rows = await this.db
      .select()
      .from(filingEvidence)
      .where(
        and(
          eq(filingEvidence.tenantId, tenantId),
          eq(filingEvidence.companyId, companyId),
          eq(filingEvidence.filingPackageId, packageId),
        ),
      )
      .orderBy(asc(filingEvidence.createdAt));
    return rows.map((row) => this.presentEvidence(row));
  }
  async createClosure(record: CreateFilingClosureRecord): Promise<FilingClosure | null> {
    const [row] = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(filingClosures)
        .values({
          id: record.closure.id,
          tenantId: record.tenantId,
          companyId: record.closure.companyId,
          filingTaskId: record.closure.filingTaskId,
          filingPackageId: record.closure.filingPackageId,
          packageContentHash: record.closure.packageContentHash,
          resultHash: record.closure.resultHash,
          evidenceIds: record.closure.evidenceIds,
          contentHash: record.closure.contentHash,
          note: record.closure.note,
          closedAt: record.closure.closedAt,
          closedBy: record.closure.closedBy,
        })
        .onConflictDoNothing()
        .returning();
      const item = inserted[0];
      if (item)
        await this.sideEffects(
          tx,
          record.tenantId,
          'filing_closure',
          item.id,
          'filing_closure.created',
          record.closure.closedBy,
          record.traceId,
          record.closure.closedAt,
          {
            companyId: record.closure.companyId,
            filingTaskId: record.closure.filingTaskId,
            filingPackageId: record.closure.filingPackageId,
            contentHash: record.closure.contentHash,
          },
        );
      return inserted;
    });
    return row ? this.presentClosure(row) : null;
  }
  async listClosures(tenantId: string, companyId: string) {
    const rows = await this.db
      .select()
      .from(filingClosures)
      .where(and(eq(filingClosures.tenantId, tenantId), eq(filingClosures.companyId, companyId)))
      .orderBy(desc(filingClosures.closedAt));
    return rows.map((row) => this.presentClosure(row));
  }
  async findClosureByPackage(tenantId: string, companyId: string, packageId: string) {
    const [row] = await this.db
      .select()
      .from(filingClosures)
      .where(
        and(
          eq(filingClosures.tenantId, tenantId),
          eq(filingClosures.companyId, companyId),
          eq(filingClosures.filingPackageId, packageId),
        ),
      )
      .limit(1);
    return row ? this.presentClosure(row) : null;
  }
  async createAdjustment(record:CreateFilingAdjustmentRecord):Promise<FilingAdjustmentWorkOrder>{
    await this.db.transaction(async tx=>{
      await tx.insert(filingAdjustmentWorkOrders).values({id:record.workOrder.id,tenantId:record.tenantId,companyId:record.workOrder.companyId,filingTaskId:record.workOrder.filingTaskId,sourcePackageId:record.workOrder.sourcePackageId,type:record.workOrder.type,reason:record.workOrder.reason,evidence:record.workOrder.evidence,openedAt:record.workOrder.openedAt,openedBy:record.workOrder.openedBy});
      await tx.insert(filingAdjustmentWorkOrderVersions).values({id:randomUUID(),workOrderId:record.workOrder.id,version:1,status:'open',reviewedBy:null,resolutionPackageId:null,resolutionEvidence:[],resolutionNote:null,updatedAt:record.workOrder.updatedAt,updatedBy:record.workOrder.updatedBy,action:'created',note:record.workOrder.reason});
      await this.sideEffects(tx,record.tenantId,'filing_adjustment',record.workOrder.id,'filing_adjustment.created',record.workOrder.openedBy,record.traceId,record.workOrder.openedAt,{companyId:record.workOrder.companyId,sourcePackageId:record.workOrder.sourcePackageId,type:record.workOrder.type});
    });
    return record.workOrder;
  }
  async listAdjustments(tenantId:string,companyId:string){
    const roots=await this.db.select().from(filingAdjustmentWorkOrders).where(and(eq(filingAdjustmentWorkOrders.tenantId,tenantId),eq(filingAdjustmentWorkOrders.companyId,companyId))).orderBy(desc(filingAdjustmentWorkOrders.openedAt));
    return Promise.all(roots.map(root=>this.hydrateAdjustment(root)));
  }
  async findAdjustment(tenantId:string,companyId:string,id:string){
    const[root]=await this.db.select().from(filingAdjustmentWorkOrders).where(and(eq(filingAdjustmentWorkOrders.tenantId,tenantId),eq(filingAdjustmentWorkOrders.companyId,companyId),eq(filingAdjustmentWorkOrders.id,id))).limit(1);
    return root?this.hydrateAdjustment(root):null;
  }
  async transitionAdjustment(record:TransitionFilingAdjustmentRecord):Promise<FilingAdjustmentWorkOrder|null>{
    const inserted=await this.db.transaction(async tx=>{
      const[root]=await tx.select().from(filingAdjustmentWorkOrders).where(and(eq(filingAdjustmentWorkOrders.id,record.workOrderId),eq(filingAdjustmentWorkOrders.tenantId,record.tenantId),eq(filingAdjustmentWorkOrders.companyId,record.companyId))).limit(1);if(!root)return false;
      const[current]=await tx.select().from(filingAdjustmentWorkOrderVersions).where(eq(filingAdjustmentWorkOrderVersions.workOrderId,record.workOrderId)).orderBy(desc(filingAdjustmentWorkOrderVersions.version)).limit(1);if(!current||current.version!==record.expectedVersion)return false;
      const rows=await tx.insert(filingAdjustmentWorkOrderVersions).values({id:randomUUID(),workOrderId:record.workOrderId,version:record.next.version,status:record.next.status,reviewedBy:record.next.reviewedBy??null,resolutionPackageId:record.next.resolutionPackageId??null,resolutionEvidence:record.next.resolutionEvidence,resolutionNote:record.next.resolutionNote??null,updatedAt:record.next.updatedAt,updatedBy:record.next.updatedBy,action:record.action,note:record.note}).onConflictDoNothing().returning();if(!rows[0])return false;
      await this.sideEffects(tx,record.tenantId,'filing_adjustment',record.workOrderId,`filing_adjustment.${record.action}`,record.next.updatedBy,record.traceId,record.next.updatedAt,{companyId:record.companyId,status:record.next.status,version:record.next.version});return true;
    });
    return inserted?record.next:null;
  }
  private async hydrateCalendar(row: typeof filingCalendars.$inferSelect): Promise<FilingCalendar> {
    const entries = await this.db
      .select()
      .from(filingCalendarEntries)
      .where(eq(filingCalendarEntries.calendarId, row.id))
      .orderBy(asc(filingCalendarEntries.dueDate));
    return {
      id: row.id,
      name: row.name,
      versionTag: row.versionTag,
      jurisdictionCode: row.jurisdictionCode,
      year: row.year,
      source: row.source as FilingCalendarSource,
      contentHash: row.contentHash,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      entries: entries.map((entry) => this.presentEntry(entry)),
    };
  }
  private presentSop(row: typeof filingSops.$inferSelect): FilingSop {
    return {
      id: row.id,
      name: row.name,
      versionTag: row.versionTag,
      jurisdictionCode: row.jurisdictionCode,
      source: row.source as FilingCalendarSource,
      steps: row.steps as FilingSopStep[],
      contentHash: row.contentHash,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    };
  }
  private presentEntry(row: typeof filingCalendarEntries.$inferSelect): FilingCalendarEntry {
    return {
      id: row.id,
      taxType: row.taxType as FilingCalendarEntry['taxType'],
      label: row.label,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      dueDate: row.dueDate,
    };
  }
  private presentTask(
    task: typeof filingTasks.$inferSelect,
    calendar: typeof filingCalendars.$inferSelect,
    entry: typeof filingCalendarEntries.$inferSelect,
  ): FilingTask {
    return {
      id: task.id,
      companyId: task.companyId,
      calendarId: task.calendarId,
      calendarEntryId: task.calendarEntryId,
      calendarName: calendar.name,
      calendarSourceType: calendar.sourceType as FilingTask['calendarSourceType'],
      taxType: entry.taxType as FilingTask['taxType'],
      label: entry.label,
      periodStart: entry.periodStart,
      periodEnd: entry.periodEnd,
      dueDate: entry.dueDate,
      status: task.status as FilingTask['status'],
      version: task.version,
      ...(task.filedAt ? { filedAt: task.filedAt } : {}),
      ...(task.filedBy ? { filedBy: task.filedBy } : {}),
      ...(task.paidAt ? { paidAt: task.paidAt } : {}),
      ...(task.paidBy ? { paidBy: task.paidBy } : {}),
      createdAt: task.createdAt,
      createdBy: task.createdBy,
      updatedAt: task.updatedAt,
      updatedBy: task.updatedBy,
    };
  }
  private presentPackage(row: typeof filingPackages.$inferSelect): FilingPackage {
    return {
      id: row.id,
      companyId: row.companyId,
      packageNumber: row.packageNumber,
      status: row.status as FilingPackageStatus,
      version: row.version,
      ...(row.correctionOfPackageId ? { correctionOfPackageId: row.correctionOfPackageId } : {}),
      snapshot: row.snapshot as FilingPackageSnapshot,
      contentHash: row.contentHash,
      blockers: row.blockers as FilingPackageBlockerCode[],
      ...(row.frozenAt ? { frozenAt: row.frozenAt } : {}),
      ...(row.frozenBy ? { frozenBy: row.frozenBy } : {}),
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    };
  }
  private presentEvidence(row: typeof filingEvidence.$inferSelect): FilingEvidence {
    return {
      id: row.id,
      companyId: row.companyId,
      filingTaskId: row.filingTaskId,
      filingPackageId: row.filingPackageId,
      kind: row.kind as FilingEvidence['kind'],
      documentId: row.documentId,
      documentVersion: row.documentVersion,
      documentHash: row.documentHash,
      externalReference: row.externalReference,
      occurredAt: row.occurredAt,
      ...(row.reportedResultHash ? { reportedResultHash: row.reportedResultHash } : {}),
      contentHash: row.contentHash,
      note: row.note,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    };
  }
  private presentClosure(row: typeof filingClosures.$inferSelect): FilingClosure {
    return {
      id: row.id,
      companyId: row.companyId,
      filingTaskId: row.filingTaskId,
      filingPackageId: row.filingPackageId,
      packageContentHash: row.packageContentHash,
      resultHash: row.resultHash,
      evidenceIds: row.evidenceIds as string[],
      contentHash: row.contentHash,
      note: row.note,
      closedAt: row.closedAt,
      closedBy: row.closedBy,
    };
  }
  private async hydrateAdjustment(root:typeof filingAdjustmentWorkOrders.$inferSelect):Promise<FilingAdjustmentWorkOrder>{
    const[version]=await this.db.select().from(filingAdjustmentWorkOrderVersions).where(eq(filingAdjustmentWorkOrderVersions.workOrderId,root.id)).orderBy(desc(filingAdjustmentWorkOrderVersions.version)).limit(1);
    if(!version)throw new Error('Filing adjustment version missing');
    return{id:root.id,companyId:root.companyId,filingTaskId:root.filingTaskId,sourcePackageId:root.sourcePackageId,type:root.type as FilingAdjustmentWorkOrder['type'],status:version.status as FilingAdjustmentWorkOrder['status'],version:version.version,reason:root.reason,evidence:root.evidence as FilingAdjustmentEvidence[],...(version.reviewedBy?{reviewedBy:version.reviewedBy}:{}),...(version.resolutionPackageId?{resolutionPackageId:version.resolutionPackageId}:{}),resolutionEvidence:version.resolutionEvidence as FilingAdjustmentEvidence[],...(version.resolutionNote?{resolutionNote:version.resolutionNote}:{}),openedAt:root.openedAt,openedBy:root.openedBy,updatedAt:version.updatedAt,updatedBy:version.updatedBy};
  }
  private async sideEffects(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    tenantId: string,
    resourceType: string,
    resourceId: string,
    action: string,
    actorId: string,
    traceId: string,
    occurredAt: Date,
    metadata: Record<string, unknown>,
  ) {
    await tx
      .insert(auditEvents)
      .values({
        id: randomUUID(),
        tenantId,
        actorId,
        action,
        resourceType,
        resourceId,
        outcome: 'success',
        traceId,
        metadata,
      });
    await tx
      .insert(outboxEvents)
      .values({
        id: randomUUID(),
        tenantId,
        eventType: `${action}.v1`,
        aggregateType: resourceType,
        aggregateId: resourceId,
        payload: { resourceId, ...metadata },
        occurredAt,
      });
  }
}
