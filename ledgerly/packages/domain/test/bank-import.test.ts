import { describe, expect, it } from 'vitest';
import { BankImportDirection, parseBankCsv } from '../src/index.js';

describe('bank CSV import', () => {
  it('parses the V1 template including quoted commas', () => {
    const parsed = parseBankCsv('交易日期,摘要,对方名称,收入,支出,余额\n2026/10/08,"项目款,第一期",示例客户,1200.50,,2200.60');
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      rowNumber: 2, occurredOn: '2026-10-08', description: '项目款,第一期',
      direction: BankImportDirection.Income, amount: '1200.50', balance: '2200.60', errors: [],
    });
  });

  it('reports missing template columns before processing rows', () => {
    expect(parseBankCsv('日期,金额\n2026-10-08,10').errors[0]).toContain('缺少列');
  });

  it('rejects rows that contain both income and expense', () => {
    const parsed = parseBankCsv('交易日期,摘要,对方名称,收入,支出,余额\n2026-10-08,测试,客户,10,5,100');
    expect(parsed.rows[0]?.errors).toContain('收入和支出必须且只能填写一项正数');
  });
});
