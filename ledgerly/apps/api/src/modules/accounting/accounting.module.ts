import { Module } from '@nestjs/common';
import { BusinessEventModule } from '../business-event/business-event.module.js';
import { LedgerSetupModule } from '../ledger-setup/ledger-setup.module.js';
import { ReconciliationModule } from '../reconciliation/reconciliation.module.js';
import { AccountingService } from './application/accounting.service.js';
import { VOUCHER_STORE } from './application/voucher-store.js';
import { MemoryVoucherStore } from './infrastructure/memory-voucher.store.js';
import { PostgresVoucherStore } from './infrastructure/postgres-voucher.store.js';
import { AccountingController } from './presentation/accounting.controller.js';

const storageProviders=process.env['STORAGE_MODE']==='memory'?[MemoryVoucherStore,{provide:VOUCHER_STORE,useExisting:MemoryVoucherStore}]:[PostgresVoucherStore,{provide:VOUCHER_STORE,useExisting:PostgresVoucherStore}];
@Module({imports:[LedgerSetupModule,BusinessEventModule,ReconciliationModule],controllers:[AccountingController],providers:[...storageProviders,AccountingService]})
export class AccountingModule{}
