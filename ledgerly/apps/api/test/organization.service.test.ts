import { describe, expect, it } from 'vitest';
import type { Company } from '@ledgerly/domain';
import type {
  BootstrapRecord,
  DeniedAccessRecord,
  OrganizationStore,
} from '../src/modules/organization/application/organization-store.js';
import { OrganizationService } from '../src/modules/organization/application/organization.service.js';

class MemoryOrganizationStore implements OrganizationStore {
  readonly companies: Company[] = [];
  readonly denied: DeniedAccessRecord[] = [];

  bootstrap(record: BootstrapRecord): Promise<void> {
    this.companies.push(record.company);
    return Promise.resolve();
  }

  findCompany(tenantId: string, companyId: string): Promise<Company | null> {
    return Promise.resolve(
      this.companies.find((item) => item.tenantId === tenantId && item.id === companyId) ?? null,
    );
  }

  recordDeniedCompanyAccess(record: DeniedAccessRecord): Promise<void> {
    this.denied.push(record);
    return Promise.resolve();
  }
}

const actorId = '10000000-0000-4000-8000-000000000001';

describe('OrganizationService', () => {
  it('creates a tenant and company atomically through the store port', async () => {
    const store = new MemoryOrganizationStore();
    const service = new OrganizationService(store);
    const result = await service.bootstrap(
      {
        tenantName: '测试租户',
        company: {
          name: '常州市示例网络科技有限公司',
          unifiedSocialCreditCode: '913204001234567890',
          provinceCode: '32',
          cityCode: '3204',
        },
      },
      { actorId, traceId: 'trace-1' },
    );
    expect(result.company.tenantId).toBe(result.tenantId);
    expect(result.company.version).toBe(1);
    expect(store.companies).toHaveLength(1);
  });

  it('does not reveal a company across tenants and records the denial', async () => {
    const store = new MemoryOrganizationStore();
    const service = new OrganizationService(store);
    const created = await service.bootstrap(
      {
        tenantName: 'A',
        company: {
          name: 'A 公司',
          unifiedSocialCreditCode: '913204001234567890',
          provinceCode: '32',
          cityCode: '3204',
        },
      },
      { actorId, traceId: 'trace-create' },
    );

    await expect(
      service.getCompany(created.company.id, {
        actorId,
        tenantId: '20000000-0000-4000-8000-000000000002',
        traceId: 'trace-denied',
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(store.denied).toEqual([
      expect.objectContaining({ companyId: created.company.id, traceId: 'trace-denied' }),
    ]);
  });
});
