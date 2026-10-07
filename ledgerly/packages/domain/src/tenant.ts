export enum CompanyStatus {
  Draft = 'draft',
  Active = 'active',
  Suspended = 'suspended',
}

export interface Tenant {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface Company {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly unifiedSocialCreditCode: string;
  readonly provinceCode: string;
  readonly cityCode: string;
  readonly status: CompanyStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface TenantRepository {
  save(tenant: Tenant): Promise<void>;
}

export interface CompanyRepository {
  save(company: Company): Promise<void>;
  findById(tenantId: string, companyId: string): Promise<Company | null>;
}

export function createTenant(input: Pick<Tenant, 'id' | 'name' | 'createdBy'>, now: Date): Tenant {
  const name = input.name.trim();
  if (!name) throw new Error('Tenant name is required');
  return Object.freeze({ ...input, name, createdAt: now });
}

export function createCompany(
  input: Omit<Company, 'status' | 'version' | 'createdAt'>,
  now: Date,
): Company {
  const name = input.name.trim();
  if (!name) throw new Error('Company name is required');
  if (!/^\d{18}$/.test(input.unifiedSocialCreditCode)) {
    throw new Error('Unified social credit code must contain 18 digits');
  }
  return Object.freeze({
    ...input,
    name,
    status: CompanyStatus.Draft,
    version: 1,
    createdAt: now,
  });
}
