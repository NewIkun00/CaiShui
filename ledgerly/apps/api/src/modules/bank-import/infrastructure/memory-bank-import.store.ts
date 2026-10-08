import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_EVENT_STORE, type BusinessEventStore } from '../../business-event/application/business-event-store.js';
import type {
  BankImportBatch,
  BankImportStore,
  ConfirmBankImportRecord,
  SaveBankImportRecord,
} from '../application/bank-import-store.js';

@Injectable()
export class MemoryBankImportStore implements BankImportStore {
  private readonly batches = new Map<string, BankImportBatch>();
  private readonly fingerprints = new Set<string>();

  constructor(@Inject(BUSINESS_EVENT_STORE) private readonly events: BusinessEventStore) {}

  fingerprintsExist(tenantId: string, companyId: string, fingerprints: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(fingerprints.filter((fingerprint) =>
      this.fingerprints.has(this.fingerprintKey(tenantId, companyId, fingerprint)))));
  }

  save(record: SaveBankImportRecord): Promise<BankImportBatch> {
    this.batches.set(this.key(record.tenantId, record.batch.companyId, record.batch.id), record.batch);
    return Promise.resolve(record.batch);
  }

  find(tenantId: string, companyId: string, batchId: string): Promise<BankImportBatch | null> {
    return Promise.resolve(this.batches.get(this.key(tenantId, companyId, batchId)) ?? null);
  }

  latestConfirmedStatement(tenantId:string,companyId:string,accountId:string,periodStart:string,periodEnd:string):Promise<BankImportBatch|null>{
    const matches=[...this.batches.entries()].filter(([key,batch])=>key.startsWith(`${tenantId}:${companyId}:`)&&batch.accountId===accountId&&batch.statementPeriodStart===periodStart&&batch.statementPeriodEnd===periodEnd&&batch.status==='confirmed').map(([,batch])=>batch).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime());
    return Promise.resolve(matches[0]??null);
  }

  async confirm(record: ConfirmBankImportRecord): Promise<BankImportBatch | null> {
    const key = this.key(record.tenantId, record.companyId, record.batchId);
    const batch = this.batches.get(key);
    if (!batch || batch.status !== 'validated') return null;
    const eventByRow = new Map(record.events.map((item) => [item.rowId, item]));
    for (const item of record.events) {
      await this.events.save({
        id: item.eventId, tenantId: record.tenantId, companyId: record.companyId,
        actorId: record.actorId, traceId: record.traceId, event: item.event,
        createdAt: record.confirmedAt,
      });
      this.fingerprints.add(this.fingerprintKey(record.tenantId, record.companyId, item.fingerprint));
    }
    const confirmed: BankImportBatch = Object.freeze({
      ...batch, status: 'confirmed', confirmedAt: record.confirmedAt,
      rows: batch.rows.map((row) => {
        const item = eventByRow.get(row.id);
        return item ? { ...row, businessEventId: item.eventId } : row;
      }),
    });
    this.batches.set(key, confirmed);
    return confirmed;
  }

  private key(tenantId: string, companyId: string, batchId: string): string {
    return `${tenantId}:${companyId}:${batchId}`;
  }

  private fingerprintKey(tenantId: string, companyId: string, fingerprint: string): string {
    return `${tenantId}:${companyId}:${fingerprint}`;
  }
}
