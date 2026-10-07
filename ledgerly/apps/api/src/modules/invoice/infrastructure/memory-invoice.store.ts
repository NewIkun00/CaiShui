import { Injectable } from '@nestjs/common';
import type { InvoiceDirection } from '@ledgerly/domain';
import type { ConfirmInvoiceRecord, InvoiceStore, SavedInvoice, SaveInvoiceRecord } from '../application/invoice-store.js';

@Injectable()
export class MemoryInvoiceStore implements InvoiceStore {
  private readonly records = new Map<string, SavedInvoice[]>();

  save(record: SaveInvoiceRecord): Promise<SavedInvoice> {
    const saved = Object.freeze({
      id: record.id, companyId: record.companyId, ...record.invoice,
      createdAt: record.createdAt, createdBy: record.actorId,
    });
    const key = this.key(record.tenantId, record.companyId);
    this.records.set(key, [...(this.records.get(key) ?? []), saved]);
    return Promise.resolve(saved);
  }

  exists(tenantId: string, companyId: string, direction: InvoiceDirection, invoiceNumber: string): Promise<boolean> {
    return Promise.resolve((this.records.get(this.key(tenantId, companyId)) ?? [])
      .some((item) => item.direction === direction && item.invoiceNumber === invoiceNumber));
  }

  list(tenantId: string, companyId: string): Promise<readonly SavedInvoice[]> {
    return Promise.resolve([...(this.records.get(this.key(tenantId, companyId)) ?? [])]
      .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn)));
  }

  find(tenantId: string, companyId: string, invoiceId: string): Promise<SavedInvoice | null> {
    return Promise.resolve((this.records.get(this.key(tenantId, companyId)) ?? [])
      .find((item) => item.id === invoiceId) ?? null);
  }

  confirm(record: ConfirmInvoiceRecord): Promise<SavedInvoice | null> {
    const key = this.key(record.tenantId, record.companyId); const items = this.records.get(key) ?? [];
    const index = items.findIndex((item) => item.id === record.invoice.id && item.version === record.invoice.version - 1);
    if (index < 0) return Promise.resolve(null);
    const next = [...items]; next[index] = Object.freeze({ ...record.invoice }); this.records.set(key, next);
    return Promise.resolve(next[index] ?? null);
  }

  private key(tenantId: string, companyId: string): string { return `${tenantId}:${companyId}`; }
}
