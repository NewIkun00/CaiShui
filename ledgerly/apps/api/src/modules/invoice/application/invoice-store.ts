import type { Invoice, InvoiceDirection } from '@ledgerly/domain';

export interface SavedInvoice extends Invoice {
  readonly id: string;
  readonly companyId: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface SaveInvoiceRecord {
  readonly id: string; readonly tenantId: string; readonly companyId: string;
  readonly actorId: string; readonly traceId: string; readonly invoice: Invoice; readonly createdAt: Date;
}

export interface ConfirmInvoiceRecord {
  readonly tenantId: string; readonly companyId: string;
  readonly actorId: string; readonly traceId: string; readonly invoice: SavedInvoice;
}

export const INVOICE_STORE = Symbol('INVOICE_STORE');

export interface InvoiceStore {
  save(record: SaveInvoiceRecord): Promise<SavedInvoice>;
  exists(tenantId: string, companyId: string, direction: InvoiceDirection, invoiceNumber: string): Promise<boolean>;
  list(tenantId: string, companyId: string): Promise<readonly SavedInvoice[]>;
  find(tenantId: string, companyId: string, invoiceId: string): Promise<SavedInvoice | null>;
  confirm(record: ConfirmInvoiceRecord): Promise<SavedInvoice | null>;
}
