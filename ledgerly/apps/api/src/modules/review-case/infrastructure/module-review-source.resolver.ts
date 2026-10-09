import{Inject,Injectable}from'@nestjs/common';
import{DOCUMENT_STORE,type DocumentStore}from'../../document/application/document-store.js';
import{PERIOD_REOPEN_STORE,type PeriodReopenStore}from'../../ledger-setup/application/period-reopen-store.js';
import{RECONCILIATION_CHECK_STORE,type ReconciliationCheckStore}from'../../reconciliation/application/reconciliation-check-store.js';
import type{ResolvedReviewSource,ReviewSourceResolver}from'../application/review-source-resolver.js';
import type{ReviewSourceType}from'../application/review-case-store.js';
@Injectable()
export class ModuleReviewSourceResolver implements ReviewSourceResolver{
  constructor(@Inject(RECONCILIATION_CHECK_STORE)private readonly checks:ReconciliationCheckStore,@Inject(PERIOD_REOPEN_STORE)private readonly reopens:PeriodReopenStore,@Inject(DOCUMENT_STORE)private readonly documents:DocumentStore){}
  async resolve(tenantId:string,companyId:string,sourceType:ReviewSourceType,sourceId:string):Promise<ResolvedReviewSource|null>{if(sourceType==='reconciliation_issue'){const found=await this.checks.findIssue(tenantId,companyId,sourceId);return found?{riskLevel:found.issue.severity,blocksFiling:true,summary:found.issue.message,createdBy:found.run.createdBy}:null}const request=await this.reopens.find(tenantId,companyId,sourceId);return request?{riskLevel:'red',blocksFiling:true,summary:`反结账申请：${request.reason}`,createdBy:request.requestedBy}:null}
  async documentsExist(tenantId:string,companyId:string,documentIds:readonly string[]):Promise<boolean>{const unique=[...new Set(documentIds)];const documents=await Promise.all(unique.map(id=>this.documents.find(tenantId,companyId,id)));return documents.every(Boolean)}
}
