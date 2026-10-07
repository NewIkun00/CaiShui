import { describe, expect, it } from 'vitest';
import { CounterpartyError, CounterpartyType, createCounterparty } from '../src/index.js';

describe('counterparty', () => {
  it('normalizes names and marks shareholders as related parties', () => {
    const counterparty = createCounterparty({
      name: '  张三  ', type: CounterpartyType.Shareholder, phone: '138 0000 0000',
    });
    expect(counterparty).toMatchObject({ name: '张三', normalizedName: '张三', isRelatedParty: true });
  });

  it('accepts uppercase alphanumeric unified social credit codes', () => {
    expect(createCounterparty({
      name: '示例客户', type: CounterpartyType.Customer, taxId: '91320400MA1ABC2D3X',
    }).taxId).toBe('91320400MA1ABC2D3X');
  });

  it('rejects malformed tax IDs', () => {
    expect(() => createCounterparty({
      name: '示例客户', type: CounterpartyType.Customer, taxId: '1234',
    })).toThrow(CounterpartyError);
  });
});
