import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import {
  auditEvents,
  bankImportRows,
  businessEvents,
  importBatches,
  outboxEvents,
} from '../../../infrastructure/database/schema.js';
import type {
  BankImportBatch,
  BankImportRow,
  BankImportStore,
  ConfirmBankImportRecord,
  SaveBankImportRecord,
} from '../application/bank-import-store.js';

@Injectable()
export class PostgresBankImportStore implements BankImportStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async fingerprintsExist(tenantId: string, companyId: string, fingerprints: readonly string[]): Promise<ReadonlySet<string>> {
    if (fingerprints.length === 0) return new Set();
    const rows = await this.db.select({ fingerprint: businessEvents.sourceFingerprint }).from(businessEvents)
      .where(and(eq(businessEvents.tenantId, tenantId), eq(businessEvents.companyId, companyId), inArray(businessEvents.sourceFingerprint, [...fingerprints])));
    return new Set(rows.flatMap((row) => row.fingerprint ? [row.fingerprint] : []));
  }

  async save(record: SaveBankImportRecord): Promise<BankImportBatch> {
    await this.db.transaction(async (tx) => {
      await tx.insert(importBatches).values({
        id: record.batch.id, tenantId: record.tenantId, companyId: record.batch.companyId,
        importType: 'bank_csv_v1', fileName: record.batch.fileName, fileHash: record.batch.fileHash,
        status: record.batch.status, totalRows: record.batch.totalRows,
        validRows: record.batch.validRows, invalidRows: record.batch.invalidRows,
        duplicateRows: record.batch.duplicateRows, batchErrors: [...record.batch.batchErrors],
        createdAt: record.batch.createdAt,
        createdBy: record.actorId, updatedAt: record.batch.createdAt, updatedBy: record.actorId,
      });
      if (record.batch.rows.length > 0) await tx.insert(bankImportRows).values(record.batch.rows.map((row) => ({
        id: row.id, tenantId: record.tenantId, companyId: record.batch.companyId,
        batchId: record.batch.id, rowNumber: row.rowNumber,
        occurredOn: row.occurredOn ?? null, description: row.description ?? null,
        counterpartyName: row.counterpartyName ?? null, counterpartyId: row.counterpartyId ?? null,
        direction: row.direction ?? null, amount: row.amount ?? null, balance: row.balance ?? null,
        fingerprint: row.fingerprint, status: row.status, errors: [...row.errors],
        createdAt: record.batch.createdAt,
      })));
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.tenantId, actorId: record.actorId,
        action: 'bank_import.validate', resourceType: 'import_batch', resourceId: record.batch.id,
        outcome: 'success', traceId: record.traceId,
        metadata: { validRows: record.batch.validRows, invalidRows: record.batch.invalidRows, duplicateRows: record.batch.duplicateRows },
      });
    });
    return record.batch;
  }

  async find(tenantId: string, companyId: string, batchId: string): Promise<BankImportBatch | null> {
    const [batch] = await this.db.select().from(importBatches)
      .where(and(eq(importBatches.tenantId, tenantId), eq(importBatches.companyId, companyId), eq(importBatches.id, batchId))).limit(1);
    if (!batch) return null;
    const rows = await this.db.select().from(bankImportRows).where(eq(bankImportRows.batchId, batchId));
    return {
      id: batch.id, companyId: batch.companyId, fileName: batch.fileName, fileHash: batch.fileHash,
      status: batch.status as BankImportBatch['status'], totalRows: batch.totalRows,
      validRows: batch.validRows, invalidRows: batch.invalidRows, duplicateRows: batch.duplicateRows,
      rows: rows.sort((a, b) => a.rowNumber - b.rowNumber).map((row) => this.mapRow(row)),
      batchErrors: batch.batchErrors as string[], createdAt: batch.createdAt,
      confirmedAt: batch.confirmedAt ?? undefined,
    };
  }

  async confirm(record: ConfirmBankImportRecord): Promise<BankImportBatch | null> {
    const changed = await this.db.transaction(async (tx) => {
      const [batch] = await tx.update(importBatches).set({
        status: 'confirmed', confirmedAt: record.confirmedAt, confirmedBy: record.actorId,
        updatedAt: record.confirmedAt, updatedBy: record.actorId,
      }).where(and(
        eq(importBatches.tenantId, record.tenantId), eq(importBatches.companyId, record.companyId),
        eq(importBatches.id, record.batchId), eq(importBatches.status, 'validated'),
      )).returning({ id: importBatches.id });
      if (!batch) return false;
      for (const item of record.events) {
        await tx.insert(businessEvents).values({
          id: item.eventId, tenantId: record.tenantId, companyId: record.companyId,
          eventType: item.event.type, occurredOn: item.event.occurredOn,
          amount: item.event.amount.toString(), counterpartyId: item.event.counterpartyId!,
          description: item.event.description, source: 'import', status: item.event.status,
          confirmedAt: item.event.confirmedAt, confirmedBy: record.actorId,
          importRowId: item.rowId, sourceFingerprint: item.fingerprint,
          version: item.event.version, createdAt: record.confirmedAt, createdBy: record.actorId,
          updatedAt: record.confirmedAt, updatedBy: record.actorId,
        });
        await tx.update(bankImportRows).set({ businessEventId: item.eventId })
          .where(and(eq(bankImportRows.batchId, record.batchId), eq(bankImportRows.id, item.rowId)));
      }
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.tenantId, actorId: record.actorId,
        action: 'bank_import.confirm', resourceType: 'import_batch', resourceId: record.batchId,
        outcome: 'success', traceId: record.traceId, metadata: { createdEvents: record.events.length },
      });
      await tx.insert(outboxEvents).values({
        id: randomUUID(), tenantId: record.tenantId, eventType: 'bank_import.confirmed.v1',
        aggregateType: 'import_batch', aggregateId: record.batchId,
        payload: { batchId: record.batchId, companyId: record.companyId, createdEvents: record.events.length },
        occurredAt: record.confirmedAt,
      });
      return true;
    });
    return changed ? this.find(record.tenantId, record.companyId, record.batchId) : null;
  }

  private mapRow(row: typeof bankImportRows.$inferSelect): BankImportRow {
    return {
      id: row.id, rowNumber: row.rowNumber, occurredOn: row.occurredOn ?? undefined,
      description: row.description ?? undefined, counterpartyName: row.counterpartyName ?? undefined,
      counterpartyId: row.counterpartyId ?? undefined,
      direction: row.direction as BankImportRow['direction'], amount: row.amount ?? undefined,
      balance: row.balance ?? undefined, fingerprint: row.fingerprint,
      status: row.status as BankImportRow['status'], errors: row.errors as string[],
      businessEventId: row.businessEventId ?? undefined,
    };
  }
}
