import type { BusinessEvent } from '@ledgerly/domain';

export interface SavedBusinessEvent extends BusinessEvent {
  readonly id: string;
  readonly companyId: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface SaveBusinessEventRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly actorId: string;
  readonly traceId: string;
  readonly event: BusinessEvent;
  readonly createdAt: Date;
}

export interface ConfirmBusinessEventRecord {
  readonly tenantId: string;
  readonly companyId: string;
  readonly actorId: string;
  readonly traceId: string;
  readonly event: SavedBusinessEvent;
}

export const BUSINESS_EVENT_STORE = Symbol('BUSINESS_EVENT_STORE');

export interface BusinessEventStore {
  save(record: SaveBusinessEventRecord): Promise<SavedBusinessEvent>;
  list(tenantId: string, companyId: string): Promise<readonly SavedBusinessEvent[]>;
  find(tenantId: string, companyId: string, eventId: string): Promise<SavedBusinessEvent | null>;
  confirm(record: ConfirmBusinessEventRecord): Promise<SavedBusinessEvent | null>;
}
