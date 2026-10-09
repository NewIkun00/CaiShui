import { Injectable } from '@nestjs/common';
import type { CalculationStore, SaveCalculationRunRecord, SavedCalculationRun } from '../application/calculation-store.js';

@Injectable()
export class MemoryCalculationStore implements CalculationStore {
  private readonly records = new Map<string, SavedCalculationRun[]>();

  save(record: SaveCalculationRunRecord): Promise<SavedCalculationRun> {
    const key = this.key(record.run.tenantId, record.run.companyId);
    this.records.set(key, [record.run, ...(this.records.get(key) ?? [])]);
    return Promise.resolve(record.run);
  }

  list(tenantId: string, companyId: string): Promise<readonly SavedCalculationRun[]> {
    return Promise.resolve([...(this.records.get(this.key(tenantId, companyId)) ?? [])]);
  }

  find(tenantId: string, companyId: string, id: string): Promise<SavedCalculationRun | null> {
    return Promise.resolve((this.records.get(this.key(tenantId, companyId)) ?? []).find((item) => item.id === id) ?? null);
  }

  private key(tenantId: string, companyId: string): string { return `${tenantId}:${companyId}`; }
}
