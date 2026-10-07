const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class TaxPeriodError extends Error {
  override readonly name = 'TaxPeriodError';
}

function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export class TaxPeriod {
  private constructor(
    readonly start: string,
    readonly end: string,
  ) {
    Object.freeze(this);
  }

  static create(start: string, end: string): TaxPeriod {
    if (!validDate(start) || !validDate(end)) {
      throw new TaxPeriodError('Tax period requires valid ISO calendar dates');
    }
    if (start > end) throw new TaxPeriodError('Tax period start must not be after end');
    return new TaxPeriod(start, end);
  }

  contains(date: string): boolean {
    if (!validDate(date)) throw new TaxPeriodError('Date must be a valid ISO calendar date');
    return date >= this.start && date <= this.end;
  }
}
