import type { Counterparty, CounterpartyType } from '@ledgerly/domain';

export interface SavedCounterparty extends Counterparty {
  readonly id: string;
  readonly companyId: string;
  readonly version: number;
  readonly createdAt: Date;
}

export interface SaveCounterpartyRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly actorId: string;
  readonly traceId: string;
  readonly counterparty: Counterparty;
  readonly createdAt: Date;
}

export const COUNTERPARTY_STORE = Symbol('COUNTERPARTY_STORE');

export interface CounterpartyStore {
  save(record: SaveCounterpartyRecord): Promise<SavedCounterparty>;
  exists(tenantId: string, companyId: string, type: CounterpartyType, normalizedName: string): Promise<boolean>;
  list(tenantId: string, companyId: string): Promise<readonly SavedCounterparty[]>;
  findById(tenantId: string, companyId: string, counterpartyId: string): Promise<SavedCounterparty | null>;
}
