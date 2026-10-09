import{Module}from'@nestjs/common';
import{REVIEW_CASE_STORE}from'./application/review-case-store.js';
import{ReviewCaseIntakeService}from'./application/review-case-intake.service.js';
import{MemoryReviewCaseStore}from'./infrastructure/memory-review-case.store.js';
import{PostgresReviewCaseStore}from'./infrastructure/postgres-review-case.store.js';
const providers=process.env['STORAGE_MODE']==='memory'?[MemoryReviewCaseStore,{provide:REVIEW_CASE_STORE,useExisting:MemoryReviewCaseStore}]:[PostgresReviewCaseStore,{provide:REVIEW_CASE_STORE,useExisting:PostgresReviewCaseStore}];
@Module({providers:[...providers,ReviewCaseIntakeService],exports:[REVIEW_CASE_STORE,ReviewCaseIntakeService]})
export class ReviewCaseStoreModule{}
