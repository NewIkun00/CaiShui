import type{Money,Settlement}from'@ledgerly/domain';
export interface SavedSettlement extends Settlement{readonly id:string;readonly companyId:string;readonly createdAt:Date;readonly createdBy:string;}
export interface SaveSettlementRecord{readonly id:string;readonly tenantId:string;readonly companyId:string;readonly actorId:string;readonly traceId:string;readonly settlement:Settlement;readonly invoiceTotal:Money;readonly paymentTotal:Money;readonly createdAt:Date;}
export const SETTLEMENT_STORE=Symbol('SETTLEMENT_STORE');
export interface SettlementStore{
  save(record:SaveSettlementRecord):Promise<SavedSettlement|null>;
  list(tenantId:string,companyId:string):Promise<readonly SavedSettlement[]>;
  exists(tenantId:string,companyId:string,invoiceId:string,paymentEventId:string):Promise<boolean>;
  allocatedForInvoice(tenantId:string,companyId:string,invoiceId:string):Promise<Money>;
  allocatedForPayment(tenantId:string,companyId:string,paymentEventId:string):Promise<Money>;
}
