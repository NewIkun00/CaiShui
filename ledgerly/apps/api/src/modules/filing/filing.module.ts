import{Module}from'@nestjs/common';
import{OrganizationModule}from'../organization/organization.module.js';
import{FILING_STORE}from'./application/filing-store.js';
import{FilingService}from'./application/filing.service.js';
import{TAX_RESULT_REFERENCE_PORT}from'./application/tax-result-reference.port.js';
import{MemoryFilingStore}from'./infrastructure/memory-filing.store.js';
import{PostgresFilingStore}from'./infrastructure/postgres-filing.store.js';
import{UnavailableTaxResultReferenceAdapter}from'./infrastructure/unavailable-tax-result-reference.adapter.js';
import{FilingCalendarController,FilingSopController,FilingTaskController}from'./presentation/filing.controller.js';
const providers=process.env['STORAGE_MODE']==='memory'?[MemoryFilingStore,{provide:FILING_STORE,useExisting:MemoryFilingStore}]:[PostgresFilingStore,{provide:FILING_STORE,useExisting:PostgresFilingStore}];
@Module({imports:[OrganizationModule],controllers:[FilingCalendarController,FilingSopController,FilingTaskController],providers:[...providers,UnavailableTaxResultReferenceAdapter,{provide:TAX_RESULT_REFERENCE_PORT,useExisting:UnavailableTaxResultReferenceAdapter},FilingService]})
export class FilingModule{}
