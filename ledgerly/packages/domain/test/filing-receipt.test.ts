import { describe, expect, it } from 'vitest';
import { assertFilingClosable, filingClosureBlockers } from '../src/index.js';

const hash = 'a'.repeat(64);

describe('filing receipt closure gate', () => {
  it('lists every unmet immutable-evidence requirement', () => {
    expect(
      filingClosureBlockers({
        taskStatus: 'filed',
        packageStatus: 'draft',
        expectedResultHash: hash,
        filingReceiptResultHashes: [],
        filingReceiptCount: 0,
        paymentProofCount: 0,
        openAdjustmentWorkOrderCount: 1,
      }),
    ).toEqual([
      'TASK_NOT_PAID',
      'PACKAGE_NOT_FROZEN',
      'FILING_RECEIPT_REQUIRED',
      'PAYMENT_PROOF_REQUIRED',
      'OPEN_ADJUSTMENT_WORK_ORDER',
    ]);
  });

  it('requires a receipt whose reported result matches the frozen snapshot', () => {
    expect(() =>
      assertFilingClosable({
        taskStatus: 'paid',
        packageStatus: 'frozen',
        expectedResultHash: hash,
        filingReceiptResultHashes: ['b'.repeat(64)],
        filingReceiptCount: 1,
        paymentProofCount: 1,
        openAdjustmentWorkOrderCount: 0,
      }),
    ).toThrowError(/cannot be closed/);
    expect(
      filingClosureBlockers({
        taskStatus: 'paid',
        packageStatus: 'frozen',
        expectedResultHash: hash,
        filingReceiptResultHashes: [hash],
        filingReceiptCount: 1,
        paymentProofCount: 1,
        openAdjustmentWorkOrderCount: 0,
      }),
    ).toEqual([]);
  });
});
