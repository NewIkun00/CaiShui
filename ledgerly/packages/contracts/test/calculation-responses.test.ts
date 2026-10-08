import { describe, expect, it } from 'vitest';
import {
  accountingPeriodLockResponseSchema,
  calculationRunResponseSchema,
} from '../src/index.js';

const baseRun = {
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000002',
  companyId: '30000000-0000-4000-8000-000000000003',
  taxType: 'vat', periodStart: '2026-10-01', periodEnd: '2026-12-31',
  inputSnapshot: {
    companyId: '30000000-0000-4000-8000-000000000003', taxType: 'vat',
    periodStart: '2026-10-01', periodEnd: '2026-12-31', jurisdictionCodes: ['CN', 'CN-JS'],
    facts: [],
  },
  inputHash: 'a'.repeat(64),
  steps: [{
    sequence: 1, key: 'scope_validation', category: 'validation', status: 'blocked',
    inputs: { scopeState: 'missing' }, output: { eligible: 'false' }, explanation: '缺少画像。',
  }],
  createdAt: '2026-10-08T00:00:00.000Z',
  createdBy: '40000000-0000-4000-8000-000000000004',
} as const;

describe('calculation and accounting response contracts', () => {
  it('accepts a decision-required immutable calculation snapshot', () => {
    expect(calculationRunResponseSchema.parse({
      ...baseRun, status: 'decision_required',
      decision: { code: 'SCOPE_PROFILE_MISSING', message: '需要先完成画像。', candidateRuleVersionIds: [] },
    })).toMatchObject({ status: 'decision_required' });
  });

  it('rejects inconsistent run state and validates a locked period response', () => {
    expect(calculationRunResponseSchema.safeParse({ ...baseRun, status: 'ready' }).success).toBe(false);
    expect(accountingPeriodLockResponseSchema.parse({
      periodId: '50000000-0000-4000-8000-000000000005',
      periodStart: '2026-01-01', periodEnd: '2026-12-31', status: 'locked',
    })).toMatchObject({ status: 'locked' });
  });

  it('accepts an implementation registration blocker with an explicit readiness step',()=>{expect(calculationRunResponseSchema.parse({...baseRun,status:'decision_required',decision:{code:'IMPLEMENTATION_NOT_REGISTERED',message:'实现未注册。',candidateRuleVersionIds:['50000000-0000-4000-8000-000000000005']},steps:[...baseRun.steps,{sequence:4,key:'implementation_readiness',category:'validation',status:'blocked',inputs:{selectedRuleVersionId:'50000000-0000-4000-8000-000000000005'},output:{implementationRegistered:'false'},explanation:'实现未注册。'}]})).toMatchObject({decision:{code:'IMPLEMENTATION_NOT_REGISTERED'}})});
});
