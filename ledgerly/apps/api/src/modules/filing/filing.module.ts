import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module.js';
import { CalculationModule } from '../calculation/calculation.module.js';
import { ReviewCaseStoreModule } from '../review-case/review-case-store.module.js';
import { DocumentModule } from '../document/document.module.js';
import { AccountingModule } from '../accounting/accounting.module.js';
import { FILING_STORE } from './application/filing-store.js';
import { FilingService } from './application/filing.service.js';
import { FilingEvidenceService } from './application/filing-evidence.service.js';
import { FilingAdjustmentService } from './application/filing-adjustment.service.js';
import { FilingArchiveService } from './application/filing-archive.service.js';
import { TAX_RESULT_REFERENCE_PORT } from './application/tax-result-reference.port.js';
import { MemoryFilingStore } from './infrastructure/memory-filing.store.js';
import { PostgresFilingStore } from './infrastructure/postgres-filing.store.js';
import { UnavailableTaxResultReferenceAdapter } from './infrastructure/unavailable-tax-result-reference.adapter.js';
import { MemoryTaxResultReferenceAdapter } from './infrastructure/memory-tax-result-reference.adapter.js';
import {
  FilingCalendarController,
  FilingAdjustmentController,
  FilingArchiveController,
  FilingPackageController,
  FilingSopController,
  FilingTaskController,
} from './presentation/filing.controller.js';
const memory = process.env['STORAGE_MODE'] === 'memory';
const providers = memory
  ? [MemoryFilingStore, { provide: FILING_STORE, useExisting: MemoryFilingStore }]
  : [PostgresFilingStore, { provide: FILING_STORE, useExisting: PostgresFilingStore }];
const taxResultProviders = memory
  ? [
      MemoryTaxResultReferenceAdapter,
      { provide: TAX_RESULT_REFERENCE_PORT, useExisting: MemoryTaxResultReferenceAdapter },
    ]
  : [
      UnavailableTaxResultReferenceAdapter,
      { provide: TAX_RESULT_REFERENCE_PORT, useExisting: UnavailableTaxResultReferenceAdapter },
    ];
@Module({
  imports: [OrganizationModule, CalculationModule, ReviewCaseStoreModule, DocumentModule,AccountingModule],
  controllers: [
    FilingCalendarController,
    FilingAdjustmentController,
    FilingArchiveController,
    FilingSopController,
    FilingTaskController,
    FilingPackageController,
  ],
  providers: [...providers, ...taxResultProviders, FilingService, FilingEvidenceService,FilingAdjustmentService,FilingArchiveService],
})
export class FilingModule {}
