import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { InvoiceColor, InvoiceDirection, InvoiceKind, InvoiceStatus, Money } from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import { auditEvents, invoices, outboxEvents } from '../../../infrastructure/database/schema.js';
import type { ConfirmInvoiceRecord, InvoiceStore, SavedInvoice, SaveInvoiceRecord } from '../application/invoice-store.js';

@Injectable()
export class PostgresInvoiceStore implements InvoiceStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(record: SaveInvoiceRecord): Promise<SavedInvoice> {
    await this.db.transaction(async (tx) => {
      await tx.insert(invoices).values({
        id: record.id, tenantId: record.tenantId, companyId: record.companyId,
        direction: record.invoice.direction, kind: record.invoice.kind, color: record.invoice.color,
        invoiceNumber: record.invoice.invoiceNumber, issuedOn: record.invoice.issuedOn,
        counterpartyId: record.invoice.counterpartyId,
        amountExcludingTax: record.invoice.amountExcludingTax.toString(), taxAmount: record.invoice.taxAmount.toString(),
        totalAmount: record.invoice.totalAmount.toString(), remarks: record.invoice.remarks ?? null,
        source: record.invoice.source, status: record.invoice.status,
        createdAt: record.createdAt, createdBy: record.actorId, updatedAt: record.createdAt, updatedBy: record.actorId,
      });
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.tenantId, actorId: record.actorId,
        action: 'invoice.create', resourceType: 'invoice', resourceId: record.id,
        outcome: 'success', traceId: record.traceId,
        metadata: { direction: record.invoice.direction, source: record.invoice.source },
      });
    });
    return { id: record.id, companyId: record.companyId, ...record.invoice, createdAt: record.createdAt, createdBy: record.actorId };
  }

  async exists(tenantId: string, companyId: string, direction: InvoiceDirection, invoiceNumber: string): Promise<boolean> {
    const [row] = await this.db.select({ id: invoices.id }).from(invoices).where(and(
      eq(invoices.tenantId, tenantId), eq(invoices.companyId, companyId),
      eq(invoices.direction, direction), eq(invoices.invoiceNumber, invoiceNumber),
    )).limit(1);
    return row !== undefined;
  }

  async list(tenantId: string, companyId: string): Promise<readonly SavedInvoice[]> {
    const rows = await this.db.select().from(invoices).where(and(
      eq(invoices.tenantId, tenantId), eq(invoices.companyId, companyId),
    )).orderBy(desc(invoices.issuedOn), desc(invoices.createdAt));
    return rows.map((row) => this.map(row));
  }

  async find(tenantId: string, companyId: string, invoiceId: string): Promise<SavedInvoice | null> {
    const [row] = await this.db.select().from(invoices).where(and(
      eq(invoices.tenantId, tenantId), eq(invoices.companyId, companyId), eq(invoices.id, invoiceId),
    )).limit(1);
    return row ? this.map(row) : null;
  }

  async confirm(record: ConfirmInvoiceRecord): Promise<SavedInvoice | null> {
    const previousVersion = record.invoice.version - 1;
    const [updated] = await this.db.transaction(async (tx) => {
      const rows = await tx.update(invoices).set({
        status: record.invoice.status, version: record.invoice.version,
        confirmedAt: record.invoice.confirmedAt, confirmedBy: record.actorId,
        updatedAt: record.invoice.confirmedAt, updatedBy: record.actorId,
      }).where(and(
        eq(invoices.tenantId, record.tenantId), eq(invoices.companyId, record.companyId),
        eq(invoices.id, record.invoice.id), eq(invoices.status, InvoiceStatus.Draft),
        eq(invoices.version, previousVersion),
      )).returning();
      if (!rows[0]) return [];
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.tenantId, actorId: record.actorId,
        action: 'invoice.confirm', resourceType: 'invoice', resourceId: record.invoice.id,
        outcome: 'success', traceId: record.traceId, metadata: { version: record.invoice.version },
      });
      await tx.insert(outboxEvents).values({
        id: randomUUID(), tenantId: record.tenantId, eventType: 'invoice.confirmed.v1',
        aggregateType: 'invoice', aggregateId: record.invoice.id,
        payload: { invoiceId: record.invoice.id, companyId: record.companyId, version: record.invoice.version },
        occurredAt: record.invoice.confirmedAt!,
      });
      return rows;
    });
    return updated ? this.map(updated) : null;
  }

  private map(row: typeof invoices.$inferSelect): SavedInvoice {
    return {
      id: row.id, companyId: row.companyId, direction: row.direction as InvoiceDirection,
      kind: row.kind as InvoiceKind, color: row.color as InvoiceColor,
      invoiceNumber: row.invoiceNumber, issuedOn: row.issuedOn, counterpartyId: row.counterpartyId,
      amountExcludingTax: Money.from(row.amountExcludingTax), taxAmount: Money.from(row.taxAmount),
      totalAmount: Money.from(row.totalAmount), remarks: row.remarks ?? undefined,
      source: row.source as SavedInvoice['source'], status: row.status as InvoiceStatus,
      version: row.version, createdAt: row.createdAt, createdBy: row.createdBy,
      confirmedAt: row.confirmedAt ?? undefined, confirmedBy: row.confirmedBy ?? undefined,
    };
  }
}
