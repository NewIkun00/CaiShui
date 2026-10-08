import { describe, expect, it } from 'vitest';
import {
  reconciliationCheckRunResponseSchema, reconciliationIssueTriageInputSchema,
} from '../src/index.js';

const runId = '10000000-0000-4000-8000-000000000001';
const companyId = '20000000-0000-4000-8000-000000000002';
const actorId = '30000000-0000-4000-8000-000000000003';

describe('reconciliation check contracts', () => {
  it('parses a blocking snapshot with traceable triage state', () => {
    const result = reconciliationCheckRunResponseSchema.parse({
      id: runId, companyId, periodId: '40000000-0000-4000-8000-000000000004',
      periodStart: '2026-10-01', periodEnd: '2026-10-31', inputSnapshot: {
        invoices: [{ invoiceId: '60000000-0000-4000-8000-000000000006', invoiceNumber: '12345678', outstandingAmount: '106.00' }],
        payments: [],
        accounts: [],
      }, inputHash: 'a'.repeat(64),
      grade: 'yellow', blocksFiling: true, totalIssues: 1, yellowIssues: 1, redIssues: 0,
      issues: [{
        id: '50000000-0000-4000-8000-000000000005', code: 'INVOICE_OUTSTANDING', severity: 'yellow',
        subjectType: 'invoice', subjectId: '60000000-0000-4000-8000-000000000006', amount: '106.00',
        message: '发票仍有未核销余额', suggestedAction: '匹配收款后重新检查。', triageStatus: 'investigating',
        triageVersion: 2, triageNote: '正在核对银行回单。', triagedBy: actorId,
        triagedAt: '2026-10-08T00:00:00.000Z',
      }],
      createdAt: '2026-10-08T00:00:00.000Z', createdBy: actorId,
    });
    expect(result).toMatchObject({ grade: 'yellow', blocksFiling: true, totalIssues: 1 });
  });

  it('does not allow clients to mark an issue open or resolved directly', () => {
    expect(reconciliationIssueTriageInputSchema.safeParse({
      status: 'open', note: '尝试退回未处理。', expectedVersion: 1,
    }).success).toBe(false);
    expect(reconciliationIssueTriageInputSchema.parse({
      status: 'ready_for_recheck', note: '事实已修正，等待重新检查。', expectedVersion: 2,
    }).status).toBe('ready_for_recheck');
  });
});
