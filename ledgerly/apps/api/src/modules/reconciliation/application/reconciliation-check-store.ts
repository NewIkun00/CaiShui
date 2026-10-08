import type {
  ReconciliationCheckGrade, ReconciliationIssueCode, ReconciliationIssueTriageStatus,
} from '@ledgerly/domain';

export interface SavedReconciliationCheckIssue {
  readonly id:string;readonly code:ReconciliationIssueCode;readonly severity:'yellow'|'red';
  readonly subjectType:'invoice'|'payment';readonly subjectId:string;readonly amount:string;
  readonly message:string;readonly suggestedAction:string;readonly triageStatus:ReconciliationIssueTriageStatus;
  readonly triageVersion:number;readonly triageNote?:string|undefined;readonly triagedBy?:string|undefined;
  readonly triagedAt?:Date|undefined;
}
export interface ReconciliationCheckInputSnapshot {
  readonly invoices:readonly {readonly invoiceId:string;readonly invoiceNumber:string;readonly outstandingAmount:string}[];
  readonly payments:readonly {readonly paymentEventId:string;readonly description:string;readonly unallocatedAmount:string}[];
}
export interface SavedReconciliationCheckRun {
  readonly id:string;readonly tenantId:string;readonly companyId:string;readonly periodId:string;
  readonly periodStart:string;readonly periodEnd:string;readonly inputSnapshot:ReconciliationCheckInputSnapshot;
  readonly inputHash:string;readonly grade:ReconciliationCheckGrade;
  readonly blocksFiling:boolean;readonly totalIssues:number;readonly yellowIssues:number;readonly redIssues:number;
  readonly issues:readonly SavedReconciliationCheckIssue[];readonly createdAt:Date;readonly createdBy:string;
}
export interface SaveReconciliationCheckRunRecord {readonly run:SavedReconciliationCheckRun;readonly traceId:string;}
export interface TriageReconciliationIssueRecord {
  readonly tenantId:string;readonly companyId:string;readonly runId:string;readonly issueId:string;
  readonly status:Exclude<ReconciliationIssueTriageStatus,ReconciliationIssueTriageStatus.Open>;
  readonly note:string;readonly expectedVersion:number;readonly actorId:string;readonly traceId:string;readonly triagedAt:Date;
}
export type TriageReconciliationIssueResult=
  |{readonly outcome:'updated';readonly issue:SavedReconciliationCheckIssue}
  |{readonly outcome:'not_found'}
  |{readonly outcome:'conflict'};
export const RECONCILIATION_CHECK_STORE=Symbol('RECONCILIATION_CHECK_STORE');
export interface ReconciliationCheckStore {
  save(record:SaveReconciliationCheckRunRecord):Promise<SavedReconciliationCheckRun>;
  latest(tenantId:string,companyId:string):Promise<SavedReconciliationCheckRun|null>;
  find(tenantId:string,companyId:string,runId:string):Promise<SavedReconciliationCheckRun|null>;
  triage(record:TriageReconciliationIssueRecord):Promise<TriageReconciliationIssueResult>;
}
