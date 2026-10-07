import { Money } from './money.js';
import { TaxPeriod } from './tax-period.js';

export enum InvoiceDirection {
  Input = 'input',
  Output = 'output',
}

export enum InvoiceKind {
  Ordinary = 'ordinary',
  Special = 'special',
}

export enum InvoiceColor {
  Blue = 'blue',
  Red = 'red',
}

export enum InvoiceStatus {
  Draft = 'draft',
  Confirmed = 'confirmed',
}

export type InvoiceSource = 'manual' | 'mock_ocr';

export interface InvoiceInput {
  readonly direction: InvoiceDirection;
  readonly kind: InvoiceKind;
  readonly color: InvoiceColor;
  readonly invoiceNumber: string;
  readonly issuedOn: string;
  readonly counterpartyId: string;
  readonly amountExcludingTax: string;
  readonly taxAmount: string;
  readonly totalAmount: string;
  readonly remarks?: string | undefined;
}

export interface Invoice {
  readonly direction: InvoiceDirection;
  readonly kind: InvoiceKind;
  readonly color: InvoiceColor;
  readonly invoiceNumber: string;
  readonly issuedOn: string;
  readonly counterpartyId: string;
  readonly amountExcludingTax: Money;
  readonly taxAmount: Money;
  readonly totalAmount: Money;
  readonly remarks?: string | undefined;
  readonly source: InvoiceSource;
  readonly status: InvoiceStatus;
  readonly version: number;
  readonly confirmedAt?: Date | undefined;
  readonly confirmedBy?: string | undefined;
}

export class InvoiceError extends Error {
  override readonly name = 'InvoiceError';
}

export function normalizeInvoiceNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function createInvoice(input: InvoiceInput, source: InvoiceSource = 'manual'): Invoice {
  TaxPeriod.create(input.issuedOn, input.issuedOn);
  const invoiceNumber = normalizeInvoiceNumber(input.invoiceNumber);
  if (!/^[0-9A-Z]{8,30}$/.test(invoiceNumber)) {
    throw new InvoiceError('Invoice number must contain 8 to 30 letters or digits');
  }
  if (!input.counterpartyId.trim()) throw new InvoiceError('Counterparty is required');
  const amountExcludingTax = nonNegativeMoney(input.amountExcludingTax, 'Amount excluding tax');
  const taxAmount = nonNegativeMoney(input.taxAmount, 'Tax amount');
  const totalAmount = nonNegativeMoney(input.totalAmount, 'Total amount');
  if (totalAmount.equals(Money.zero())) throw new InvoiceError('Total amount must be greater than zero');
  if (!amountExcludingTax.add(taxAmount).equals(totalAmount)) {
    throw new InvoiceError('Total amount must equal amount excluding tax plus tax amount');
  }
  const remarks = input.remarks?.trim();
  return Object.freeze({
    ...input, invoiceNumber, amountExcludingTax, taxAmount, totalAmount,
    ...(remarks ? { remarks } : {}), source, status: InvoiceStatus.Draft, version: 1,
  });
}

export function confirmInvoice(invoice: Invoice, actorId: string, now: Date): Invoice {
  if (invoice.status !== InvoiceStatus.Draft) throw new InvoiceError('Only draft invoices can be confirmed');
  return Object.freeze({
    ...invoice, status: InvoiceStatus.Confirmed, version: invoice.version + 1,
    confirmedAt: now, confirmedBy: actorId,
  });
}

function nonNegativeMoney(value: string, label: string): Money {
  const money = Money.from(value);
  if (value.trim().startsWith('-')) throw new InvoiceError(`${label} cannot be negative`);
  return money;
}
