import { Money } from './money.js';
import { TaxPeriod } from './tax-period.js';

const LAST_DAY_BY_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export class LedgerSetupError extends Error {
  override readonly name = 'LedgerSetupError';
}

export interface LedgerSetupInput {
  readonly accountName: string;
  readonly accountType: 'bank' | 'cash';
  readonly bankName?: string | undefined;
  readonly accountNumberLast4?: string | undefined;
  readonly openingBalance: string;
  readonly openingBalanceSource: OpeningBalanceSource;
  readonly openingBalanceAsOf: string;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface LedgerSetup {
  readonly accountName: string;
  readonly accountType: 'bank' | 'cash';
  readonly bankName?: string | undefined;
  readonly accountNumberLast4?: string | undefined;
  readonly openingBalance: Money;
  readonly openingBalanceSource: OpeningBalanceSource;
  readonly openingBalanceAsOf: string;
  readonly period: TaxPeriod;
}

export type OpeningBalanceSource = 'none'|'paid_in_capital'|'shareholder_advance';
export interface OpeningBalanceEntry {
  readonly lineNumber:number;readonly accountCode:string;readonly accountName:string;
  readonly side:'debit'|'credit';readonly amount:Money;
}

function isFullCalendarMonth(start: string, end: string): boolean {
  if (!/^\d{4}-\d{2}-01$/.test(start)) return false;
  const [yearText, monthText] = start.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || month < 1 || month > 12) return false;
  const leap = month === 2 && (year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0));
  const lastDay = leap ? 29 : LAST_DAY_BY_MONTH[month - 1];
  return end === `${yearText}-${monthText}-${String(lastDay).padStart(2, '0')}`;
}

export function createLedgerSetup(input: LedgerSetupInput): LedgerSetup {
  const accountName = input.accountName.trim();
  if (!accountName) throw new LedgerSetupError('Account name is required');
  if (input.accountType === 'bank') {
    if (!input.bankName?.trim()) throw new LedgerSetupError('Bank name is required for bank accounts');
    if (!/^\d{4}$/.test(input.accountNumberLast4 ?? '')) {
      throw new LedgerSetupError('Bank account last four digits are required');
    }
  }
  const openingBalance=Money.from(input.openingBalance);
  if(openingBalance.isNegative())throw new LedgerSetupError('Bank and cash opening balances cannot be negative');
  if(openingBalance.equals(Money.zero())&&input.openingBalanceSource!=='none')throw new LedgerSetupError('A zero opening balance must use the none source');
  if(!openingBalance.equals(Money.zero())&&input.openingBalanceSource==='none')throw new LedgerSetupError('A positive opening balance requires a funding source');
  const period = TaxPeriod.create(input.periodStart, input.periodEnd);
  if (!isFullCalendarMonth(period.start, period.end)) {
    throw new LedgerSetupError('The first accounting period must be a full calendar month');
  }
  TaxPeriod.create(input.openingBalanceAsOf, input.openingBalanceAsOf);
  if (input.openingBalanceAsOf >= period.start) {
    throw new LedgerSetupError('Opening balance date must be before the first accounting period');
  }
  const optionalBank = input.accountType === 'bank'
    ? { bankName: input.bankName?.trim(), accountNumberLast4: input.accountNumberLast4 }
    : {};
  return Object.freeze({
    accountName,
    accountType: input.accountType,
    ...optionalBank,
    openingBalance,
    openingBalanceSource:input.openingBalanceSource,
    openingBalanceAsOf: input.openingBalanceAsOf,
    period,
  });
}

export function createOpeningBalanceEntries(setup:LedgerSetup):readonly OpeningBalanceEntry[]{if(setup.openingBalance.equals(Money.zero()))return Object.freeze([]);const cashAccount=setup.accountType==='bank'?{code:'1002',name:'银行存款'}:{code:'1001',name:'库存现金'};const offset=setup.openingBalanceSource==='paid_in_capital'?{code:'3001',name:'实收资本'}:{code:'2241',name:'其他应付款'};return Object.freeze([Object.freeze({lineNumber:1,accountCode:cashAccount.code,accountName:cashAccount.name,side:'debit' as const,amount:setup.openingBalance}),Object.freeze({lineNumber:2,accountCode:offset.code,accountName:offset.name,side:'credit' as const,amount:setup.openingBalance})]);}
