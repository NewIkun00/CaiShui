import { Money } from './money.js';
import { TaxPeriod } from './tax-period.js';

export enum BankImportDirection {
  Income = 'income',
  Expense = 'expense',
}

export interface ParsedBankImportRow {
  readonly rowNumber: number;
  readonly occurredOn?: string | undefined;
  readonly description?: string | undefined;
  readonly counterpartyName?: string | undefined;
  readonly direction?: BankImportDirection | undefined;
  readonly amount?: string | undefined;
  readonly balance?: string | undefined;
  readonly errors: readonly string[];
}

export interface ParsedBankImport {
  readonly headers: readonly string[];
  readonly rows: readonly ParsedBankImportRow[];
  readonly errors: readonly string[];
}

const REQUIRED_HEADERS = ['交易日期', '摘要', '对方名称', '收入', '支出', '余额'] as const;

function parseRecords(content: string): string[][] {
  const records: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]; const next = content[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim())) records.push(row);
      row = []; continue;
    }
    cell += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  row.push(cell); if (row.some((value) => value.trim())) records.push(row);
  return records;
}

function normalizeDate(value: string): string | undefined {
  const normalized = value.trim().replaceAll('/', '-');
  try { TaxPeriod.create(normalized, normalized); return normalized; } catch { return undefined; }
}

function amount(value: string): Money | undefined {
  const normalized = value.trim().replaceAll(',', '');
  if (!normalized) return Money.zero();
  try { return Money.from(normalized); } catch { return undefined; }
}

export function parseBankCsv(content: string): ParsedBankImport {
  let records: string[][];
  try { records = parseRecords(content.replace(/^\uFEFF/, '')); }
  catch (error: unknown) {
    return { headers: [], rows: [], errors: [error instanceof Error ? error.message : 'CSV parsing failed'] };
  }
  const headers = (records[0] ?? []).map((value) => value.trim());
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) return { headers, rows: [], errors: [`缺少列：${missing.join('、')}`] };
  const column = Object.fromEntries(REQUIRED_HEADERS.map((header) => [header, headers.indexOf(header)])) as Record<typeof REQUIRED_HEADERS[number], number>;
  const rows = records.slice(1).map((record, rowIndex): ParsedBankImportRow => {
    const errors: string[] = [];
    const occurredOn = normalizeDate(record[column['交易日期']] ?? '');
    if (!occurredOn) errors.push('交易日期无效');
    const description = (record[column['摘要']] ?? '').trim();
    if (!description) errors.push('摘要为空');
    const counterpartyName = (record[column['对方名称']] ?? '').trim();
    if (!counterpartyName) errors.push('对方名称为空');
    const income = amount(record[column['收入']] ?? ''); const expense = amount(record[column['支出']] ?? '');
    if (!income || !expense) errors.push('收入或支出金额格式无效');
    const incomePositive = income ? !income.equals(Money.zero()) && !(record[column['收入']] ?? '').trim().startsWith('-') : false;
    const expensePositive = expense ? !expense.equals(Money.zero()) && !(record[column['支出']] ?? '').trim().startsWith('-') : false;
    if (incomePositive === expensePositive) errors.push('收入和支出必须且只能填写一项正数');
    const balanceMoney = amount(record[column['余额']] ?? '');
    if (!balanceMoney) errors.push('余额格式无效');
    return {
      rowNumber: rowIndex + 2, occurredOn, description, counterpartyName,
      direction: incomePositive ? BankImportDirection.Income : expensePositive ? BankImportDirection.Expense : undefined,
      amount: incomePositive ? income?.toString() : expensePositive ? expense?.toString() : undefined,
      balance: balanceMoney?.toString(), errors,
    };
  });
  return { headers, rows, errors: [] };
}
