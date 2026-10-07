import { Injectable } from '@nestjs/common';
import type {
  BusinessEventStore,
  ConfirmBusinessEventRecord,
  SavedBusinessEvent,
  SaveBusinessEventRecord,
} from '../application/business-event-store.js';

@Injectable()
export class MemoryBusinessEventStore implements BusinessEventStore {
  private readonly records = new Map<string, SavedBusinessEvent[]>();

  save(record: SaveBusinessEventRecord): Promise<SavedBusinessEvent> {
    const saved: SavedBusinessEvent = Object.freeze({
      id: record.id, companyId: record.companyId, ...record.event,
      createdAt: record.createdAt, createdBy: record.actorId,
    });
    const key = this.key(record.tenantId, record.companyId);
    this.records.set(key, [saved, ...(this.records.get(key) ?? [])]);
    return Promise.resolve(saved);
  }

  list(tenantId: string, companyId: string): Promise<readonly SavedBusinessEvent[]> {
    return Promise.resolve([...(this.records.get(this.key(tenantId, companyId)) ?? [])]);
  }

  find(tenantId: string, companyId: string, eventId: string): Promise<SavedBusinessEvent | null> {
    return Promise.resolve((this.records.get(this.key(tenantId, companyId)) ?? [])
      .find((event) => event.id === eventId) ?? null);
  }

  confirm(record: ConfirmBusinessEventRecord): Promise<SavedBusinessEvent | null> {
    const key = this.key(record.tenantId, record.companyId);
    const current = this.records.get(key) ?? [];
    const index = current.findIndex((item) => item.id === record.event.id && item.version === record.event.version - 1);
    if (index < 0) return Promise.resolve(null);
    const updated = [...current]; updated[index] = Object.freeze(record.event);
    this.records.set(key, updated);
    return Promise.resolve(record.event);
  }

  private key(tenantId: string, companyId: string): string { return `${tenantId}:${companyId}`; }
}
