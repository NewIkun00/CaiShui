import{Module}from'@nestjs/common';
import{ReviewCaseService}from'./application/review-case.service.js';
import{ReviewCaseController}from'./presentation/review-case.controller.js';
import{DocumentModule}from'../document/document.module.js';
import{LedgerSetupModule}from'../ledger-setup/ledger-setup.module.js';
import{ReconciliationModule}from'../reconciliation/reconciliation.module.js';
import{REVIEW_SOURCE_RESOLVER}from'./application/review-source-resolver.js';
import{ModuleReviewSourceResolver}from'./infrastructure/module-review-source.resolver.js';
import{ReviewCaseStoreModule}from'./review-case-store.module.js';
@Module({imports:[ReviewCaseStoreModule,ReconciliationModule,LedgerSetupModule,DocumentModule],controllers:[ReviewCaseController],providers:[ModuleReviewSourceResolver,{provide:REVIEW_SOURCE_RESOLVER,useExisting:ModuleReviewSourceResolver},ReviewCaseService]})
export class ReviewCaseModule{}
