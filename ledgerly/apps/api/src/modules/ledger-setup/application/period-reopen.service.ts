import{ConflictException,Inject,Injectable,NotFoundException}from'@nestjs/common';
import type{PeriodReopenRequestInput}from'@ledgerly/contracts';
import{randomUUID}from'node:crypto';
import type{RequestContext}from'../../organization/application/organization.service.js';
import{LEDGER_SETUP_STORE,type LedgerSetupStore}from'./ledger-setup-store.js';
import{PERIOD_REOPEN_STORE,type PeriodReopenStore}from'./period-reopen-store.js';

@Injectable()
export class PeriodReopenService{
  constructor(@Inject(LEDGER_SETUP_STORE)private readonly setups:LedgerSetupStore,@Inject(PERIOD_REOPEN_STORE)private readonly requests:PeriodReopenStore){}
  async request(companyId:string,input:PeriodReopenRequestInput,context:RequestContext){if(!context.tenantId)throw new NotFoundException('Accounting period not found');const setup=await this.setups.find(context.tenantId,companyId);if(!setup)throw new NotFoundException('Accounting period not found');if(setup.periodStatus!=='locked')throw new ConflictException({code:'ACCOUNTING_PERIOD_NOT_LOCKED',message:'Only a locked accounting period can be reopened'});return this.requests.save({id:randomUUID(),tenantId:context.tenantId,companyId,periodId:setup.periodId,periodStart:setup.periodStart,periodEnd:setup.periodEnd,reason:input.reason,actorId:context.actorId,traceId:context.traceId,requestedAt:new Date()});}
  async list(companyId:string,context:RequestContext){if(!context.tenantId)throw new NotFoundException('Company not found');return this.requests.list(context.tenantId,companyId);}
}
