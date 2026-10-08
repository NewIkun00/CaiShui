import{Module}from'@nestjs/common';
import{BusinessEventModule}from'../business-event/business-event.module.js';
import{InvoiceModule}from'../invoice/invoice.module.js';
import{LedgerSetupModule}from'../ledger-setup/ledger-setup.module.js';
import{ReconciliationService}from'./application/reconciliation.service.js';
import{RECONCILIATION_CHECK_STORE}from'./application/reconciliation-check-store.js';
import{SETTLEMENT_STORE}from'./application/settlement-store.js';
import{MemoryReconciliationCheckStore}from'./infrastructure/memory-reconciliation-check.store.js';
import{MemorySettlementStore}from'./infrastructure/memory-settlement.store.js';
import{PostgresReconciliationCheckStore}from'./infrastructure/postgres-reconciliation-check.store.js';
import{PostgresSettlementStore}from'./infrastructure/postgres-settlement.store.js';
import{ReconciliationController}from'./presentation/reconciliation.controller.js';
const providers=process.env['STORAGE_MODE']==='memory'?[MemorySettlementStore,{provide:SETTLEMENT_STORE,useExisting:MemorySettlementStore},MemoryReconciliationCheckStore,{provide:RECONCILIATION_CHECK_STORE,useExisting:MemoryReconciliationCheckStore}]:[PostgresSettlementStore,{provide:SETTLEMENT_STORE,useExisting:PostgresSettlementStore},PostgresReconciliationCheckStore,{provide:RECONCILIATION_CHECK_STORE,useExisting:PostgresReconciliationCheckStore}];
@Module({imports:[InvoiceModule,BusinessEventModule,LedgerSetupModule],controllers:[ReconciliationController],providers:[...providers,ReconciliationService],exports:[SETTLEMENT_STORE]})
export class ReconciliationModule{}
