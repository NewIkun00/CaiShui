export enum DocumentType {
  Invoice = 'invoice',
  BankReceipt = 'bank_receipt',
  Contract = 'contract',
  Screenshot = 'screenshot',
  Payroll = 'payroll',
  Other = 'other',
}

export enum DocumentStatus {
  Active = 'active',
}

export interface DocumentInput {
  readonly type: DocumentType;
  readonly title: string;
  readonly accountingMonth: string;
}

export interface DocumentRecord {
  readonly type: DocumentType;
  readonly title: string;
  readonly accountingMonth: string;
  readonly status: DocumentStatus;
  readonly currentVersion: number;
}

export class DocumentError extends Error {
  override readonly name = 'DocumentError';
}

export function createDocument(input: DocumentInput): DocumentRecord {
  const title = input.title.trim();
  if (!title) throw new DocumentError('Document title is required');
  if (title.length > 200) throw new DocumentError('Document title is too long');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.accountingMonth)) {
    throw new DocumentError('Accounting month must use YYYY-MM');
  }
  return Object.freeze({
    type: input.type, title, accountingMonth: input.accountingMonth,
    status: DocumentStatus.Active, currentVersion: 1,
  });
}

export function nextDocumentVersion(document: DocumentRecord): DocumentRecord {
  if (document.status !== DocumentStatus.Active) throw new DocumentError('Document is not active');
  return Object.freeze({ ...document, currentVersion: document.currentVersion + 1 });
}
