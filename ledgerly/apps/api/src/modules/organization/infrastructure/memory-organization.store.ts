import { Injectable } from '@nestjs/common';
import type { Company } from '@ledgerly/domain';
import type {
  BootstrapRecord,
  DeniedAccessRecord,
  OrganizationStore,
} from '../application/organization-store.js';

/**
 * Local preview adapter. Data is intentionally process-local and is lost on restart.
 * Production startup rejects STORAGE_MODE=memory.
 */
@Injectable()
export class MemoryOrganizationStore implements OrganizationStore {
  private readonly companies = new Map<string, Company>();
  private readonly deniedAccess: DeniedAccessRecord[] = [];

  bootstrap(record: BootstrapRecord): Promise<void> {
    this.companies.set(this.key(record.tenant.id, record.company.id), record.company);
    return Promise.resolve();
  }

  findCompany(tenantId: string, companyId: string): Promise<Company | null> {
    return Promise.resolve(this.companies.get(this.key(tenantId, companyId)) ?? null);
  }

  recordDeniedCompanyAccess(record: DeniedAccessRecord): Promise<void> {
    this.deniedAccess.push(Object.freeze({ ...record }));
    return Promise.resolve();
  }

  private key(tenantId: string, companyId: string): string {
    return `${tenantId}:${companyId}`;
  }
}
