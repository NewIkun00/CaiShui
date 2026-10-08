import { BusinessEventStatus, BusinessEventType, type BusinessEvent } from './business-event.js';
import { Money } from './money.js';

export type AccountCategory = 'asset'|'liability'|'equity'|'revenue'|'expense';
export type EntrySide = 'debit'|'credit';

export interface ChartAccount {
  readonly code: string; readonly name: string; readonly category: AccountCategory;
  readonly normalSide: EntrySide; readonly enabled: true;
}

export const ACCOUNTING_TEMPLATE_VERSION = 'small-enterprise-v1.0.0';
export const ACCOUNTING_RULE_VERSION = 'business-event-mapping-v1.0.0';

const accounts: readonly ChartAccount[] = Object.freeze([
  { code:'1001',name:'库存现金',category:'asset',normalSide:'debit',enabled:true },
  { code:'1002',name:'银行存款',category:'asset',normalSide:'debit',enabled:true },
  { code:'1122',name:'应收账款',category:'asset',normalSide:'debit',enabled:true },
  { code:'2202',name:'应付账款',category:'liability',normalSide:'credit',enabled:true },
  { code:'2241',name:'其他应付款',category:'liability',normalSide:'credit',enabled:true },
  { code:'3001',name:'实收资本',category:'equity',normalSide:'credit',enabled:true },
  { code:'5001',name:'主营业务收入',category:'revenue',normalSide:'credit',enabled:true },
  { code:'5602',name:'管理费用',category:'expense',normalSide:'debit',enabled:true },
]);

export enum VoucherStatus { Draft='draft', Confirmed='confirmed', Reversed='reversed' }

export interface VoucherEntry {
  readonly lineNumber: number; readonly accountCode: string; readonly accountName: string;
  readonly side: EntrySide; readonly amount: Money;
}

export interface VoucherDraft {
  readonly voucherDate: string; readonly summary: string; readonly sourceBusinessEventId: string;
  readonly templateVersion: string; readonly ruleVersion: string; readonly status: VoucherStatus;
  readonly version: number; readonly entries: readonly VoucherEntry[];
}

export interface VoucherState extends VoucherDraft {
  readonly id: string;
  readonly reversalOfVoucherId?: string | undefined;
}

export interface FinancialReportBalance {
  readonly accountCode: string;
  readonly accountName: string;
  readonly category: AccountCategory;
  readonly debitMovement: Money;
  readonly creditMovement: Money;
  readonly endingDebit: Money;
  readonly endingCredit: Money;
}

export interface FinancialReportLine {
  readonly accountCode: string;
  readonly accountName: string;
  readonly amount: Money;
}

export interface FinancialStatements {
  readonly profitStatement: {
    readonly revenue: readonly FinancialReportLine[];
    readonly expenses: readonly FinancialReportLine[];
    readonly totalRevenue: Money;
    readonly totalExpenses: Money;
    readonly profit: Money;
  };
  readonly balanceSheet: {
    readonly assets: readonly FinancialReportLine[];
    readonly liabilities: readonly FinancialReportLine[];
    readonly equity: readonly FinancialReportLine[];
    readonly currentPeriodProfit: Money;
    readonly totalAssets: Money;
    readonly totalLiabilities: Money;
    readonly totalEquity: Money;
    readonly difference: Money;
    readonly balanced: boolean;
  };
}

export class AccountingError extends Error { override readonly name='AccountingError'; }

export function v1ChartOfAccounts(): readonly ChartAccount[] { return accounts; }

const mappings: ReadonlyMap<BusinessEventType, readonly [string, string]> = new Map([
  [BusinessEventType.ServiceCompleted, ['1122','5001']],
  [BusinessEventType.MoneyReceived, ['1002','1122']],
  [BusinessEventType.ExpenseIncurred, ['5602','2202']],
  [BusinessEventType.MoneyPaid, ['2202','1002']],
  [BusinessEventType.CapitalContribution, ['1002','3001']],
  [BusinessEventType.ShareholderAdvance, ['5602','2241']],
]);

export function createVoucherDraft(sourceBusinessEventId: string, event: BusinessEvent,
  options: { readonly paymentFullyReconciled?: boolean } = {}): VoucherDraft {
  if (event.status !== BusinessEventStatus.Confirmed) throw new AccountingError('Only confirmed business events can generate vouchers');
  if ((event.type === BusinessEventType.MoneyReceived || event.type === BusinessEventType.MoneyPaid)
    && options.paymentFullyReconciled !== true) {
    throw new AccountingError('Payment must be fully reconciled before voucher generation');
  }
  const mapping = mappings.get(event.type);
  if (!mapping) throw new AccountingError('This business event requires reconciliation or additional evidence before voucher generation');
  const [debitCode, creditCode] = mapping;
  const debit = account(debitCode); const credit = account(creditCode);
  const entries: readonly VoucherEntry[] = Object.freeze([
    Object.freeze({ lineNumber:1,accountCode:debit.code,accountName:debit.name,side:'debit' as const,amount:event.amount }),
    Object.freeze({ lineNumber:2,accountCode:credit.code,accountName:credit.name,side:'credit' as const,amount:event.amount }),
  ]);
  assertBalanced(entries);
  return Object.freeze({
    voucherDate:event.occurredOn,summary:event.description,sourceBusinessEventId,
    templateVersion:ACCOUNTING_TEMPLATE_VERSION,ruleVersion:ACCOUNTING_RULE_VERSION,
    status:VoucherStatus.Draft,version:1,entries,
  });
}

