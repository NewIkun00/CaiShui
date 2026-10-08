import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ReconciliationIssueTriageInput, SettlementInputRequest } from '@ledgerly/contracts';
import {
  assertReconciliationTriageTransition, BusinessEventStatus, BusinessEventType, createSettlement,
  InvoiceStatus, Money, ReconciliationError, ReconciliationIssueTriageStatus, runReconciliationChecks,
} from '@ledgerly/domain';
import { createHash, randomUUID } from 'node:crypto';
import { BUSINESS_EVENT_STORE, type BusinessEventStore } from '../../business-event/application/business-event-store.js';
import { buildLedger } from '../../accounting/application/build-ledger.js';
import { VOUCHER_STORE, type VoucherStore } from '../../accounting/application/voucher-store.js';
import { INVOICE_STORE, type InvoiceStore } from '../../invoice/application/invoice-store.js';
import { assertAccountingPeriodOpen } from '../../ledger-setup/application/accounting-period-guard.js';
import { LEDGER_SETUP_STORE, type LedgerSetupStore } from '../../ledger-setup/application/ledger-setup-store.js';
import type { RequestContext } from '../../organization/application/organization.service.js';
import {
  RECONCILIATION_CHECK_STORE, type ReconciliationCheckStore, type SavedReconciliationCheckRun,
} from './reconciliation-check-store.js';
import { SETTLEMENT_STORE, type SettlementStore } from './settlement-store.js';

