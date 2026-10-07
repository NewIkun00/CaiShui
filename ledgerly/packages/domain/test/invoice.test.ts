import { describe, expect, it } from 'vitest';
import {
  confirmInvoice, createInvoice, InvoiceColor, InvoiceDirection, InvoiceKind, InvoiceStatus,
} from '../src/index.js';

const input = {
  direction: InvoiceDirection.Output, kind: InvoiceKind.Ordinary, color: InvoiceColor.Blue,
  invoiceNumber: ' 1234-5678 ', issuedOn: '2026-10-08', counterpartyId: 'party-1',
  amountExcludingTax: '1000.00', taxAmount: '60.00', totalAmount: '1060.00',
};

describe('invoice', () => {
  it('normalizes the number and confirms a balanced invoice', () => {
    const draft = createInvoice(input, 'mock_ocr');
    expect(draft.invoiceNumber).toBe('12345678');
    expect(draft.status).toBe(InvoiceStatus.Draft);
    const confirmed = confirmInvoice(draft, 'user-1', new Date('2026-10-09T00:00:00Z'));
    expect(confirmed.status).toBe(InvoiceStatus.Confirmed);
    expect(confirmed.version).toBe(2);
  });

  it('rejects a total that does not match net plus tax', () => {
    expect(() => createInvoice({ ...input, totalAmount: '1060.01' })).toThrow('must equal');
  });

  it('rejects negative amounts', () => {
    expect(() => createInvoice({ ...input, taxAmount: '-1.00', totalAmount: '999.00' })).toThrow('cannot be negative');
  });
});
