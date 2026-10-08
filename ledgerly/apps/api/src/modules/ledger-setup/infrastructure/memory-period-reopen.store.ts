import{Inject,Injectable}from'@nestjs/common';
import{LEDGER_SETUP_STORE,type LedgerSetupStore}from'../application/ledger-setup-store.js';
import type{DecidePeriodReopenRequestRecord,PeriodReopenRequest,PeriodReopenStore,SavePeriodReopenRequestRecord}from'../application/period-reopen-store.js';

@Injectable()
export class MemoryPeriodReopenStore implements PeriodReopenStore{
  constructor(@Inject(LEDGER_SETUP_STORE)private readonly setups:LedgerSetupStore){}
  private readonly records=new Map<string,PeriodReopenRequest[]>();
  save(record:SavePeriodReopenRequestRecord):Promise<{request:PeriodReopenRequest;created:boolean}>{const key=this.key(record.tenantId,record.companyId),items=this.records.get(key)??[],existing=items.find(item=>item.periodId===record.periodId&&item.status==='pending');if(existing)return Promise.resolve({request:existing,created:false});const request=Object.freeze({id:record.id,companyId:record.companyId,periodId:record.periodId,periodStart:record.periodStart,periodEnd:record.periodEnd,reason:record.reason,status:'pending' as const,version:1,requestedAt:record.requestedAt,requestedBy:record.actorId});this.records.set(key,[request,...items]);return Promise.resolve({request,created:true});}
  list(tenantId:string,companyId:string):Promise<readonly PeriodReopenRequest[]>{return Promise.resolve(this.records.get(this.key(tenantId,companyId))??[]);}
  find(tenantId:string,companyId:string,requestId:string):Promise<PeriodReopenRequest|null>{return Promise.resolve((this.records.get(this.key(tenantId,companyId))??[]).find(item=>item.id===requestId)??null);}
  async decide(record:DecidePeriodReopenRequestRecord):Promise<PeriodReopenRequest|null>{const key=this.key(record.tenantId,record.companyId),items=this.records.get(key)??[],index=items.findIndex(item=>item.id===record.requestId&&item.periodId===record.periodId&&item.status==='pending'&&item.version===record.expectedVersion);if(index<0)return null;if(record.status==='approved'&&!await this.setups.reopenCurrentPeriod({tenantId:record.tenantId,companyId:record.companyId,periodId:record.periodId}))return null;const current=items[index]!;const decided=Object.freeze({...current,status:record.status,version:current.version+1,decisionReason:record.reason,decidedAt:record.occurredAt,decidedBy:record.actorId});this.records.set(key,items.map((item,itemIndex)=>itemIndex===index?decided:item));return decided;}
  private key(tenantId:string,companyId:string){return`${tenantId}:${companyId}`;}
}
