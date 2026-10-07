import { describe, expect, it } from 'vitest';
import {
  BusinessEventError,
  BusinessEventStatus,
  BusinessEventType,
  confirmBusinessEvent,
  createBusinessEvent,
} from '../src/index.js';

const counterpartyId = '10000000-0000-4000-8000-000000000001';

describe('business event', () => {
  it('creates a precise draft and confirms it through the state machine', () => {
    const draft = createBusinessEvent({
      type: BusinessEventType.ServiceCompleted, occurredOn: '2026-10-08',
      amount: '199.90', counterpartyId, description: '网站设计服务验收',
    });
    expect(draft).toMatchObject({ status: BusinessEventStatus.Draft, version: 1 });
    expect(draft.amount.toString()).toBe('199.90');
    expect(confirmBusinessEvent(draft, counterpartyId, new Date('2026-10-08T10:00:00Z')))
      .toMatchObject({ status: BusinessEventStatus.Confirmed, version: 2 });
  });

  it('requires a counterparty and a positive amount', () => {
    expect(() => createBusinessEvent({
      type: BusinessEventType.MoneyReceived, occurredOn: '2026-10-08', amount: '0', description: '收款',
    })).toThrow(BusinessEventError);
  });

  it('prevents confirming an already confirmed event', () => {
    const draft = createBusinessEvent({
      type: BusinessEventType.MoneyPaid, occurredOn: '2026-10-08', amount: '10',
      counterpartyId, description: '支付服务费',
    });
    const confirmed = confirmBusinessEvent(draft, counterpartyId, new Date());
    expect(() => confirmBusinessEvent(confirmed, counterpartyId, new Date())).toThrow(BusinessEventError);
  });
});
