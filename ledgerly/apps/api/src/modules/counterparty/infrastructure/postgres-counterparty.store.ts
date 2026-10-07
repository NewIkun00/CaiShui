import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import { auditEvents, counterparties, outboxEvents } from '../../../infrastructure/database/schema.js';
import { CounterpartyType } from '@ledgerly/domain';
import type { CounterpartyStore, SavedCounterparty, SaveCounterpartyRecord } from '../application/counterparty-store.js';

@Injectable()
export class PostgresCounterpartyStore implements CounterpartyStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(record: SaveCounterpartyRecord): Promise<SavedCounterparty> {
    await this.db.transaction(async (tx) => {
      await tx.insert(counterparties).values({
        id: record.id, tenantId: record.tenantId, companyId: record.companyId,
        name: record.counterparty.name, normalizedName: record.counterparty.normalizedName,
        type: record.counterparty.type, taxId: record.counterparty.taxId ?? null,
        contactName: record.counterparty.contactName ?? null, phone: record.counterparty.phone ?? null,
        notes: record.counterparty.notes ?? null, isRelatedParty: record.counterparty.isRelatedParty,
        createdAt: record.createdAt, createdBy: record.actorId,
        updatedAt: record.createdAt, updatedBy: record.actorId,
      });
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.tenantId, actorId: record.actorId,
        action: 'counterparty.create', resourceType: 'counterparty', resourceId: record.id,
        outcome: 'success', traceId: record.traceId,
        metadata: { type: record.counterparty.type, relatedParty: record.counterparty.isRelatedParty },
      });
      await tx.insert(outboxEvents).values({
        id: randomUUID(), tenantId: record.tenantId, eventType: 'counterparty.created.v1',
        aggregateType: 'counterparty', aggregateId: record.id,
        payload: { counterpartyId: record.id, companyId: record.companyId, type: record.counterparty.type },
        occurredAt: record.createdAt,
      });
    });
    return { id: record.id, companyId: record.companyId, ...record.counterparty, version: 1, createdAt: record.createdAt };
  }

  async exists(tenantId: string, companyId: string, type: CounterpartyType, normalizedName: string): Promise<boolean> {
    const [row] = await this.db.select({ id: counterparties.id }).from(counterparties)
      .where(and(eq(counterparties.tenantId, tenantId), eq(counterparties.companyId, companyId), eq(counterparties.type, type), eq(counterparties.normalizedName, normalizedName)))
      .limit(1);
    return row !== undefined;
  }

  async list(tenantId: string, companyId: string): Promise<readonly SavedCounterparty[]> {
    const rows = await this.db.select().from(counterparties)
      .where(and(eq(counterparties.tenantId, tenantId), eq(counterparties.companyId, companyId)))
      .orderBy(asc(counterparties.type), asc(counterparties.name));
    return rows.map((row) => this.map(row));
  }

  async findById(tenantId: string, companyId: string, counterpartyId: string): Promise<SavedCounterparty | null> {
    const [row] = await this.db.select().from(counterparties)
      .where(and(eq(counterparties.tenantId, tenantId), eq(counterparties.companyId, companyId), eq(counterparties.id, counterpartyId)))
      .limit(1);
    return row ? this.map(row) : null;
  }

  private map(row: typeof counterparties.$inferSelect): SavedCounterparty {
    return {
      id: row.id, companyId: row.companyId, name: row.name, normalizedName: row.normalizedName,
      type: row.type as CounterpartyType, taxId: row.taxId ?? undefined,
      contactName: row.contactName ?? undefined, phone: row.phone ?? undefined,
      notes: row.notes ?? undefined, isRelatedParty: row.isRelatedParty,
      version: row.version, createdAt: row.createdAt,
    };
  }
}
