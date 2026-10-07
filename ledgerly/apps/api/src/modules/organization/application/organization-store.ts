import type { Company, Tenant } from '@ledgerly/domain';

export interface BootstrapRecord {
  tenant: Tenant;
  company: Company;
  ownerUserId: string;
  traceId: string;
}

export interface DeniedAccessRecord {
  tenantId: string;
  actorId: string;
  companyId: string;
  traceId: string;
}

export const ORGANIZATION_STORE = Symbol('ORGANIZATION_STORE');

export interface OrganizationStore {
  bootstrap(record: BootstrapRecord): Promise<void>;
  findCompany(tenantId: string, companyId: string): Promise<Company | null>;
  recordDeniedCompanyAccess(record: DeniedAccessRecord): Promise<void>;
}
