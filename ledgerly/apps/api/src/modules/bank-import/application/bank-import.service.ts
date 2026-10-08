import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { BankCsvImportRequest } from '@ledgerly/contracts';
import {
  BusinessEventType,
  confirmBusinessEvent,
  createBusinessEvent,
  normalizeCounterpartyName,
  parseBankCsv,
} from '@ledgerly/domain';
import { createHash, randomUUID } from 'node:crypto';
import { COUNTERPARTY_STORE, type CounterpartyStore } from '../../counterparty/application/counterparty-store.js';
import { LEDGER_SETUP_STORE, type LedgerSetupStore } from '../../ledger-setup/application/ledger-setup-store.js';
import { assertAccountingPeriodOpen } from '../../ledger-setup/application/accounting-period-guard.js';
import type { RequestContext } from '../../organization/application/organization.service.js';
import {
  BANK_IMPORT_STORE,
  type BankImportBatch,
  type BankImportRow,
  type BankImportStore,
  type ImportEvent,
} from './bank-import-store.js';

function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }

@Injectable()
export class BankImportService {
  constructor(
    @Inject(LEDGER_SETUP_STORE) private readonly ledgerSetups: LedgerSetupStore,
    @Inject(COUNTERPARTY_STORE) private readonly counterparties: CounterpartyStore,
    @Inject(BANK_IMPORT_STORE) private readonly imports: BankImportStore,
  ) {}

  async upload(companyId: string, input: BankCsvImportRequest, context: RequestContext): Promise<BankImportBatch> {
    if (!context.tenantId) {
      throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    }
    const setup=await this.ledgerSetups.find(context.tenantId,companyId);
    if(!setup)throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    if(setup.accountType!=='bank')throw new ConflictException({code:'BANK_ACCOUNT_REQUIRED',message:'Bank statements require a bank account'});
    if(input.statementPeriodStart!==setup.periodStart||input.statementPeriodEnd!==setup.periodEnd){
      throw new ConflictException({code:'STATEMENT_PERIOD_MISMATCH',message:'Statement period must match the open accounting period'});
    }
    const parsed = parseBankCsv(input.content);
    if (parsed.rows.length > 1000) throw new ConflictException({ code: 'IMPORT_TOO_LARGE', message: 'A batch can contain at most 1000 rows' });
    const parties = await this.counterparties.list(context.tenantId, companyId);
    const partyByName = new Map(parties.map((party) => [party.normalizedName, party.id]));
    const provisional = parsed.rows.map((row) => {
      const fingerprint = sha256([row.occurredOn, row.description, row.counterpartyName, row.direction, row.amount, row.balance].join('|'));
      return { row, fingerprint, counterpartyId: row.counterpartyName ? partyByName.get(normalizeCounterpartyName(row.counterpartyName)) : undefined };
    });
    const existing = await this.imports.fingerprintsExist(context.tenantId, companyId, provisional.map((item) => item.fingerprint));
    const withinBatch = new Set<string>();
    const rows: BankImportRow[] = provisional.map(({ row, fingerprint, counterpartyId }) => {
      const errors = [...row.errors];
      if(row.occurredOn&&(row.occurredOn<input.statementPeriodStart||row.occurredOn>input.statementPeriodEnd))errors.push('交易日期不在对账单期间内');
      if (!counterpartyId && row.counterpartyName) errors.push('未找到同名往来单位');
      const duplicate = existing.has(fingerprint) || withinBatch.has(fingerprint);
      withinBatch.add(fingerprint);
      return {
        id: randomUUID(), rowNumber: row.rowNumber, occurredOn: row.occurredOn,
        description: row.description, counterpartyName: row.counterpartyName,
        counterpartyId, direction: row.direction, amount: row.amount, balance: row.balance,
        fingerprint, status: duplicate ? 'duplicate' : errors.length > 0 ? 'invalid' : 'valid', errors,
      };
    });
    const invalidRows = rows.filter((row) => row.status === 'invalid').length;
    const duplicateRows = rows.filter((row) => row.status === 'duplicate').length;
    const validRows = rows.filter((row) => row.status === 'valid').length;
    const now = new Date();
    return this.imports.save({
      tenantId: context.tenantId, actorId: context.actorId, traceId: context.traceId,
      batch: {
        id: randomUUID(), companyId,accountId:setup.accountId,statementPeriodStart:input.statementPeriodStart,statementPeriodEnd:input.statementPeriodEnd,fileName: input.fileName, fileHash: sha256(input.content),
        status: parsed.errors.length > 0 || invalidRows > 0 ? 'has_errors' : 'validated',
        totalRows: rows.length, validRows, invalidRows, duplicateRows, rows,
        batchErrors: parsed.errors, createdAt: now,
      },
    });
  }

  async get(companyId: string, batchId: string, context: RequestContext): Promise<BankImportBatch> {
    if (!context.tenantId) throw new NotFoundException('Import batch not found');
    const batch = await this.imports.find(context.tenantId, companyId, batchId);
    if (!batch) throw new NotFoundException('Import batch not found');
    return batch;
  }

  async confirm(companyId: string, batchId: string, context: RequestContext): Promise<BankImportBatch> {
    if (!context.tenantId) throw new NotFoundException('Import batch not found');
    const setup = await this.ledgerSetups.find(context.tenantId, companyId);
    if (!setup) throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    assertAccountingPeriodOpen(setup);
    const batch = await this.imports.find(context.tenantId, companyId, batchId);
    if (!batch) throw new NotFoundException('Import batch not found');
    if (batch.status !== 'validated' || batch.validRows === 0) {
      throw new ConflictException({ code: 'IMPORT_NOT_READY', message: 'Import contains errors or has no valid rows' });
    }
    const confirmedAt = new Date();
    const events: ImportEvent[] = batch.rows.filter((row) => row.status === 'valid').map((row) => {
      if (!row.occurredOn || !row.amount || !row.counterpartyId || !row.description || !row.direction) {
        throw new ConflictException({ code: 'IMPORT_ROW_INCOMPLETE', message: `Row ${row.rowNumber} is incomplete` });
      }
      const draft = createBusinessEvent({
        type: row.direction === 'income' ? BusinessEventType.MoneyReceived : BusinessEventType.MoneyPaid,
        occurredOn: row.occurredOn, amount: row.amount, counterpartyId: row.counterpartyId,
        description: row.description,
      }, 'import');
      return {
        rowId: row.id, eventId: randomUUID(), fingerprint: row.fingerprint,
        event: confirmBusinessEvent(draft, context.actorId, confirmedAt),
      };
    });
    const confirmed = await this.imports.confirm({
      tenantId: context.tenantId, companyId, actorId: context.actorId, traceId: context.traceId,
      batchId, confirmedAt, events,
    });
    if (!confirmed) throw new ConflictException({ code: 'IMPORT_CONFIRM_CONFLICT', message: 'Import batch changed; reload and retry' });
    return confirmed;
  }
}
