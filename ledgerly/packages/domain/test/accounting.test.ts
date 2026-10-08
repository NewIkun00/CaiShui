import { describe, expect, it } from 'vitest';
import {
  AccountingError, assertBalanced, BusinessEventStatus, BusinessEventType, createBusinessEvent,
  confirmVoucher, createFinancialStatements, createReversalVoucher, createVoucherDraft, Money,
  type AccountCategory, VoucherStatus, v1ChartOfAccounts,
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

function reportBalance(input: {
  accountCode: string; accountName: string; category: AccountCategory;
  debitMovement?: string; creditMovement?: string; endingDebit?: string; endingCredit?: string;
}) {
  return {
    accountCode: input.accountCode,
    accountName: input.accountName,
    category: input.category,
    debitMovement: Money.from(input.debitMovement ?? '0.00'),
    creditMovement: Money.from(input.creditMovement ?? '0.00'),
    endingDebit: Money.from(input.endingDebit ?? '0.00'),
    endingCredit: Money.from(input.endingCredit ?? '0.00'),
  };
}

describe('financial statements', () => {
  it('reports pure revenue and balances unclosed profit against receivables', () => {
    const statements = createFinancialStatements([
      reportBalance({ accountCode:'1122', accountName:'应收账款', category:'asset', debitMovement:'1060.00', endingDebit:'1060.00' }),
      reportBalance({ accountCode:'5001', accountName:'主营业务收入', category:'revenue', creditMovement:'1060.00', endingCredit:'1060.00' }),
    ]);
    expect(statements.profitStatement).toMatchObject({ totalRevenue:Money.from('1060.00'), totalExpenses:Money.zero(), profit:Money.from('1060.00') });
    expect(statements.balanceSheet).toMatchObject({ totalAssets:Money.from('1060.00'), totalLiabilities:Money.zero(), totalEquity:Money.from('1060.00'), balanced:true });
  });

  it('subtracts expenses and exposes a loss as negative current-period equity', () => {
    const statements = createFinancialStatements([
      reportBalance({ accountCode:'1122', accountName:'应收账款', category:'asset', debitMovement:'100.00', endingDebit:'100.00' }),
      reportBalance({ accountCode:'2202', accountName:'应付账款', category:'liability', creditMovement:'300.00', endingCredit:'300.00' }),
      reportBalance({ accountCode:'5001', accountName:'主营业务收入', category:'revenue', creditMovement:'100.00', endingCredit:'100.00' }),
      reportBalance({ accountCode:'5602', accountName:'管理费用', category:'expense', debitMovement:'300.00', endingDebit:'300.00' }),
    ]);
    expect(statements.profitStatement.profit.toString()).toBe('-200.00');
    expect(statements.balanceSheet).toMatchObject({ currentPeriodProfit:Money.from('-200.00'), totalAssets:Money.from('100.00'), totalLiabilities:Money.from('300.00'), totalEquity:Money.from('-200.00'), balanced:true });
  });

  it.each([
    ['paid-in capital', '3001', '实收资本', 'equity'] as const,
    ['shareholder loan', '2241', '其他应付款', 'liability'] as const,
  ])('balances an opening bank balance funded by %s', (_label, code, name, category) => {
    const statements = createFinancialStatements([
      reportBalance({ accountCode:'1002', accountName:'银行存款', category:'asset', endingDebit:'5000.00' }),
      reportBalance({ accountCode:code, accountName:name, category, endingCredit:'5000.00' }),
    ]);
    expect(statements.balanceSheet).toMatchObject({ totalAssets:Money.from('5000.00'), difference:Money.zero(), balanced:true });
  });

  it('nets an original voucher and its reversal to zero', () => {
    const statements = createFinancialStatements([
      reportBalance({ accountCode:'1122', accountName:'应收账款', category:'asset', debitMovement:'100.00', creditMovement:'100.00' }),
      reportBalance({ accountCode:'5001', accountName:'主营业务收入', category:'revenue', debitMovement:'100.00', creditMovement:'100.00' }),
    ]);
    expect(statements.profitStatement.profit.toString()).toBe('0.00');
    expect(statements.balanceSheet).toMatchObject({ totalAssets:Money.zero(), totalEquity:Money.zero(), difference:Money.zero(), balanced:true });
  });

  it('flags an intentionally unbalanced ledger', () => {
    const statements = createFinancialStatements([
      reportBalance({ accountCode:'1002', accountName:'银行存款', category:'asset', endingDebit:'1.00' }),
    ]);
    expect(statements.balanceSheet.difference.toString()).toBe('1.00');
    expect(statements.balanceSheet.balanced).toBe(false);
  });
});
