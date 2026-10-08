import{Inject,Injectable}from'@nestjs/common';
import{and,desc,eq}from'drizzle-orm';
import{ReconciliationCheckGrade,ReconciliationIssueTriageStatus,type ReconciliationIssueCode}from'@ledgerly/domain';
import{randomUUID}from'node:crypto';
import{DATABASE,type Database}from'../../../infrastructure/database/database.provider.js';
import{auditEvents,outboxEvents,reconciliationCheckIssues,reconciliationCheckRuns,reconciliationIssueTriageEvents}from'../../../infrastructure/database/schema.js';
import type{ReconciliationCheckInputSnapshot,ReconciliationCheckStore,SavedReconciliationCheckIssue,SavedReconciliationCheckRun,SaveReconciliationCheckRunRecord,TriageReconciliationIssueRecord,TriageReconciliationIssueResult}from'../application/reconciliation-check-store.js';

@Injectable()
export class PostgresReconciliationCheckStore implements ReconciliationCheckStore{
  constructor(@Inject(DATABASE)private readonly db:Database){}

  async save(record:SaveReconciliationCheckRunRecord):Promise<SavedReconciliationCheckRun>{
    const runId=await this.db.transaction(async tx=>{
      const[inserted]=await tx.insert(reconciliationCheckRuns).values({
        id:record.run.id,tenantId:record.run.tenantId,companyId:record.run.companyId,periodId:record.run.periodId,
        periodStart:record.run.periodStart,periodEnd:record.run.periodEnd,inputSnapshot:record.run.inputSnapshot,inputHash:record.run.inputHash,grade:record.run.grade,
        blocksFiling:record.run.blocksFiling,totalIssues:record.run.totalIssues,yellowIssues:record.run.yellowIssues,
        redIssues:record.run.redIssues,createdAt:record.run.createdAt,createdBy:record.run.createdBy,
      }).onConflictDoNothing({target:[reconciliationCheckRuns.tenantId,reconciliationCheckRuns.companyId,reconciliationCheckRuns.periodId,reconciliationCheckRuns.inputHash]}).returning({id:reconciliationCheckRuns.id});
      if(!inserted){const[existing]=await tx.select({id:reconciliationCheckRuns.id}).from(reconciliationCheckRuns).where(and(eq(reconciliationCheckRuns.tenantId,record.run.tenantId),eq(reconciliationCheckRuns.companyId,record.run.companyId),eq(reconciliationCheckRuns.periodId,record.run.periodId),eq(reconciliationCheckRuns.inputHash,record.run.inputHash))).limit(1);if(!existing)throw new Error('Reconciliation check run conflict');return existing.id}
      if(record.run.issues.length>0)await tx.insert(reconciliationCheckIssues).values(record.run.issues.map(issue=>({id:issue.id,runId:record.run.id,code:issue.code,severity:issue.severity,subjectType:issue.subjectType,subjectId:issue.subjectId,amount:issue.amount,message:issue.message,suggestedAction:issue.suggestedAction,triageStatus:issue.triageStatus,triageVersion:issue.triageVersion})));
      await tx.insert(auditEvents).values({id:randomUUID(),tenantId:record.run.tenantId,actorId:record.run.createdBy,action:'reconciliation.check_run.create',resourceType:'reconciliation_check_run',resourceId:record.run.id,outcome:'success',traceId:record.traceId,metadata:{companyId:record.run.companyId,periodId:record.run.periodId,inputHash:record.run.inputHash,grade:record.run.grade,totalIssues:record.run.totalIssues}});
      await tx.insert(outboxEvents).values({id:randomUUID(),tenantId:record.run.tenantId,eventType:'reconciliation.check_run_created.v1',aggregateType:'reconciliation_check_run',aggregateId:record.run.id,payload:{companyId:record.run.companyId,periodId:record.run.periodId,grade:record.run.grade,blocksFiling:record.run.blocksFiling,totalIssues:record.run.totalIssues},occurredAt:record.run.createdAt});
      return inserted.id;
    });
    const saved=await this.find(record.run.tenantId,record.run.companyId,runId);if(!saved)throw new Error('Reconciliation check run was not saved');return saved;
  }

