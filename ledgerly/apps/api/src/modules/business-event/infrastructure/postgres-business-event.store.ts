import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BusinessEventStatus, BusinessEventType, Money } from '@ledgerly/domain';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import { auditEvents, businessEvents, outboxEvents } from '../../../infrastructure/database/schema.js';
import type {
  BusinessEventStore,
  ConfirmBusinessEventRecord,
  SavedBusinessEvent,
  SaveBusinessEventRecord,
} from '../application/business-event-store.js';

@Injectable()
export class PostgresBusinessEventStore implements BusinessEventStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(record: SaveBusinessEventRecord): Promise<SavedBusinessEvent> {
    await this.db.transaction(async (tx) => {
      await tx.insert(businessEvents).values({
        id: record.id, tenantId: record.tenantId, companyId: record.companyId,
        eventType: record.event.type, occurredOn: record.event.occurredOn,
        amount: record.event.amount.toString(), counterpartyId: record.event.counterpartyId!,
        description: record.event.description, source: record.event.source,
        status: record.event.status, version: record.event.version,
        createdAt: record.createdAt, createdBy: record.actorId,
        updatedAt: record.createdAt, updatedBy: record.actorId,
      });
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.tenantId, actorId: record.actorId,
        action: 'business_event.create', resourceType: 'business_event', resourceId: record.id,
        outcome: 'success', traceId: record.traceId, metadata: { type: record.event.type },
      });
    });
    return { id: record.id, companyId: record.companyId, ...record.event, createdAt: record.createdAt, createdBy: record.actorId };
  }

  async list(tenantId: string, companyId: string): Promise<readonly SavedBusinessEvent[]> {
    const rows = await this.db.select().from(businessEvents)
      .where(and(eq(businessEvents.tenantId, tenantId), eq(businessEvents.companyId, companyId)))
      .orderBy(desc(businessEvents.occurredOn), desc(businessEvents.createdAt));
    return rows.map((row) => this.map(row));
  }

  async find(tenantId: string, companyId: string, eventId: string): Promise<SavedBusinessEvent | null> {
    const [row] = await this.db.select().from(businessEvents)
      .where(and(eq(businessEvents.tenantId, tenantId), eq(businessEvents.companyId, companyId), eq(businessEvents.id, eventId))).limit(1);
    return row ? this.map(row) : null;
  }

  async confirm(record: ConfirmBusinessEventRecord): Promise<SavedBusinessEvent | null> {
    const previousVersion = record.event.version - 1;
    const [updated] = await this.db.transaction(async (tx) => {
      const rows = await tx.update(businessEvents).set({
        status: record.event.status, version: record.event.version,
        confirmedAt: record.event.confirmedAt, confirmedBy: record.actorId,
        updatedAt: record.event.confirmedAt, updatedBy: record.actorId,
      }).where(and(
        eq(businessEvents.tenantId, record.tenantId), eq(businessEvents.companyId, record.companyId),
        eq(businessEvents.id, record.event.id), eq(businessEvents.status, BusinessEventStatus.Draft),
        eq(businessEvents.version, previousVersion),
      )).returning();
      if (!rows[0]) return [];
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.tenantId, actorId: record.actorId,
        action: 'business_event.confirm', resourceType: 'business_event', resourceId: record.event.id,
        outcome: 'success', traceId: record.traceId, metadata: { version: record.event.version },
      });
      await tx.insert(outboxEvents).values({
        id: randomUUID(), tenantId: record.tenantId, eventType: 'business_event.confirmed.v1',
        aggregateType: 'business_event', aggregateId: record.event.id,
        payload: { businessEventId: record.event.id, companyId: record.companyId, version: record.event.version },
        occurredAt: record.event.confirmedAt!,
      });
      return rows;
    });
    return updated ? this.map(updated) : null;
  }

  private map(row: typeof businessEvents.$inferSelect): SavedBusinessEvent {
    return {
      id: row.id, companyId: row.companyId, type: row.eventType as BusinessEventType,
      occurredOn: row.occurredOn, amount: Money.from(row.amount), counterpartyId: row.counterpartyId,
      description: row.description, source: row.source as SavedBusinessEvent['source'],
      status: row.status as BusinessEventStatus,
      version: row.version, createdAt: row.createdAt, createdBy: row.createdBy,
      confirmedAt: row.confirmedAt ?? undefined, confirmedBy: row.confirmedBy ?? undefined,
    };
  }
}
