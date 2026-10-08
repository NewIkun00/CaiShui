import { BusinessEventStatus, BusinessEventType, type BusinessEvent } from './business-event.js';
import { InvoiceDirection, InvoiceStatus, type Invoice } from './invoice.js';
import { Money } from './money.js';

export interface SettlementInput {
  readonly invoiceId:string;readonly paymentEventId:string;readonly amount:string;
  readonly invoice:Invoice;readonly paymentEvent:BusinessEvent;
  readonly invoiceAllocated:string;readonly paymentAllocated:string;
}
export interface Settlement {readonly invoiceId:string;readonly paymentEventId:string;readonly amount:Money;}
export class ReconciliationError extends Error{override readonly name='ReconciliationError';}

export enum ReconciliationCheckGrade{Green='green',Yellow='yellow',Red='red'}
export enum ReconciliationIssueTriageStatus{Open='open',Investigating='investigating',NeedsDocuments='needs_documents',ReadyForRecheck='ready_for_recheck'}
export type ReconciliationIssueCode='INVOICE_OUTSTANDING'|'PAYMENT_UNALLOCATED';
export interface ReconciliationCheckInvoice{readonly invoiceId:string;readonly invoiceNumber:string;readonly outstandingAmount:string;}
export interface ReconciliationCheckPayment{readonly paymentEventId:string;readonly description:string;readonly unallocatedAmount:string;}
export interface ReconciliationCheckIssue{
  readonly code:ReconciliationIssueCode;readonly severity:'yellow';readonly subjectType:'invoice'|'payment';
  readonly subjectId:string;readonly amount:string;readonly message:string;readonly suggestedAction:string;
}
export interface ReconciliationCheckResult{
  readonly grade:ReconciliationCheckGrade;readonly blocksFiling:boolean;
  readonly totalIssues:number;readonly yellowIssues:number;readonly redIssues:number;
  readonly issues:readonly ReconciliationCheckIssue[];
}

export function runReconciliationChecks(input:{readonly invoices:readonly ReconciliationCheckInvoice[];readonly payments:readonly ReconciliationCheckPayment[]}):ReconciliationCheckResult{
  const invoiceIssues=input.invoices.filter(item=>Money.from(item.outstandingAmount).isGreaterThan(Money.zero())).map(item=>Object.freeze({
    code:'INVOICE_OUTSTANDING' as const,severity:'yellow' as const,subjectType:'invoice' as const,subjectId:item.invoiceId,
    amount:Money.from(item.outstandingAmount).toString(),message:`发票 ${item.invoiceNumber} 仍有未核销余额`,suggestedAction:'匹配同一往来方的收付款；缺少资金记录时补充资料后重新检查。',
  }));
  const paymentIssues=input.payments.filter(item=>Money.from(item.unallocatedAmount).isGreaterThan(Money.zero())).map(item=>Object.freeze({
    code:'PAYMENT_UNALLOCATED' as const,severity:'yellow' as const,subjectType:'payment' as const,subjectId:item.paymentEventId,
    amount:Money.from(item.unallocatedAmount).toString(),message:`收付款“${item.description}”仍有未分配余额`,suggestedAction:'匹配同一往来方且方向一致的发票；缺少票据时补充资料后重新检查。',
  }));
  const issues=[...invoiceIssues,...paymentIssues].sort((left,right)=>left.subjectId.localeCompare(right.subjectId));
  return Object.freeze({grade:issues.length===0?ReconciliationCheckGrade.Green:ReconciliationCheckGrade.Yellow,blocksFiling:issues.length>0,totalIssues:issues.length,yellowIssues:issues.length,redIssues:0,issues});
}

export function assertReconciliationTriageTransition(current:ReconciliationIssueTriageStatus,next:ReconciliationIssueTriageStatus):void{
  const allowed:Readonly<Record<ReconciliationIssueTriageStatus,readonly ReconciliationIssueTriageStatus[]>>={
    [ReconciliationIssueTriageStatus.Open]:[ReconciliationIssueTriageStatus.Investigating,ReconciliationIssueTriageStatus.NeedsDocuments],
    [ReconciliationIssueTriageStatus.Investigating]:[ReconciliationIssueTriageStatus.NeedsDocuments,ReconciliationIssueTriageStatus.ReadyForRecheck],
    [ReconciliationIssueTriageStatus.NeedsDocuments]:[ReconciliationIssueTriageStatus.Investigating,ReconciliationIssueTriageStatus.ReadyForRecheck],
    [ReconciliationIssueTriageStatus.ReadyForRecheck]:[ReconciliationIssueTriageStatus.Investigating,ReconciliationIssueTriageStatus.NeedsDocuments],
  };
  if(!allowed[current].includes(next))throw new ReconciliationError(`Invalid reconciliation triage transition: ${current} -> ${next}`);
}

export function createSettlement(input:SettlementInput):Settlement{
  if(input.invoice.status!==InvoiceStatus.Confirmed)throw new ReconciliationError('Invoice must be confirmed');
  if(input.paymentEvent.status!==BusinessEventStatus.Confirmed)throw new ReconciliationError('Payment event must be confirmed');
  const expected=input.invoice.direction===InvoiceDirection.Output?BusinessEventType.MoneyReceived:BusinessEventType.MoneyPaid;
  if(input.paymentEvent.type!==expected)throw new ReconciliationError('Invoice direction does not match payment direction');
  if(input.invoice.counterpartyId!==input.paymentEvent.counterpartyId)throw new ReconciliationError('Invoice and payment must use the same counterparty');
  const amount=Money.from(input.amount);if(amount.equals(Money.zero())||amount.isNegative())throw new ReconciliationError('Settlement amount must be greater than zero');
  const invoiceRemaining=input.invoice.totalAmount.subtract(Money.from(input.invoiceAllocated));
  const paymentRemaining=input.paymentEvent.amount.subtract(Money.from(input.paymentAllocated));
  if(amount.isGreaterThan(invoiceRemaining))throw new ReconciliationError('Settlement exceeds invoice outstanding amount');
  if(amount.isGreaterThan(paymentRemaining))throw new ReconciliationError('Settlement exceeds payment unallocated amount');
  return Object.freeze({invoiceId:input.invoiceId,paymentEventId:input.paymentEventId,amount});
}
