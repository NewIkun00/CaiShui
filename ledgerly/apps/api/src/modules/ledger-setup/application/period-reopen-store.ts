export interface PeriodReopenRequest {
  readonly id:string;readonly companyId:string;readonly periodId:string;readonly periodStart:string;readonly periodEnd:string;
  readonly reason:string;readonly status:'pending'|'approved'|'rejected';readonly version:number;readonly requestedAt:Date;readonly requestedBy:string;
  readonly decisionReason?:string|undefined;readonly decidedAt?:Date|undefined;readonly decidedBy?:string|undefined;
}
export interface SavePeriodReopenRequestRecord {
  readonly id:string;readonly tenantId:string;readonly companyId:string;readonly periodId:string;readonly periodStart:string;readonly periodEnd:string;
  readonly reason:string;readonly actorId:string;readonly traceId:string;readonly requestedAt:Date;
}
export interface DecidePeriodReopenRequestRecord {
  readonly tenantId:string;readonly companyId:string;readonly requestId:string;readonly periodId:string;
  readonly expectedVersion:number;readonly status:'approved'|'rejected';readonly reason:string;
  readonly actorId:string;readonly traceId:string;readonly occurredAt:Date;
}
export const PERIOD_REOPEN_STORE=Symbol('PERIOD_REOPEN_STORE');
export interface PeriodReopenStore {
  save(record:SavePeriodReopenRequestRecord):Promise<{readonly request:PeriodReopenRequest;readonly created:boolean}>;
  list(tenantId:string,companyId:string):Promise<readonly PeriodReopenRequest[]>;
  find(tenantId:string,companyId:string,requestId:string):Promise<PeriodReopenRequest|null>;
  decide(record:DecidePeriodReopenRequestRecord):Promise<PeriodReopenRequest|null>;
}
