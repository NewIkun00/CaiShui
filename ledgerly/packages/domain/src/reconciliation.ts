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
export type ReconciliationIssueCode='INVOICE_OUTSTANDING'|'PAYMENT_UNALLOCATED'|'ACCOUNT_BALANCE_ROLLFORWARD_MISMATCH'|'TRIAL_BALANCE_UNBALANCED'|'BANK_STATEMENT_MISSING'|'BANK_LEDGER_BALANCE_MISMATCH'|'RECEIVABLE_LEDGER_MISMATCH'|'PAYABLE_LEDGER_MISMATCH';
export interface ReconciliationCheckInvoice{readonly invoiceId:string;readonly invoiceNumber:string;readonly outstandingAmount:string;}
export interface ReconciliationCheckPayment{readonly paymentEventId:string;readonly description:string;readonly unallocatedAmount:string;}
export interface ReconciliationCheckAccount{
  readonly accountCode:string;readonly accountName:string;readonly openingDebit:string;readonly openingCredit:string;
  readonly debitMovement:string;readonly creditMovement:string;readonly endingDebit:string;readonly endingCredit:string;
}
export interface ReconciliationCheckBankAccount{readonly accountId:string;readonly accountName:string;readonly ledgerAccountCode:string;readonly ledgerEndingBalance:string;readonly statementBalance?:string|undefined;readonly statementBatchId?:string|undefined;}
export interface ReconciliationCheckSubledger{readonly kind:'receivable'|'payable';readonly accountCode:'1122'|'2202';readonly subledgerBalance:string;readonly ledgerBalance:string;}
export interface ReconciliationCheckIssue{
  readonly code:ReconciliationIssueCode;readonly severity:'yellow'|'red';readonly subjectType:'invoice'|'payment'|'account'|'ledger'|'subledger';
  readonly subjectId:string;readonly amount:string;readonly message:string;readonly suggestedAction:string;
}
export interface ReconciliationCheckResult{
  readonly grade:ReconciliationCheckGrade;readonly blocksFiling:boolean;
  readonly totalIssues:number;readonly yellowIssues:number;readonly redIssues:number;
  readonly issues:readonly ReconciliationCheckIssue[];
}

