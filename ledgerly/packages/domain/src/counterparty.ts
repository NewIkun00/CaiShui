export enum CounterpartyType {
  Customer = 'customer',
  Supplier = 'supplier',
  Shareholder = 'shareholder',
  Employee = 'employee',
  Other = 'other',
}

export class CounterpartyError extends Error {
  override readonly name = 'CounterpartyError';
}

export interface CounterpartyInput {
  readonly name: string;
  readonly type: CounterpartyType;
  readonly taxId?: string | undefined;
  readonly contactName?: string | undefined;
  readonly phone?: string | undefined;
  readonly notes?: string | undefined;
}

export interface Counterparty {
  readonly name: string;
  readonly normalizedName: string;
  readonly type: CounterpartyType;
  readonly taxId?: string | undefined;
  readonly contactName?: string | undefined;
  readonly phone?: string | undefined;
  readonly notes?: string | undefined;
  readonly isRelatedParty: boolean;
}

export function normalizeCounterpartyName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function createCounterparty(input: CounterpartyInput): Counterparty {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) throw new CounterpartyError('Counterparty name is required');
  if (name.length > 200) throw new CounterpartyError('Counterparty name is too long');
  const taxId = optionalTrimmed(input.taxId)?.toUpperCase();
  if (taxId && !/^[0-9A-Z]{18}$/.test(taxId)) {
    throw new CounterpartyError('Tax ID must contain 18 uppercase letters or digits');
  }
  const phone = optionalTrimmed(input.phone);
  if (phone && !/^[0-9+\-() ]{6,30}$/.test(phone)) {
    throw new CounterpartyError('Phone number format is invalid');
  }
  return Object.freeze({
    name,
    normalizedName: normalizeCounterpartyName(name),
    type: input.type,
    taxId,
    contactName: optionalTrimmed(input.contactName),
    phone,
    notes: optionalTrimmed(input.notes),
    isRelatedParty: input.type === CounterpartyType.Shareholder,
  });
}
