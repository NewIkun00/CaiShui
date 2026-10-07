import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module.js';
import { ProfileScopeModule } from '../profile-scope/profile-scope.module.js';
import { LedgerSetupService } from './application/ledger-setup.service.js';
import { LEDGER_SETUP_STORE } from './application/ledger-setup-store.js';
import { MemoryLedgerSetupStore } from './infrastructure/memory-ledger-setup.store.js';
import { PostgresLedgerSetupStore } from './infrastructure/postgres-ledger-setup.store.js';
import { LedgerSetupController } from './presentation/ledger-setup.controller.js';
import { AccountingPeriodController } from './presentation/accounting-period.controller.js';
import { PeriodReopenService } from './application/period-reopen.service.js';
import { PERIOD_REOPEN_STORE } from './application/period-reopen-store.js';
import { MemoryPeriodReopenStore } from './infrastructure/memory-period-reopen.store.js';
import { PostgresPeriodReopenStore } from './infrastructure/postgres-period-reopen.store.js';

const storageProviders = process.env['STORAGE_MODE'] === 'memory'
  ? [MemoryLedgerSetupStore, { provide: LEDGER_SETUP_STORE, useExisting: MemoryLedgerSetupStore }]
  : [PostgresLedgerSetupStore, { provide: LEDGER_SETUP_STORE, useExisting: PostgresLedgerSetupStore }];
const reopenProviders=process.env['STORAGE_MODE']==='memory'
  ?[MemoryPeriodReopenStore,{provide:PERIOD_REOPEN_STORE,useExisting:MemoryPeriodReopenStore}]
  :[PostgresPeriodReopenStore,{provide:PERIOD_REOPEN_STORE,useExisting:PostgresPeriodReopenStore}];

@Module({
  imports: [OrganizationModule, ProfileScopeModule],
  controllers: [LedgerSetupController,AccountingPeriodController],
  providers: [...storageProviders,...reopenProviders, LedgerSetupService,PeriodReopenService],
  exports: [LEDGER_SETUP_STORE],
})
export class LedgerSetupModule {}