  async latest(tenantId:string,companyId:string):Promise<SavedReconciliationCheckRun|null>{const[run]=await this.db.select().from(reconciliationCheckRuns).where(and(eq(reconciliationCheckRuns.tenantId,tenantId),eq(reconciliationCheckRuns.companyId,companyId))).orderBy(desc(reconciliationCheckRuns.createdAt)).limit(1);return run?this.hydrate(run):null}
  async find(tenantId:string,companyId:string,runId:string):Promise<SavedReconciliationCheckRun|null>{const[run]=await this.db.select().from(reconciliationCheckRuns).where(and(eq(reconciliationCheckRuns.id,runId),eq(reconciliationCheckRuns.tenantId,tenantId),eq(reconciliationCheckRuns.companyId,companyId))).limit(1);return run?this.hydrate(run):null}

  async triage(record:TriageReconciliationIssueRecord):Promise<TriageReconciliationIssueResult>{return this.db.transaction(async tx=>{
    const[run]=await tx.select({id:reconciliationCheckRuns.id}).from(reconciliationCheckRuns).where(and(eq(reconciliationCheckRuns.id,record.runId),eq(reconciliationCheckRuns.tenantId,record.tenantId),eq(reconciliationCheckRuns.companyId,record.companyId))).limit(1);if(!run)return{outcome:'not_found'};
    const[current]=await tx.select().from(reconciliationCheckIssues).where(and(eq(reconciliationCheckIssues.id,record.issueId),eq(reconciliationCheckIssues.runId,record.runId))).limit(1);if(!current)return{outcome:'not_found'};if(current.triageVersion!==record.expectedVersion)return{outcome:'conflict'};
    const nextVersion=current.triageVersion+1;
    const[updated]=await tx.update(reconciliationCheckIssues).set({triageStatus:record.status,triageVersion:nextVersion,triageNote:record.note,triagedBy:record.actorId,triagedAt:record.triagedAt}).where(and(eq(reconciliationCheckIssues.id,record.issueId),eq(reconciliationCheckIssues.runId,record.runId),eq(reconciliationCheckIssues.triageVersion,record.expectedVersion))).returning();if(!updated)return{outcome:'conflict'};
    await tx.insert(reconciliationIssueTriageEvents).values({id:randomUUID(),issueId:record.issueId,fromStatus:current.triageStatus,toStatus:record.status,note:record.note,version:nextVersion,actorId:record.actorId,createdAt:record.triagedAt});
    await tx.insert(auditEvents).values({id:randomUUID(),tenantId:record.tenantId,actorId:record.actorId,action:'reconciliation.issue.triage',resourceType:'reconciliation_check_issue',resourceId:record.issueId,outcome:'success',traceId:record.traceId,metadata:{runId:record.runId,fromStatus:current.triageStatus,toStatus:record.status,version:nextVersion}});
    await tx.insert(outboxEvents).values({id:randomUUID(),tenantId:record.tenantId,eventType:'reconciliation.issue_triaged.v1',aggregateType:'reconciliation_check_issue',aggregateId:record.issueId,payload:{runId:record.runId,companyId:record.companyId,status:record.status,version:nextVersion},occurredAt:record.triagedAt});
    return{outcome:'updated',issue:this.mapIssue(updated)};
  })}

  private async hydrate(run:typeof reconciliationCheckRuns.$inferSelect):Promise<SavedReconciliationCheckRun>{const issues=await this.db.select().from(reconciliationCheckIssues).where(eq(reconciliationCheckIssues.runId,run.id));return{id:run.id,tenantId:run.tenantId,companyId:run.companyId,periodId:run.periodId,periodStart:run.periodStart,periodEnd:run.periodEnd,inputSnapshot:run.inputSnapshot as ReconciliationCheckInputSnapshot,inputHash:run.inputHash,grade:run.grade as ReconciliationCheckGrade,blocksFiling:run.blocksFiling,totalIssues:run.totalIssues,yellowIssues:run.yellowIssues,redIssues:run.redIssues,issues:issues.map(item=>this.mapIssue(item)),createdAt:run.createdAt,createdBy:run.createdBy}}
  private mapIssue(row:typeof reconciliationCheckIssues.$inferSelect):SavedReconciliationCheckIssue{return{id:row.id,code:row.code as ReconciliationIssueCode,severity:row.severity as'yellow'|'red',subjectType:row.subjectType as'invoice'|'payment'|'account'|'ledger'|'subledger',subjectId:row.subjectId,amount:row.amount,message:row.message,suggestedAction:row.suggestedAction,triageStatus:row.triageStatus as ReconciliationIssueTriageStatus,triageVersion:row.triageVersion,triageNote:row.triageNote??undefined,triagedBy:row.triagedBy??undefined,triagedAt:row.triagedAt??undefined}}
}
