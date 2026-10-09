import { describe, expect, it } from 'vitest';
import {
  filingClosureResponseSchema,
  filingEvidenceInputSchema,
  filingEvidenceResponseSchema,
} from '../src/index.js';

const id = (prefix: string) => `${prefix}0000000-0000-4000-8000-000000000001`,
  hash = 'a'.repeat(64),
  time = '2026-10-09T00:00:00.000Z';

describe('filing receipt contracts', () => {
  it('requires a reported frozen-result hash only for filing receipts', () => {
    const common = {
      documentId: id('1'),
      documentVersion: 1,
      documentHash: hash,
      externalReference: 'TEST-REF-001',
      occurredAt: time,
      note: '仅用于 R4 非生产测试',
    };
    expect(filingEvidenceInputSchema.safeParse({ ...common, kind: 'filing_receipt' }).success).toBe(
      false,
    );
    expect(
      filingEvidenceInputSchema.safeParse({
        ...common,
        kind: 'filing_receipt',
        reportedResultHash: hash,
      }).success,
    ).toBe(true);
    expect(
      filingEvidenceInputSchema.safeParse({ ...common, kind: 'tax_payment_proof' }).success,
    ).toBe(true);
  });
  it('parses immutable evidence and closure snapshots', () => {
    const evidence = {
      id: id('1'),
      companyId: id('2'),
      filingTaskId: id('3'),
      filingPackageId: id('4'),
      kind: 'filing_receipt',
      documentId: id('5'),
      documentVersion: 1,
      documentHash: hash,
      externalReference: 'TEST-REF-001',
      occurredAt: time,
      reportedResultHash: hash,
      contentHash: hash,
      note: '仅用于 R4 非生产测试',
      createdAt: time,
      createdBy: id('6'),
    };
    expect(filingEvidenceResponseSchema.parse(evidence).kind).toBe('filing_receipt');
    expect(
      filingClosureResponseSchema.parse({
        id: id('7'),
        companyId: id('2'),
        filingTaskId: id('3'),
        filingPackageId: id('4'),
        packageContentHash: hash,
        resultHash: hash,
        evidenceIds: [id('1'), id('8')],
        contentHash: hash,
        note: '回执、完税凭证与冻结结果核对一致',
        closedAt: time,
        closedBy: id('6'),
      }),
    ).toMatchObject({ filingPackageId: id('4') });
  });
});
