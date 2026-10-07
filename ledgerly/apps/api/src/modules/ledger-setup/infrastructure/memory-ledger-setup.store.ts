import { Injectable } from '@nestjs/common';
import { createOpeningBalanceEntries } from '@ledgerly/domain';
import type {
  LedgerSetupStore,
  SavedLedgerSetup,
  SaveLedgerSetupRecord,
} from '../application/ledger-setup-store.js';

@Injectable()
export class MemoryLedgerSetupStore implements LedgerSetupStore {
  private readonly records = new Map<string, SavedLedgerSetup>();

  save(record: SaveLedgerSetupRecord): Promise<SavedLedgerSetup> {
    const bank = record.setup.accountType === 'bank'
      ? { bankName: record.setup.bankName, accountNumberLast4: record.setup.accountNumberLast4 }
      : {};
    const saved: SavedLedgerSetup = Object.freeze({
      id: record.id,
      companyId: record.companyId,
      accountId: record.accountId,
      periodId: record.periodId,
      accountName: record.setup.accountName,
      accountType: record.setup.accountType,
      ...bank,
      openingBalance: record.setup.openingBalance.toString(),
      openingBalanceSource:record.setup.openingBalanceSource,
      openingEntries:createOpeningBalanceEntries(record.setup).map(entry=>({...entry,amount:entry.amount.toString()})),
      openingBalanceAsOf: record.setup.openingBalanceAsOf,
      periodStart: record.setup.period.start,
      periodEnd: record.setup.period.end,
      status: 'draft',
      periodStatus: 'open',
      createdAt: record.createdAt,
    });
    this.records.set(this.key(record.tenantId, record.companyId), saved);
    return Promise.resolve(saved);
  }

  find(tenantId: string, companyId: string): Promise<SavedLedgerSetup | null> {
    return Promise.resolve(this.records.get(this.key(tenantId, companyId)) ?? null);
  }

  lockCurrentPeriod(record:{readonly tenantId:string;readonly companyId:string;readonly actorId:string;readonly traceId:string;readonly lockedAt:Date}):Promise<SavedLedgerSetup|null>{const key=this.key(record.tenantId,record.companyId),current=this.records.get(key);if(!current)return Promise.resolve(null);if(current.periodStatus==='locked')return Promise.resolve(current);const locked=Object.freeze({...current,periodStatus:'locked' as const});this.records.set(key,locked);return Promise.resolve(locked);}

  private key(tenantId: string, companyId: string): string {
    return `${tenantId}:${companyId}`;
  }
}
