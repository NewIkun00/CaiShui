import { describe, expect, it } from 'vitest';
import {
  bankImportBatchSchema,
  businessEventResponseSchema,
  documentUploadResponseSchema,
  mockInvoiceExtractionResponseSchema,
} from '../src/index.js';

const companyId = '10000000-0000-4000-8000-000000000001';
const eventId = '20000000-0000-4000-8000-000000000002';
const now = '2026-10-08T00:00:00.000Z';

describe('fact collection response contracts', () => {
  it('parses a confirmed business event and its source metadata', () => {
    const result = businessEventResponseSchema.parse({
      id: eventId, companyId, type: 'money_received', occurredOn: '2026-10-08', amount: '100.00',
      counterpartyId: '30000000-0000-4000-8000-000000000003', description: '测试收款',
      source: 'import', status: 'confirmed', version: 2, createdAt: now, confirmedAt: now,
    });
    expect(result).toMatchObject({ source: 'import', status: 'confirmed' });
  });

  it('exposes the generated business event id after confirming a bank import', () => {
    const result = bankImportBatchSchema.parse({
      id: '40000000-0000-4000-8000-000000000004', companyId, fileName: 'bank.csv',
      fileHash: 'a'.repeat(64), status: 'confirmed', totalRows: 1, validRows: 1,
      invalidRows: 0, duplicateRows: 0, batchErrors: [], createdAt: now, confirmedAt: now,
      rows: [{
        id: '50000000-0000-4000-8000-000000000005', rowNumber: 2, occurredOn: '2026-10-08',
        description: '测试流水', direction: 'income', amount: '100.00', fingerprint: 'fingerprint',
        status: 'valid', errors: [], businessEventId: eventId,
      }],
    });
    expect(result.rows[0]?.businessEventId).toBe(eventId);
  });

  it('validates document upload and deterministic invoice extraction responses', () => {
    expect(documentUploadResponseSchema.parse({
      duplicate: false,
      document: {
        id: '60000000-0000-4000-8000-000000000006', companyId, type: 'invoice', title: '测试发票',
        accountingMonth: '2026-10', status: 'active', currentVersion: 1, linkedBusinessEventIds: [],
        createdAt: now, versions: [{
          id: '70000000-0000-4000-8000-000000000007', versionNumber: 1, fileName: 'invoice.pdf',
          mediaType: 'application/pdf', byteSize: 4, sha256: 'b'.repeat(64), scanStatus: 'clean',
          scanEngine: 'test', createdAt: now,
        }],
      },
    }).document.currentVersion).toBe(1);
    expect(mockInvoiceExtractionResponseSchema.parse({
      candidate: { invoiceNumber: '12345678' }, confidence: 0.8, warnings: [],
      provider: 'deterministic-mock-v1', requiresConfirmation: true,
    }).requiresConfirmation).toBe(true);
  });
});
