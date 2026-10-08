import { describe, expect, it } from 'vitest';
import { decidePeriodReopen, TaxPeriodError } from '../src/index.js';

describe('period reopen decision', () => {
  const base = {
    status: 'pending' as const,
    requestedBy: '10000000-0000-4000-8000-000000000001',
    decidedBy: '20000000-0000-4000-8000-000000000002',
    reason: '已核验遗漏流水及影响范围',
  };

  it('maps professional decisions to terminal states', () => {
    expect(decidePeriodReopen({ ...base, decision: 'approve' })).toBe('approved');
    expect(decidePeriodReopen({ ...base, decision: 'reject' })).toBe('rejected');
  });

  it('enforces pending state, separation of duties, and a meaningful reason', () => {
    expect(() => decidePeriodReopen({ ...base, status: 'approved', decision: 'approve' })).toThrow(TaxPeriodError);
    expect(() => decidePeriodReopen({ ...base, decidedBy: base.requestedBy, decision: 'approve' })).toThrow('cannot decide');
    expect(() => decidePeriodReopen({ ...base, reason: '不足', decision: 'reject' })).toThrow('at least 5');
  });
});
