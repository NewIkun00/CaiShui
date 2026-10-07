import { describe, expect, it } from 'vitest';
import { Money, MoneyError, Rate, TaxPeriod } from '../src/index.js';

describe('financial value objects', () => {
  it('adds decimal money without floating point drift', () => {
    expect(Money.from('0.10').add(Money.from('0.20')).toString()).toBe('0.30');
  });

  it('rejects sub-cent input instead of silently rounding', () => {
    expect(() => Money.from('1.001')).toThrow(MoneyError);
  });

  it('rounds an explicitly requested multiplication using half-up', () => {
    expect(Money.from('100.05').multiply('0.03').toString()).toBe('3.00');
  });

  it('represents rates without binary floating point', () => {
    expect(Rate.fromPercent('3').toDecimalString()).toBe('0.03000000');
  });

  it('uses inclusive, explicit calendar boundaries', () => {
    const quarter = TaxPeriod.create('2026-07-01', '2026-09-30');
    expect(quarter.contains('2026-09-30')).toBe(true);
    expect(quarter.contains('2026-10-01')).toBe(false);
  });
});
