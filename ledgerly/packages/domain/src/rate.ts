import { Decimal } from 'decimal.js';

export class RateError extends Error {
  override readonly name = 'RateError';
}

export class Rate {
  readonly #value: Decimal;

  private constructor(value: Decimal) {
    this.#value = value;
    Object.freeze(this);
  }

  static fromDecimal(value: string): Rate {
    let rate: Decimal;
    try {
      rate = new Decimal(value);
    } catch {
      throw new RateError(`Invalid rate: ${value}`);
    }
    if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(1)) {
      throw new RateError('Rate must be between 0 and 1');
    }
    if (rate.decimalPlaces() > 8) {
      throw new RateError('Rate must contain at most 8 decimal places');
    }
    return new Rate(rate);
  }

  static fromPercent(value: string): Rate {
    return Rate.fromDecimal(new Decimal(value).dividedBy(100).toFixed(8));
  }

  toDecimalString(): string {
    return this.#value.toFixed(8);
  }

  toPercentString(): string {
    return this.#value.mul(100).toFixed(4);
  }
}
