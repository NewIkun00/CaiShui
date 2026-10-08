import { Module } from '@nestjs/common';
import { BusinessEventModule } from '../business-event/business-event.module.js';
import { LedgerSetupModule } from '../ledger-setup/ledger-setup.module.js';
import { ReconciliationModule } from '../reconciliation/reconciliation.module.js';
import { AccountingService } from './application/accounting.service.js';
import { AccountingController } from './presentation/accounting.controller.js';
import { VoucherStoreModule } from './voucher-store.module.js';

@Module({imports:[LedgerSetupModule,BusinessEventModule,ReconciliationModule,VoucherStoreModule],controllers:[AccountingController],providers:[AccountingService]})
export class AccountingModule{}
