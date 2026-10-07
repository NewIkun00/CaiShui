import{Injectable}from'@nestjs/common';
import type{PeriodReopenRequest,PeriodReopenStore,SavePeriodReopenRequestRecord}from'../application/period-reopen-store.js';

@Injectable()
export class MemoryPeriodReopenStore implements PeriodReopenStore{
  private readonly records=new Map<string,PeriodReopenRequest[]>();
  save(record:SavePeriodReopenRequestRecord):Promise<{request:PeriodReopenRequest;created:boolean}>{const key=this.key(record.tenantId,record.companyId),items=this.records.get(key)??[],existing=items.find(item=>item.periodId===record.periodId&&item.status==='pending');if(existing)return Promise.resolve({request:existing,created:false});const request=Object.freeze({id:record.id,companyId:record.companyId,periodId:record.periodId,periodStart:record.periodStart,periodEnd:record.periodEnd,reason:record.reason,status:'pending' as const,version:1,requestedAt:record.requestedAt,requestedBy:record.actorId});this.records.set(key,[request,...items]);return Promise.resolve({request,created:true});}
  list(tenantId:string,companyId:string):Promise<readonly PeriodReopenRequest[]>{return Promise.resolve(this.records.get(this.key(tenantId,companyId))??[]);}
  private key(tenantId:string,companyId:string){return`${tenantId}:${companyId}`;}
}
