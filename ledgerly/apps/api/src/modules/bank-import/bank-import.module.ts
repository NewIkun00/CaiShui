import { Module } from '@nestjs/common';
import { BusinessEventModule } from '../business-event/business-event.module.js';
import { CounterpartyModule } from '../counterparty/counterparty.module.js';
import { LedgerSetupModule } from '../ledger-setup/ledger-setup.module.js';
import { BANK_IMPORT_STORE } from './application/bank-import-store.js';
import { BankImportService } from './application/bank-import.service.js';
import { MemoryBankImportStore } from './infrastructure/memory-bank-import.store.js';
import { PostgresBankImportStore } from './infrastructure/postgres-bank-import.store.js';
import { BankImportController } from './presentation/bank-import.controller.js';

const storageProviders = process.env['STORAGE_MODE'] === 'memory'
  ? [MemoryBankImportStore, { provide: BANK_IMPORT_STORE, useExisting: MemoryBankImportStore }]
  : [PostgresBankImportStore, { provide: BANK_IMPORT_STORE, useExisting: PostgresBankImportStore }];

@Module({
  imports: [LedgerSetupModule, CounterpartyModule, BusinessEventModule],
  controllers: [BankImportController],
  providers: [...storageProviders, BankImportService],
})
export class BankImportModule {}
