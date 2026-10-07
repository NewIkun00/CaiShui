import { Module } from '@nestjs/common';
import { LedgerSetupModule } from '../ledger-setup/ledger-setup.module.js';
import { OrganizationModule } from '../organization/organization.module.js';
import { CounterpartyService } from './application/counterparty.service.js';
import { COUNTERPARTY_STORE } from './application/counterparty-store.js';
import { MemoryCounterpartyStore } from './infrastructure/memory-counterparty.store.js';
import { PostgresCounterpartyStore } from './infrastructure/postgres-counterparty.store.js';
import { CounterpartyController } from './presentation/counterparty.controller.js';

const storageProviders = process.env['STORAGE_MODE'] === 'memory'
  ? [MemoryCounterpartyStore, { provide: COUNTERPARTY_STORE, useExisting: MemoryCounterpartyStore }]
  : [PostgresCounterpartyStore, { provide: COUNTERPARTY_STORE, useExisting: PostgresCounterpartyStore }];

@Module({
  imports: [OrganizationModule, LedgerSetupModule],
  controllers: [CounterpartyController],
  providers: [...storageProviders, CounterpartyService],
  exports: [COUNTERPARTY_STORE],
})
export class CounterpartyModule {}