@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(INVOICE_STORE) private readonly invoices: InvoiceStore,
    @Inject(BUSINESS_EVENT_STORE) private readonly events: BusinessEventStore,
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(LEDGER_SETUP_STORE) private readonly ledgerSetups: LedgerSetupStore,
    @Inject(RECONCILIATION_CHECK_STORE) private readonly checks: ReconciliationCheckStore,
    @Inject(VOUCHER_STORE) private readonly vouchers: VoucherStore,
  ) {}

  async create(companyId: string, input: SettlementInputRequest, context: RequestContext) {
    if (!context.tenantId) throw new NotFoundException('Company not found');
    const setup = await this.ledgerSetups.find(context.tenantId, companyId);
    if (!setup) throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    assertAccountingPeriodOpen(setup);
    if (await this.settlements.exists(context.tenantId, companyId, input.invoiceId, input.paymentEventId)) {
      throw new ConflictException({ code: 'SETTLEMENT_EXISTS', message: 'This invoice and payment are already linked' });
    }
    const [invoice, payment, invoiceAllocated, paymentAllocated] = await Promise.all([
      this.invoices.find(context.tenantId, companyId, input.invoiceId),
      this.events.find(context.tenantId, companyId, input.paymentEventId),
      this.settlements.allocatedForInvoice(context.tenantId, companyId, input.invoiceId),
      this.settlements.allocatedForPayment(context.tenantId, companyId, input.paymentEventId),
    ]);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!payment) throw new NotFoundException('Payment event not found');
    let settlement;
    try {
      settlement = createSettlement({ invoiceId: invoice.id, paymentEventId: payment.id, amount: input.amount,
        invoice, paymentEvent: payment, invoiceAllocated: invoiceAllocated.toString(),
        paymentAllocated: paymentAllocated.toString() });
    } catch (error: unknown) {
      if (error instanceof ReconciliationError) {
        throw new BadRequestException({ code: 'INVALID_SETTLEMENT', message: error.message });
      }
      throw error;
    }
    const saved = await this.settlements.save({ id: randomUUID(), tenantId: context.tenantId, companyId,
      actorId: context.actorId, traceId: context.traceId, settlement, invoiceTotal: invoice.totalAmount,
      paymentTotal: payment.amount, createdAt: new Date() });
    if (!saved) throw new ConflictException({ code: 'SETTLEMENT_CONFLICT', message: 'Outstanding amount changed; reload and retry' });
    return saved;
  }

  async overview(companyId: string, context: RequestContext) {
    if (!context.tenantId) throw new NotFoundException('Company not found');
    const [invoices, events, settlements] = await Promise.all([
      this.invoices.list(context.tenantId, companyId), this.events.list(context.tenantId, companyId),
      this.settlements.list(context.tenantId, companyId),
    ]);
    const confirmedInvoices = invoices.filter((item) => item.status === InvoiceStatus.Confirmed);
    const payments = events.filter((item) => item.status === BusinessEventStatus.Confirmed
      && (item.type === BusinessEventType.MoneyReceived || item.type === BusinessEventType.MoneyPaid));
    const allocatedInvoice = (id: string) => settlements.filter((item) => item.invoiceId === id)
      .reduce((sum, item) => sum.add(item.amount), Money.zero());
    const allocatedPayment = (id: string) => settlements.filter((item) => item.paymentEventId === id)
      .reduce((sum, item) => sum.add(item.amount), Money.zero());
    return {
      invoices: confirmedInvoices.map((item) => {
        const allocated = allocatedInvoice(item.id); const outstanding = item.totalAmount.subtract(allocated);
        return { invoiceId: item.id, direction: item.direction, invoiceNumber: item.invoiceNumber,
          issuedOn: item.issuedOn, counterpartyId: item.counterpartyId, totalAmount: item.totalAmount.toString(),
          allocatedAmount: allocated.toString(), outstandingAmount: outstanding.toString(),
          status: outstanding.equals(Money.zero()) ? 'settled' as const : 'open' as const };
      }),
      payments: payments.map((item) => {
        const allocated = allocatedPayment(item.id); const unallocated = item.amount.subtract(allocated);
        return { paymentEventId: item.id, type: item.type as BusinessEventType.MoneyReceived | BusinessEventType.MoneyPaid,
          occurredOn: item.occurredOn, counterpartyId: item.counterpartyId!, description: item.description,
          totalAmount: item.amount.toString(), allocatedAmount: allocated.toString(), unallocatedAmount: unallocated.toString(),
          status: unallocated.equals(Money.zero()) ? 'settled' as const : 'open' as const };
      }),
      settlements,
    };
  }

  async runCheck(companyId:string,context:RequestContext):Promise<SavedReconciliationCheckRun>{
    if(!context.tenantId)throw new NotFoundException('Company not found');
    const setup=await this.ledgerSetups.find(context.tenantId,companyId);
    if(!setup)throw new ConflictException({code:'LEDGER_SETUP_REQUIRED',message:'Ledger setup is required'});
    const [overview,vouchers]=await Promise.all([this.overview(companyId,context),this.vouchers.list(context.tenantId,companyId)]);
    const ledger=buildLedger(setup,vouchers);
    const snapshot={
      invoices:overview.invoices.map(item=>({invoiceId:item.invoiceId,invoiceNumber:item.invoiceNumber,outstandingAmount:item.outstandingAmount})).sort((a,b)=>a.invoiceId.localeCompare(b.invoiceId)),
      payments:overview.payments.map(item=>({paymentEventId:item.paymentEventId,description:item.description,unallocatedAmount:item.unallocatedAmount})).sort((a,b)=>a.paymentEventId.localeCompare(b.paymentEventId)),
      accounts:[...ledger.trialBalance].sort((a,b)=>a.accountCode.localeCompare(b.accountCode)),
    };
    const result=runReconciliationChecks({...snapshot,periodId:setup.periodId}),createdAt=new Date();
    return this.checks.save({run:{id:randomUUID(),tenantId:context.tenantId,companyId,periodId:setup.periodId,
      periodStart:setup.periodStart,periodEnd:setup.periodEnd,inputSnapshot:snapshot,
      inputHash:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      grade:result.grade,blocksFiling:result.blocksFiling,totalIssues:result.totalIssues,yellowIssues:result.yellowIssues,
      redIssues:result.redIssues,issues:result.issues.map(issue=>({id:randomUUID(),...issue,
        triageStatus:ReconciliationIssueTriageStatus.Open,triageVersion:1})),createdAt,createdBy:context.actorId},
    traceId:context.traceId});
  }

  async latestCheck(companyId:string,context:RequestContext):Promise<SavedReconciliationCheckRun>{
    if(!context.tenantId)throw new NotFoundException('Reconciliation check not found');
    const run=await this.checks.latest(context.tenantId,companyId);
    if(!run)throw new NotFoundException('Reconciliation check not found');return run;
  }

  async triageIssue(companyId:string,runId:string,issueId:string,input:ReconciliationIssueTriageInput,context:RequestContext){
    if(!context.tenantId)throw new NotFoundException('Reconciliation issue not found');
    const run=await this.checks.find(context.tenantId,companyId,runId),issue=run?.issues.find(item=>item.id===issueId);
    if(!run||!issue)throw new NotFoundException('Reconciliation issue not found');
    try{assertReconciliationTriageTransition(issue.triageStatus,input.status as Exclude<ReconciliationIssueTriageStatus,ReconciliationIssueTriageStatus.Open>)}
    catch(error:unknown){if(error instanceof ReconciliationError)throw new BadRequestException({code:'INVALID_TRIAGE_TRANSITION',message:error.message});throw error}
    const result=await this.checks.triage({tenantId:context.tenantId,companyId,runId,issueId,
      status:input.status as Exclude<ReconciliationIssueTriageStatus,ReconciliationIssueTriageStatus.Open>,note:input.note,
      expectedVersion:input.expectedVersion,actorId:context.actorId,traceId:context.traceId,triagedAt:new Date()});
    if(result.outcome==='not_found')throw new NotFoundException('Reconciliation issue not found');
    if(result.outcome==='conflict')throw new ConflictException({code:'TRIAGE_VERSION_CONFLICT',message:'Issue changed; reload and retry'});
    return result.issue;
  }
}
