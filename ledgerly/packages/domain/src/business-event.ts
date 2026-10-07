import { Money } from './money.js';
import { TaxPeriod } from './tax-period.js';

export enum BusinessEventType {
  ServiceCompleted = 'service_completed',
  InvoiceIssued = 'invoice_issued',
  MoneyReceived = 'money_received',
  ExpenseIncurred = 'expense_incurred',
  MoneyPaid = 'money_paid',
  CapitalContribution = 'capital_contribution',
  ShareholderAdvance = 'shareholder_advance',
}

export enum BusinessEventStatus {
  Draft = 'draft',
  Confirmed = 'confirmed',
}

export class BusinessEventError extends Error {
  override readonly name = 'BusinessEventError';
}

export interface BusinessEventInput {
  readonly type: BusinessEventType;
  readonly occurredOn: string;
  readonly amount: string;
  readonly counterpartyId?: string | undefined;
  readonly description: string;
}

export interface BusinessEvent {
  readonly type: BusinessEventType;
  readonly occurredOn: string;
  readonly amount: Money;
  readonly counterpartyId?: string | undefined;
  readonly description: string;
  readonly source: 'manual' | 'import';
  readonly status: BusinessEventStatus;
  readonly version: number;
  readonly confirmedAt?: Date | undefined;
  readonly confirmedBy?: string | undefined;
}

const requiresCounterparty = new Set<BusinessEventType>([
  BusinessEventType.ServiceCompleted,
  BusinessEventType.InvoiceIssued,
  BusinessEventType.MoneyReceived,
  BusinessEventType.ExpenseIncurred,
  BusinessEventType.MoneyPaid,
  BusinessEventType.CapitalContribution,
  BusinessEventType.ShareholderAdvance,
]);

export function createBusinessEvent(input: BusinessEventInput, source: 'manual' | 'import' = 'manual'): BusinessEvent {
  TaxPeriod.create(input.occurredOn, input.occurredOn);
  const amount = Money.from(input.amount);
  if (amount.equals(Money.zero()) || input.amount.startsWith('-')) {
    throw new BusinessEventError('Business event amount must be greater than zero');
  }
  if (requiresCounterparty.has(input.type) && !input.counterpartyId) {
    throw new BusinessEventError('This business event requires a counterparty');
  }
  const description = input.description.trim();
  if (!description) throw new BusinessEventError('Description is required');
  return Object.freeze({
    type: input.type,
    occurredOn: input.occurredOn,
    amount,
    counterpartyId: input.counterpartyId,
    description,
    source,
    status: BusinessEventStatus.Draft,
    version: 1,
  });
}

export function confirmBusinessEvent(event: BusinessEvent, actorId: string, now: Date): BusinessEvent {
  if (event.status !== BusinessEventStatus.Draft) {
    throw new BusinessEventError('Only draft business events can be confirmed');
  }
  return Object.freeze({
    ...event,
    status: BusinessEventStatus.Confirmed,
    version: event.version + 1,
    confirmedAt: now,
    confirmedBy: actorId,
  });
}
