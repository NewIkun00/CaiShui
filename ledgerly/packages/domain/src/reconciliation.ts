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
