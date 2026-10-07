export interface PeriodReopenRequest {
  readonly id:string;readonly companyId:string;readonly periodId:string;readonly periodStart:string;readonly periodEnd:string;
  readonly reason:string;readonly status:'pending';readonly version:number;readonly requestedAt:Date;readonly requestedBy:string;
}
export interface SavePeriodReopenRequestRecord {
  readonly id:string;readonly tenantId:string;readonly companyId:string;readonly periodId:string;readonly periodStart:string;readonly periodEnd:string;
  readonly reason:string;readonly actorId:string;readonly traceId:string;readonly requestedAt:Date;
}
export const PERIOD_REOPEN_STORE=Symbol('PERIOD_REOPEN_STORE');
export interface PeriodReopenStore {
  save(record:SavePeriodReopenRequestRecord):Promise<{readonly request:PeriodReopenRequest;readonly created:boolean}>;
  list(tenantId:string,companyId:string):Promise<readonly PeriodReopenRequest[]>;
}
