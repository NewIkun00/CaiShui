import { Module } from '@nestjs/common';
import { CounterpartyModule } from '../counterparty/counterparty.module.js';
import { LedgerSetupModule } from '../ledger-setup/ledger-setup.module.js';
import { BusinessEventService } from './application/business-event.service.js';
import { BUSINESS_EVENT_STORE } from './application/business-event-store.js';
import { MemoryBusinessEventStore } from './infrastructure/memory-business-event.store.js';
import { PostgresBusinessEventStore } from './infrastructure/postgres-business-event.store.js';
import { BusinessEventController } from './presentation/business-event.controller.js';

const storageProviders = process.env['STORAGE_MODE'] === 'memory'
  ? [MemoryBusinessEventStore, { provide: BUSINESS_EVENT_STORE, useExisting: MemoryBusinessEventStore }]
  : [PostgresBusinessEventStore, { provide: BUSINESS_EVENT_STORE, useExisting: PostgresBusinessEventStore }];

@Module({
  imports: [LedgerSetupModule, CounterpartyModule],
  controllers: [BusinessEventController],
  providers: [...storageProviders, BusinessEventService],
  exports: [BUSINESS_EVENT_STORE],
})
export class BusinessEventModule {}
