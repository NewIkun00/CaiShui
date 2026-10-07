import { Decimal } from 'decimal.js';

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}

export class Money {
  static readonly CURRENCY = 'CNY';
  readonly #amount: Decimal;

  private constructor(amount: Decimal) {
    this.#amount = amount;
    Object.freeze(this);
  }

  static from(value: string): Money {
    let amount: Decimal;
    try {
      amount = new Decimal(value);
    } catch {
      throw new MoneyError(`Invalid monetary amount: ${value}`);
    }
    if (!amount.isFinite() || amount.decimalPlaces() > 2) {
      throw new MoneyError('Money must be finite and contain at most 2 decimal places');
    }
    return new Money(amount.toDecimalPlaces(2));
  }

  static zero(): Money {
    return Money.from('0');
  }

  add(other: Money): Money {
    return new Money(this.#amount.plus(other.#amount));
  }

  subtract(other: Money): Money {
    return new Money(this.#amount.minus(other.#amount));
  }

  multiply(multiplier: string, rounding: Decimal.Rounding = Decimal.ROUND_HALF_UP): Money {
    return new Money(this.#amount.mul(new Decimal(multiplier)).toDecimalPlaces(2, rounding));
  }

  equals(other: Money): boolean {
    return this.#amount.equals(other.#amount);
  }

  isGreaterThan(other: Money): boolean {
    return this.#amount.greaterThan(other.#amount);
  }

  isNegative(): boolean {
    return this.#amount.isNegative();
  }

  toString(): string {
    return this.#amount.toFixed(2);
  }

  toJSON(): { amount: string; currency: typeof Money.CURRENCY } {
    return { amount: this.toString(), currency: Money.CURRENCY };
  }
}
