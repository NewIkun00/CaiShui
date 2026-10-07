import type { InvoiceColor, InvoiceDirection, InvoiceKind } from '@ledgerly/domain';

export interface InvoiceExtractionCandidate {
  readonly direction?: InvoiceDirection;
  readonly kind?: InvoiceKind;
  readonly color?: InvoiceColor;
  readonly invoiceNumber?: string;
  readonly issuedOn?: string;
  readonly counterpartyName?: string;
  readonly amountExcludingTax?: string;
  readonly taxAmount?: string;
  readonly totalAmount?: string;
  readonly remarks?: string;
}

export interface InvoiceExtraction {
  readonly candidate: InvoiceExtractionCandidate;
  readonly confidence: number;
  readonly warnings: readonly string[];
  readonly provider: 'deterministic-mock-v1';
  readonly requiresConfirmation: true;
}

export const INVOICE_EXTRACTION_PROVIDER = Symbol('INVOICE_EXTRACTION_PROVIDER');
export interface InvoiceExtractionProvider { extract(text: string): Promise<InvoiceExtraction>; }
