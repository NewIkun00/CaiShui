export const filingEvidenceKinds = ['filing_receipt', 'tax_payment_proof'] as const;
export type FilingEvidenceKind = (typeof filingEvidenceKinds)[number];
export type FilingClosureBlockerCode =
  | 'TASK_NOT_PAID'
  | 'PACKAGE_NOT_FROZEN'
  | 'FILING_RECEIPT_REQUIRED'
  | 'PAYMENT_PROOF_REQUIRED'
  | 'RESULT_HASH_MISMATCH'
  | 'OPEN_ADJUSTMENT_WORK_ORDER';

export interface FilingClosureContext {
  readonly taskStatus: 'todo' | 'filed' | 'paid';
  readonly packageStatus: 'draft' | 'frozen';
  readonly expectedResultHash?: string | undefined;
  readonly filingReceiptResultHashes: readonly string[];
  readonly filingReceiptCount: number;
  readonly paymentProofCount: number;
  readonly openAdjustmentWorkOrderCount: number;
}

export class FilingReceiptError extends Error {
  constructor(
    message: string,
    readonly blockers: readonly FilingClosureBlockerCode[] = [],
  ) {
    super(message);
  }
}

export function filingClosureBlockers(
  context: FilingClosureContext,
): readonly FilingClosureBlockerCode[] {
  const blockers: FilingClosureBlockerCode[] = [];
  if (context.taskStatus !== 'paid') blockers.push('TASK_NOT_PAID');
  if (context.packageStatus !== 'frozen') blockers.push('PACKAGE_NOT_FROZEN');
  if (context.filingReceiptCount < 1) blockers.push('FILING_RECEIPT_REQUIRED');
  if (context.paymentProofCount < 1) blockers.push('PAYMENT_PROOF_REQUIRED');
  if (
    context.filingReceiptCount > 0 &&
    (!sha256(context.expectedResultHash) ||
      !context.filingReceiptResultHashes.some((hash) => hash === context.expectedResultHash))
  )
    blockers.push('RESULT_HASH_MISMATCH');
  if (context.openAdjustmentWorkOrderCount > 0) blockers.push('OPEN_ADJUSTMENT_WORK_ORDER');
  return blockers;
}

export function assertFilingClosable(context: FilingClosureContext): void {
  const blockers = filingClosureBlockers(context);
  if (blockers.length) throw new FilingReceiptError('Filing task cannot be closed', blockers);
}

function sha256(value?: string) {
  return Boolean(value && /^[0-9a-f]{64}$/.test(value));
}