export function assertBalanced(entries: readonly VoucherEntry[]): void {
  if (entries.length < 2) throw new AccountingError('A voucher needs at least two entries');
  const total = (side: EntrySide) => entries.filter((entry)=>entry.side===side)
    .reduce((sum,entry)=>sum.add(entry.amount),Money.zero());
  if (!total('debit').equals(total('credit'))) throw new AccountingError('Voucher debits and credits must be equal');
}

export function createFinancialStatements(balances: readonly FinancialReportBalance[]): FinancialStatements {
  const line = (balance: FinancialReportBalance, amount: Money): FinancialReportLine => Object.freeze({
    accountCode: balance.accountCode, accountName: balance.accountName, amount,
  });
  const byCategory = (category: AccountCategory) => balances.filter((balance) => balance.category === category);
  const movement = (balance: FinancialReportBalance, normalSide: EntrySide) => normalSide === 'debit'
    ? balance.debitMovement.subtract(balance.creditMovement)
    : balance.creditMovement.subtract(balance.debitMovement);
  const ending = (balance: FinancialReportBalance, normalSide: EntrySide) => normalSide === 'debit'
    ? balance.endingDebit.subtract(balance.endingCredit)
    : balance.endingCredit.subtract(balance.endingDebit);
  const sum = (lines: readonly FinancialReportLine[]) => lines.reduce(
    (total, item) => total.add(item.amount), Money.zero(),
  );
  const revenue = Object.freeze(byCategory('revenue').map((balance) => line(balance, movement(balance, 'credit'))));
  const expenses = Object.freeze(byCategory('expense').map((balance) => line(balance, movement(balance, 'debit'))));
  const assets = Object.freeze(byCategory('asset').map((balance) => line(balance, ending(balance, 'debit'))));
  const liabilities = Object.freeze(byCategory('liability').map((balance) => line(balance, ending(balance, 'credit'))));
  const equity = Object.freeze(byCategory('equity').map((balance) => line(balance, ending(balance, 'credit'))));
  const totalRevenue = sum(revenue);
  const totalExpenses = sum(expenses);
  const profit = totalRevenue.subtract(totalExpenses);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity).add(profit);
  const difference = totalAssets.subtract(totalLiabilities).subtract(totalEquity);
  return Object.freeze({
    profitStatement: Object.freeze({ revenue, expenses, totalRevenue, totalExpenses, profit }),
    balanceSheet: Object.freeze({
      assets, liabilities, equity, currentPeriodProfit: profit,
      totalAssets, totalLiabilities, totalEquity, difference, balanced: difference.equals(Money.zero()),
    }),
  });
}

export function confirmVoucher(voucher: VoucherState, expectedVersion: number): VoucherState {
  if (voucher.status !== VoucherStatus.Draft) throw new AccountingError('Only draft vouchers can be confirmed');
  if (voucher.version !== expectedVersion) throw new AccountingError('Voucher version conflict');
  assertBalanced(voucher.entries);
  return Object.freeze({ ...voucher, status: VoucherStatus.Confirmed, version: voucher.version + 1 });
}

export function createReversalVoucher(original: VoucherState, reversalDate: string, reason: string): VoucherDraft {
  if (original.status !== VoucherStatus.Confirmed) throw new AccountingError('Only confirmed vouchers can be reversed');
  if (original.reversalOfVoucherId) throw new AccountingError('A reversal voucher cannot be reversed again');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reversalDate)) throw new AccountingError('A valid reversal date is required');
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new AccountingError('A reversal reason is required');
  const entries = original.entries.map((entry) => Object.freeze({
    lineNumber: entry.lineNumber,
    accountCode: entry.accountCode,
    accountName: entry.accountName,
    amount: entry.amount,
    side: entry.side === 'debit' ? 'credit' as const : 'debit' as const,
  }));
  assertBalanced(entries);
  return Object.freeze({
    voucherDate: reversalDate,
    summary: `冲销：${original.summary}（${normalizedReason}）`,
    sourceBusinessEventId: original.sourceBusinessEventId,
    templateVersion: original.templateVersion,
    ruleVersion: `${original.ruleVersion}:reversal`,
    status: VoucherStatus.Confirmed,
    version: 1,
    entries: Object.freeze(entries),
  });
}

function account(code:string):ChartAccount {
  const found=accounts.find((item)=>item.code===code);if(!found)throw new AccountingError(`Account ${code} is not in the template`);return found;
}