export function runReconciliationChecks(input:{readonly periodId?:string;readonly invoices:readonly ReconciliationCheckInvoice[];readonly payments:readonly ReconciliationCheckPayment[];readonly accounts?:readonly ReconciliationCheckAccount[];readonly bankAccounts?:readonly ReconciliationCheckBankAccount[];readonly subledgers?:readonly ReconciliationCheckSubledger[]}):ReconciliationCheckResult{
  const invoiceIssues=input.invoices.filter(item=>Money.from(item.outstandingAmount).isGreaterThan(Money.zero())).map(item=>Object.freeze({
    code:'INVOICE_OUTSTANDING' as const,severity:'yellow' as const,subjectType:'invoice' as const,subjectId:item.invoiceId,
    amount:Money.from(item.outstandingAmount).toString(),message:`发票 ${item.invoiceNumber} 仍有未核销余额`,suggestedAction:'匹配同一往来方的收付款；缺少资金记录时补充资料后重新检查。',
  }));
  const paymentIssues=input.payments.filter(item=>Money.from(item.unallocatedAmount).isGreaterThan(Money.zero())).map(item=>Object.freeze({
    code:'PAYMENT_UNALLOCATED' as const,severity:'yellow' as const,subjectType:'payment' as const,subjectId:item.paymentEventId,
    amount:Money.from(item.unallocatedAmount).toString(),message:`收付款“${item.description}”仍有未分配余额`,suggestedAction:'匹配同一往来方且方向一致的发票；缺少票据时补充资料后重新检查。',
  }));
  const accounts=input.accounts??[];
  const signed=(debit:string,credit:string)=>Money.from(debit).subtract(Money.from(credit));
  const absolute=(amount:Money)=>amount.isNegative()?Money.zero().subtract(amount):amount;
  const accountIssues=accounts.flatMap(item=>{
    const expected=signed(item.openingDebit,item.openingCredit).add(signed(item.debitMovement,item.creditMovement));
    const actual=signed(item.endingDebit,item.endingCredit),difference=actual.subtract(expected);
    return difference.equals(Money.zero())?[]:[Object.freeze({
      code:'ACCOUNT_BALANCE_ROLLFORWARD_MISMATCH' as const,severity:'red' as const,subjectType:'account' as const,subjectId:item.accountCode,
      amount:absolute(difference).toString(),message:`科目 ${item.accountCode} ${item.accountName} 的期初余额加本期发生不等于期末余额`,suggestedAction:'核对期初余额、已确认凭证和冲销凭证，并重新生成账簿快照。',
    })];
  });
  const sum=(field:keyof Pick<ReconciliationCheckAccount,'openingDebit'|'openingCredit'|'debitMovement'|'creditMovement'|'endingDebit'|'endingCredit'>)=>accounts.reduce((total,item)=>total.add(Money.from(item[field])),Money.zero());
  const openingDifference=sum('openingDebit').subtract(sum('openingCredit'));
  const movementDifference=sum('debitMovement').subtract(sum('creditMovement'));
  const endingDifference=sum('endingDebit').subtract(sum('endingCredit'));
  const imbalance=[openingDifference,movementDifference,endingDifference].reduce((largest,item)=>absolute(item).isGreaterThan(largest)?absolute(item):largest,Money.zero());
  const trialBalanceIssues=imbalance.equals(Money.zero())?[]:[Object.freeze({
    code:'TRIAL_BALANCE_UNBALANCED' as const,severity:'red' as const,subjectType:'ledger' as const,subjectId:input.periodId??'current-period',amount:imbalance.toString(),
    message:'试算平衡不成立：期初、本期发生额或期末余额的借贷合计存在差额',suggestedAction:'停止结账与申报，核对期初余额和已确认凭证的借贷完整性。',
  })];
  const bankIssues:ReconciliationCheckIssue[]=[];
  for(const item of input.bankAccounts??[]){
    if(item.statementBalance===undefined){bankIssues.push(Object.freeze({code:'BANK_STATEMENT_MISSING',severity:'yellow',subjectType:'account',subjectId:item.accountId,amount:'0.00',message:`资金账户“${item.accountName}”缺少本期间已确认的银行对账单`,suggestedAction:'上传覆盖完整会计期间的银行对账单并确认后重新检查。'}));continue}
    const difference=Money.from(item.statementBalance).subtract(Money.from(item.ledgerEndingBalance));
    if(!difference.equals(Money.zero()))bankIssues.push(Object.freeze({code:'BANK_LEDGER_BALANCE_MISMATCH',severity:'red',subjectType:'account',subjectId:item.accountId,amount:absolute(difference).toString(),message:`资金账户“${item.accountName}”的银行余额与总账 ${item.ledgerAccountCode} 余额不一致`,suggestedAction:'逐笔核对未入账流水、重复凭证、截止日期和银行手续费，修正事实后重新检查。'}));
  }
  const subledgerIssues:ReconciliationCheckIssue[]=[];
  for(const item of input.subledgers??[]){
    const difference=Money.from(item.subledgerBalance).subtract(Money.from(item.ledgerBalance));
    if(difference.equals(Money.zero()))continue;
    const receivable=item.kind==='receivable';
    subledgerIssues.push(Object.freeze({code:receivable?'RECEIVABLE_LEDGER_MISMATCH':'PAYABLE_LEDGER_MISMATCH',severity:'red',subjectType:'subledger',subjectId:item.kind,amount:absolute(difference).toString(),message:`${receivable?'应收':'应付'}核销明细余额与总账 ${item.accountCode} 不一致`,suggestedAction:`核对${receivable?'销项':'进项'}发票、核销记录及对应业务事项凭证，修正或补充入账后重新检查。`}));
  }
  const issues=[...invoiceIssues,...paymentIssues,...accountIssues,...trialBalanceIssues,...bankIssues,...subledgerIssues].sort((left,right)=>left.subjectId.localeCompare(right.subjectId)||left.code.localeCompare(right.code));
  const redIssues=issues.filter(item=>item.severity==='red').length,yellowIssues=issues.length-redIssues;
  return Object.freeze({grade:redIssues>0?ReconciliationCheckGrade.Red:yellowIssues>0?ReconciliationCheckGrade.Yellow:ReconciliationCheckGrade.Green,blocksFiling:issues.length>0,totalIssues:issues.length,yellowIssues,redIssues,issues});
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
