import type { LedgerSetup,OpeningBalanceEntry,OpeningBalanceSource } from '@ledgerly/domain';

export interface SavedLedgerSetup {
  readonly id: string;
  readonly companyId: string;
  readonly accountId: string;
  readonly periodId: string;
  readonly accountName: string;
  readonly accountType: 'bank' | 'cash';
  readonly bankName?: string | undefined;
  readonly accountNumberLast4?: string | undefined;
  readonly openingBalance: string;
  readonly openingBalanceSource:OpeningBalanceSource;
  readonly openingEntries:readonly (Omit<OpeningBalanceEntry,'amount'>&{readonly amount:string})[];
  readonly openingBalanceAsOf: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: 'draft';
  readonly periodStatus: 'open'|'locked';
  readonly createdAt: Date;
}

export interface SaveLedgerSetupRecord {
  readonly id: string;
  readonly accountId: string;
  readonly periodId: string;
  readonly openingBalanceId: string;
  readonly openingEntryIds:readonly string[];
  readonly tenantId: string;
  readonly companyId: string;
  readonly actorId: string;
  readonly traceId: string;
  readonly setup: LedgerSetup;
  readonly createdAt: Date;
}

export const LEDGER_SETUP_STORE = Symbol('LEDGER_SETUP_STORE');

export interface LedgerSetupStore {
  save(record: SaveLedgerSetupRecord): Promise<SavedLedgerSetup>;
  find(tenantId: string, companyId: string): Promise<SavedLedgerSetup | null>;
  lockCurrentPeriod(record:{readonly tenantId:string;readonly companyId:string;readonly actorId:string;readonly traceId:string;readonly lockedAt:Date}):Promise<SavedLedgerSetup|null>;
}
