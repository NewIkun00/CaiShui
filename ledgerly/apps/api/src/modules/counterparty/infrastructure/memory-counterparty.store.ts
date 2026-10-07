import { Injectable } from '@nestjs/common';
import type { CounterpartyType } from '@ledgerly/domain';
import type { CounterpartyStore, SavedCounterparty, SaveCounterpartyRecord } from '../application/counterparty-store.js';

@Injectable()
export class MemoryCounterpartyStore implements CounterpartyStore {
  private readonly records = new Map<string, SavedCounterparty[]>();

  save(record: SaveCounterpartyRecord): Promise<SavedCounterparty> {
    const saved: SavedCounterparty = Object.freeze({
      id: record.id, companyId: record.companyId, ...record.counterparty,
      version: 1, createdAt: record.createdAt,
    });
    const key = this.key(record.tenantId, record.companyId);
    this.records.set(key, [...(this.records.get(key) ?? []), saved]);
    return Promise.resolve(saved);
  }

  exists(tenantId: string, companyId: string, type: CounterpartyType, normalizedName: string): Promise<boolean> {
    return Promise.resolve((this.records.get(this.key(tenantId, companyId)) ?? [])
      .some((item) => item.type === type && item.normalizedName === normalizedName));
  }

  list(tenantId: string, companyId: string): Promise<readonly SavedCounterparty[]> {
    return Promise.resolve([...(this.records.get(this.key(tenantId, companyId)) ?? [])]);
  }

  findById(tenantId: string, companyId: string, counterpartyId: string): Promise<SavedCounterparty | null> {
    return Promise.resolve((this.records.get(this.key(tenantId, companyId)) ?? [])
      .find((item) => item.id === counterpartyId) ?? null);
  }

  private key(tenantId: string, companyId: string): string { return `${tenantId}:${companyId}`; }
}
