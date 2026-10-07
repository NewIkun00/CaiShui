import { Module } from '@nestjs/common';
import { CounterpartyModule } from '../counterparty/counterparty.module.js';
import { LedgerSetupModule } from '../ledger-setup/ledger-setup.module.js';
import { INVOICE_EXTRACTION_PROVIDER } from './application/invoice-extraction-provider.js';
import { INVOICE_STORE } from './application/invoice-store.js';
import { InvoiceService } from './application/invoice.service.js';
import { MemoryInvoiceStore } from './infrastructure/memory-invoice.store.js';
import { MockInvoiceExtractionProvider } from './infrastructure/mock-invoice-extraction.provider.js';
import { PostgresInvoiceStore } from './infrastructure/postgres-invoice.store.js';
import { InvoiceController } from './presentation/invoice.controller.js';

const storageProviders = process.env['STORAGE_MODE'] === 'memory'
  ? [MemoryInvoiceStore, { provide: INVOICE_STORE, useExisting: MemoryInvoiceStore }]
  : [PostgresInvoiceStore, { provide: INVOICE_STORE, useExisting: PostgresInvoiceStore }];

@Module({
  imports: [LedgerSetupModule, CounterpartyModule], controllers: [InvoiceController],
  providers: [
    ...storageProviders, MockInvoiceExtractionProvider,
    { provide: INVOICE_EXTRACTION_PROVIDER, useExisting: MockInvoiceExtractionProvider }, InvoiceService,
  ],
  exports: [INVOICE_STORE],
})
export class InvoiceModule {}
