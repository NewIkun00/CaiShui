import{Inject,Injectable}from'@nestjs/common';
import{randomUUID}from'node:crypto';
import{REVIEW_CASE_STORE,type ReviewRiskLevel,type ReviewSourceType,type ReviewCaseStore}from'./review-case-store.js';
export interface IntakeReviewCase{readonly tenantId:string;readonly companyId:string;readonly sourceType:ReviewSourceType;readonly sourceId:string;readonly riskLevel:ReviewRiskLevel;readonly blocksFiling:boolean;readonly summary:string;readonly createdBy:string;readonly traceId:string;readonly occurredAt:Date}
@Injectable()
export class ReviewCaseIntakeService{
  constructor(@Inject(REVIEW_CASE_STORE)private readonly store:ReviewCaseStore){}
  capture(source:IntakeReviewCase){const{createdBy,...facts}=source;return this.store.create({id:randomUUID(),...facts,status:'open',actorId:createdBy});}
}
