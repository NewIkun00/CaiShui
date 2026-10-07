import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ACCOUNTING_RULE_VERSION, ACCOUNTING_TEMPLATE_VERSION, AccountingError, BusinessEventType, Money, VoucherStatus, confirmVoucher, createReversalVoucher, createVoucherDraft, v1ChartOfAccounts } from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import { BUSINESS_EVENT_STORE, type BusinessEventStore } from '../../business-event/application/business-event-store.js';
import { LEDGER_SETUP_STORE, type LedgerSetupStore } from '../../ledger-setup/application/ledger-setup-store.js';
import { assertAccountingPeriodOpen } from '../../ledger-setup/application/accounting-period-guard.js';
import type { RequestContext } from '../../organization/application/organization.service.js';
import { SETTLEMENT_STORE, type SettlementStore } from '../../reconciliation/application/settlement-store.js';
import { VOUCHER_STORE, type SavedVoucher, type VoucherStore } from './voucher-store.js';

export interface VoucherGenerationResult{readonly voucher:SavedVoucher;readonly generated:boolean;}

@Injectable()
export class AccountingService{
  constructor(
    @Inject(LEDGER_SETUP_STORE)private readonly setups:LedgerSetupStore,
    @Inject(BUSINESS_EVENT_STORE)private readonly events:BusinessEventStore,
    @Inject(VOUCHER_STORE)private readonly vouchers:VoucherStore,
    @Inject(SETTLEMENT_STORE)private readonly settlements:SettlementStore,
  ){}

  chart(){return{templateVersion:ACCOUNTING_TEMPLATE_VERSION,items:v1ChartOfAccounts()};}

  async generate(companyId:string,eventId:string,context:RequestContext):Promise<VoucherGenerationResult>{
    if(!context.tenantId)throw new NotFoundException('Business event not found');
    const setup=await this.setups.find(context.tenantId,companyId);if(!setup)throw new ConflictException({code:'LEDGER_SETUP_REQUIRED',message:'Ledger setup is required'});
    assertAccountingPeriodOpen(setup);
    const existing=await this.vouchers.findBySource(context.tenantId,companyId,eventId,ACCOUNTING_RULE_VERSION);
    if(existing)return{voucher:existing,generated:false};
    const event=await this.events.find(context.tenantId,companyId,eventId);if(!event)throw new NotFoundException('Business event not found');
    if(event.occurredOn<setup.periodStart||event.occurredOn>setup.periodEnd)throw new ConflictException({code:'EVENT_OUTSIDE_OPEN_PERIOD',message:'Business event is outside the initialized accounting period'});
    const isPayment=event.type===BusinessEventType.MoneyReceived||event.type===BusinessEventType.MoneyPaid;
    const allocated=isPayment?await this.settlements.allocatedForPayment(context.tenantId,companyId,event.id):undefined;
    let voucher;
    try{voucher=createVoucherDraft(event.id,event,isPayment?{paymentFullyReconciled:allocated?.equals(event.amount)??false}:{});}catch(error:unknown){
      if(error instanceof AccountingError)throw new ConflictException({code:'VOUCHER_MAPPING_REQUIRES_REVIEW',message:error.message});throw error;
    }
    const saved=await this.vouchers.save({id:randomUUID(),tenantId:context.tenantId,companyId,actorId:context.actorId,traceId:context.traceId,voucher,entryIds:voucher.entries.map(()=>randomUUID()),createdAt:new Date()});
    return{voucher:saved,generated:true};
  }

  async list(companyId:string,context:RequestContext){if(!context.tenantId)throw new NotFoundException('Company not found');return this.vouchers.list(context.tenantId,companyId);}

  async confirm(companyId:string,voucherId:string,expectedVersion:number,context:RequestContext){if(!context.tenantId)throw new NotFoundException('Voucher not found');const setup=await this.requireSetup(context.tenantId,companyId);assertAccountingPeriodOpen(setup);const voucher=await this.vouchers.findById(context.tenantId,companyId,voucherId);if(!voucher)throw new NotFoundException('Voucher not found');try{confirmVoucher(voucher,expectedVersion);}catch(error:unknown){if(error instanceof AccountingError)throw new ConflictException({code:'VOUCHER_CONFIRM_CONFLICT',message:error.message});throw error;}const saved=await this.vouchers.confirm({tenantId:context.tenantId,companyId,voucherId,expectedVersion,actorId:context.actorId,traceId:context.traceId,confirmedAt:new Date()});if(!saved)throw new ConflictException({code:'VOUCHER_CONFIRM_CONFLICT',message:'Voucher changed; refresh before confirming'});return saved;}

