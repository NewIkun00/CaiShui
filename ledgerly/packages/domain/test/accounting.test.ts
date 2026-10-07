import { describe, expect, it } from 'vitest';
import {
  AccountingError, assertBalanced, BusinessEventStatus, BusinessEventType, createBusinessEvent,
  confirmVoucher, createReversalVoucher, createVoucherDraft, Money, VoucherStatus, v1ChartOfAccounts,
} from '../src/index.js';

function confirmed(type=BusinessEventType.ServiceCompleted){return {...createBusinessEvent({type,occurredOn:'2026-10-08',amount:'1060.00',counterpartyId:'party',description:'测试事项'}),status:BusinessEventStatus.Confirmed,version:2};}

describe('accounting',()=>{
  it('provides a versioned small-enterprise chart template',()=>{
    expect(v1ChartOfAccounts().map(item=>item.code)).toContain('1002');
    expect(v1ChartOfAccounts().map(item=>item.code)).toContain('5001');
  });
  it('maps a confirmed service to a balanced voucher draft',()=>{
    const voucher=createVoucherDraft('event-1',confirmed());
    expect(voucher.entries.map(item=>[item.side,item.accountCode,item.amount.toString()])).toEqual([
      ['debit','1122','1060.00'],['credit','5001','1060.00'],
    ]);
  });
  it('refuses unconfirmed events and invoice events needing more evidence',()=>{
    expect(()=>createVoucherDraft('event-1',createBusinessEvent({type:BusinessEventType.MoneyReceived,occurredOn:'2026-10-08',amount:'1',counterpartyId:'party',description:'草稿'}))).toThrow('confirmed');
    expect(()=>createVoucherDraft('event-2',confirmed(BusinessEventType.InvoiceIssued))).toThrow('additional evidence');
    expect(()=>createVoucherDraft('event-3',confirmed(BusinessEventType.MoneyReceived))).toThrow('reconciled');
  });
  it('detects an unbalanced voucher',()=>{
    expect(()=>assertBalanced([
      {lineNumber:1,accountCode:'1002',accountName:'银行存款',side:'debit',amount:Money.from('1')},
      {lineNumber:2,accountCode:'1122',accountName:'应收账款',side:'credit',amount:Money.from('0.99')},
    ])).toThrow(AccountingError);
  });
  it('confirms with optimistic versioning and builds a balanced reversal',()=>{
    const draft=createVoucherDraft('event-1',confirmed());
    const posted=confirmVoucher({id:'voucher-1',...draft},1);
    expect(posted.status).toBe(VoucherStatus.Confirmed);
    expect(posted.version).toBe(2);
    const reversal=createReversalVoucher(posted,'2026-10-09','录入错误');
    expect(reversal.status).toBe(VoucherStatus.Confirmed);
    expect(reversal.entries.map(item=>[item.side,item.accountCode])).toEqual([
      ['credit','1122'],['debit','5001'],
    ]);
    expect(()=>confirmVoucher(posted,2)).toThrow('draft');
  });
});
