import { describe, expect, it } from 'vitest';
import { createLedgerSetup, createOpeningBalanceEntries, LedgerSetupError } from '../src/index.js';

describe('ledger setup', () => {
  it('creates a bank account with an exact opening balance and full month', () => {
    const setup = createLedgerSetup({
      accountName: '基本户', accountType: 'bank', bankName: '招商银行',
      accountNumberLast4: '1234', openingBalance: '1000.10', openingBalanceSource:'paid_in_capital',
      openingBalanceAsOf: '2026-09-30', periodStart: '2026-10-01', periodEnd: '2026-10-31',
    });
    expect(setup.openingBalance.toString()).toBe('1000.10');
    expect(setup.period.contains('2026-10-31')).toBe(true);
    expect(createOpeningBalanceEntries(setup).map(entry=>[entry.side,entry.accountCode,entry.amount.toString()])).toEqual([['debit','1002','1000.10'],['credit','3001','1000.10']]);
  });

  it('supports leap-year February as a full accounting month', () => {
    expect(() => createLedgerSetup({
      accountName: '库存现金', accountType: 'cash', openingBalance: '0', openingBalanceSource:'none',
      openingBalanceAsOf: '2028-01-31', periodStart: '2028-02-01', periodEnd: '2028-02-29',
    })).not.toThrow();
  });

  it('rejects opening balances dated inside the first accounting period', () => {
    expect(() => createLedgerSetup({
      accountName: '库存现金', accountType: 'cash', openingBalance: '0', openingBalanceSource:'none',
      openingBalanceAsOf: '2026-10-01', periodStart: '2026-10-01', periodEnd: '2026-10-31',
    })).toThrow(LedgerSetupError);
  });

  it('rejects negative balances and missing funding sources',()=>{
    const base={accountName:'库存现金',accountType:'cash' as const,openingBalanceAsOf:'2026-09-30',periodStart:'2026-10-01',periodEnd:'2026-10-31'};
    expect(()=>createLedgerSetup({...base,openingBalance:'-1',openingBalanceSource:'shareholder_advance'})).toThrow('cannot be negative');
    expect(()=>createLedgerSetup({...base,openingBalance:'1',openingBalanceSource:'none'})).toThrow('requires a funding source');
  });
});