  async reverse(companyId:string,voucherId:string,input:{readonly reversalDate:string;readonly reason:string;readonly expectedVersion:number},context:RequestContext){if(!context.tenantId)throw new NotFoundException('Voucher not found');const setup=await this.requireSetup(context.tenantId,companyId);assertAccountingPeriodOpen(setup);if(input.reversalDate<setup.periodStart||input.reversalDate>setup.periodEnd)throw new ConflictException({code:'REVERSAL_OUTSIDE_OPEN_PERIOD',message:'Reversal date must be inside the open accounting period'});const original=await this.vouchers.findById(context.tenantId,companyId,voucherId);if(!original)throw new NotFoundException('Voucher not found');let reversal;try{reversal=createReversalVoucher(original,input.reversalDate,input.reason);}catch(error:unknown){if(error instanceof AccountingError)throw new ConflictException({code:'VOUCHER_REVERSAL_CONFLICT',message:error.message});throw error;}const saved=await this.vouchers.reverse({tenantId:context.tenantId,companyId,originalVoucherId:voucherId,expectedVersion:input.expectedVersion,actorId:context.actorId,traceId:context.traceId,reversedAt:new Date(),reversalId:randomUUID(),reversalEntryIds:reversal.entries.map(()=>randomUUID()),reversal});if(!saved)throw new ConflictException({code:'VOUCHER_REVERSAL_CONFLICT',message:'Voucher changed or already has a reversal'});return saved;}

  async ledger(companyId:string,context:RequestContext){if(!context.tenantId)throw new NotFoundException('Company not found');const setup=await this.requireSetup(context.tenantId,companyId),items=await this.vouchers.list(context.tenantId,companyId);const posted=items.filter(item=>item.status===VoucherStatus.Confirmed||item.status===VoucherStatus.Reversed);const rows=new Map<string,{accountCode:string;accountName:string;openingDebit:Money;openingCredit:Money;debit:Money;credit:Money}>();for(const account of v1ChartOfAccounts())rows.set(account.code,{accountCode:account.code,accountName:account.name,openingDebit:Money.zero(),openingCredit:Money.zero(),debit:Money.zero(),credit:Money.zero()});for(const entry of setup.openingEntries){const row=rows.get(entry.accountCode)??{accountCode:entry.accountCode,accountName:entry.accountName,openingDebit:Money.zero(),openingCredit:Money.zero(),debit:Money.zero(),credit:Money.zero()},amount=Money.from(entry.amount);rows.set(entry.accountCode,{...row,[entry.side==='debit'?'openingDebit':'openingCredit']:row[entry.side==='debit'?'openingDebit':'openingCredit'].add(amount)});}for(const voucher of posted)for(const entry of voucher.entries){const row=rows.get(entry.accountCode)??{accountCode:entry.accountCode,accountName:entry.accountName,openingDebit:Money.zero(),openingCredit:Money.zero(),debit:Money.zero(),credit:Money.zero()};rows.set(entry.accountCode,{...row,[entry.side]:row[entry.side].add(entry.amount)});}const trialBalance=[...rows.values()].filter(row=>!row.openingDebit.equals(Money.zero())||!row.openingCredit.equals(Money.zero())||!row.debit.equals(Money.zero())||!row.credit.equals(Money.zero())).map(row=>{const net=row.openingDebit.subtract(row.openingCredit).add(row.debit).subtract(row.credit);return{accountCode:row.accountCode,accountName:row.accountName,openingDebit:row.openingDebit.toString(),openingCredit:row.openingCredit.toString(),debitMovement:row.debit.toString(),creditMovement:row.credit.toString(),endingDebit:net.isNegative()?'0.00':net.toString(),endingCredit:net.isNegative()?Money.zero().subtract(net).toString():'0.00'};});const journal=posted.flatMap(voucher=>voucher.entries.map(entry=>({voucherId:voucher.id,voucherDate:voucher.voucherDate,summary:voucher.summary,status:voucher.status,reversalOfVoucherId:voucher.reversalOfVoucherId,accountCode:entry.accountCode,accountName:entry.accountName,side:entry.side,amount:entry.amount.toString()})));return{period:{start:setup.periodStart,end:setup.periodEnd,status:setup.periodStatus},openingBalance:{accountName:setup.accountName,amount:setup.openingBalance,source:setup.openingBalanceSource,asOf:setup.openingBalanceAsOf,includedInTrialBalance:true,entries:setup.openingEntries},journal,trialBalance};}

  async lockPeriod(companyId:string,context:RequestContext){if(!context.tenantId)throw new NotFoundException('Accounting period not found');const setup=await this.requireSetup(context.tenantId,companyId);if(setup.periodStatus==='locked')return setup;const drafts=(await this.vouchers.list(context.tenantId,companyId)).filter(item=>item.status===VoucherStatus.Draft);if(drafts.length>0)throw new ConflictException({code:'DRAFT_VOUCHERS_EXIST',message:'Confirm or remove all draft vouchers before locking the period',details:{draftCount:drafts.length}});const locked=await this.setups.lockCurrentPeriod({tenantId:context.tenantId,companyId,actorId:context.actorId,traceId:context.traceId,lockedAt:new Date()});if(!locked)throw new NotFoundException('Accounting period not found');return locked;}

  private async requireSetup(tenantId:string,companyId:string){const setup=await this.setups.find(tenantId,companyId);if(!setup)throw new ConflictException({code:'LEDGER_SETUP_REQUIRED',message:'Ledger setup is required'});return setup;}
}
