import{Module}from'@nestjs/common';
import{BusinessEventModule}from'../business-event/business-event.module.js';
import{InvoiceModule}from'../invoice/invoice.module.js';
import{LedgerSetupModule}from'../ledger-setup/ledger-setup.module.js';
import{ReconciliationService}from'./application/reconciliation.service.js';
import{SETTLEMENT_STORE}from'./application/settlement-store.js';
import{MemorySettlementStore}from'./infrastructure/memory-settlement.store.js';
import{PostgresSettlementStore}from'./infrastructure/postgres-settlement.store.js';
import{ReconciliationController}from'./presentation/reconciliation.controller.js';
const providers=process.env['STORAGE_MODE']==='memory'?[MemorySettlementStore,{provide:SETTLEMENT_STORE,useExisting:MemorySettlementStore}]:[PostgresSettlementStore,{provide:SETTLEMENT_STORE,useExisting:PostgresSettlementStore}];
@Module({imports:[InvoiceModule,BusinessEventModule,LedgerSetupModule],controllers:[ReconciliationController],providers:[...providers,ReconciliationService],exports:[SETTLEMENT_STORE]})
export class ReconciliationModule{}
