import{Injectable}from'@nestjs/common';
import type{ReconciliationCheckStore,SavedReconciliationCheckRun,SaveReconciliationCheckRunRecord,TriageReconciliationIssueRecord,TriageReconciliationIssueResult}from'../application/reconciliation-check-store.js';

@Injectable()
export class MemoryReconciliationCheckStore implements ReconciliationCheckStore{
  private readonly records=new Map<string,SavedReconciliationCheckRun[]>();
  save(record:SaveReconciliationCheckRunRecord):Promise<SavedReconciliationCheckRun>{const key=this.key(record.run.tenantId,record.run.companyId),runs=this.records.get(key)??[],existing=runs.find(item=>item.periodId===record.run.periodId&&item.inputHash===record.run.inputHash);if(existing)return Promise.resolve(existing);this.records.set(key,[record.run,...runs]);return Promise.resolve(record.run)}
  latest(tenantId:string,companyId:string):Promise<SavedReconciliationCheckRun|null>{return Promise.resolve(this.records.get(this.key(tenantId,companyId))?.[0]??null)}
  find(tenantId:string,companyId:string,runId:string):Promise<SavedReconciliationCheckRun|null>{return Promise.resolve(this.records.get(this.key(tenantId,companyId))?.find(item=>item.id===runId)??null)}
  triage(record:TriageReconciliationIssueRecord):Promise<TriageReconciliationIssueResult>{const key=this.key(record.tenantId,record.companyId),runs=this.records.get(key)??[],runIndex=runs.findIndex(item=>item.id===record.runId);if(runIndex<0)return Promise.resolve({outcome:'not_found'});const run=runs[runIndex]!,issueIndex=run.issues.findIndex(item=>item.id===record.issueId);if(issueIndex<0)return Promise.resolve({outcome:'not_found'});const current=run.issues[issueIndex]!;if(current.triageVersion!==record.expectedVersion)return Promise.resolve({outcome:'conflict'});const issue={...current,triageStatus:record.status,triageVersion:current.triageVersion+1,triageNote:record.note,triagedBy:record.actorId,triagedAt:record.triagedAt};const issues=[...run.issues];issues[issueIndex]=issue;const updated={...run,issues};const next=[...runs];next[runIndex]=updated;this.records.set(key,next);return Promise.resolve({outcome:'updated',issue})}
  private key(tenantId:string,companyId:string){return`${tenantId}:${companyId}`}
}
