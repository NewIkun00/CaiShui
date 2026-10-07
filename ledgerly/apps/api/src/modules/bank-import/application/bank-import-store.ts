import type { BusinessEvent } from '@ledgerly/domain';

export type BankImportStatus = 'validated' | 'has_errors' | 'confirmed';
export type BankImportRowStatus = 'valid' | 'invalid' | 'duplicate';

export interface BankImportRow {
  readonly id: string;
  readonly rowNumber: number;
  readonly occurredOn?: string | undefined;
  readonly description?: string | undefined;
  readonly counterpartyName?: string | undefined;
  readonly counterpartyId?: string | undefined;
  readonly direction?: 'income' | 'expense' | undefined;
  readonly amount?: string | undefined;
  readonly balance?: string | undefined;
  readonly fingerprint: string;
  readonly status: BankImportRowStatus;
  readonly errors: readonly string[];
  readonly businessEventId?: string | undefined;
}

export interface BankImportBatch {
  readonly id: string;
  readonly companyId: string;
  readonly fileName: string;
  readonly fileHash: string;
  readonly status: BankImportStatus;
  readonly totalRows: number;
  readonly validRows: number;
  readonly invalidRows: number;
  readonly duplicateRows: number;
  readonly rows: readonly BankImportRow[];
  readonly batchErrors: readonly string[];
  readonly createdAt: Date;
  readonly confirmedAt?: Date | undefined;
}

export interface SaveBankImportRecord {
  readonly tenantId: string;
  readonly actorId: string;
  readonly traceId: string;
  readonly batch: BankImportBatch;
}

export interface ImportEvent {
  readonly rowId: string;
  readonly eventId: string;
  readonly fingerprint: string;
  readonly event: BusinessEvent;
}

export interface ConfirmBankImportRecord {
  readonly tenantId: string;
  readonly companyId: string;
  readonly actorId: string;
  readonly traceId: string;
  readonly batchId: string;
  readonly confirmedAt: Date;
  readonly events: readonly ImportEvent[];
}

export const BANK_IMPORT_STORE = Symbol('BANK_IMPORT_STORE');

export interface BankImportStore {
  fingerprintsExist(tenantId: string, companyId: string, fingerprints: readonly string[]): Promise<ReadonlySet<string>>;
  save(record: SaveBankImportRecord): Promise<BankImportBatch>;
  find(tenantId: string, companyId: string, batchId: string): Promise<BankImportBatch | null>;
  confirm(record: ConfirmBankImportRecord): Promise<BankImportBatch | null>;
}
