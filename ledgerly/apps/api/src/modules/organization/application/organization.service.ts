import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { BootstrapTenantInput } from '@ledgerly/contracts';
import { createCompany, createTenant, type Company } from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import {
  ORGANIZATION_STORE,
  type OrganizationStore,
} from './organization-store.js';

export interface RequestContext {
  actorId: string;
  tenantId?: string;
  traceId: string;
}

export interface BootstrapResult {
  tenantId: string;
  company: Company;
}

@Injectable()
export class OrganizationService {
  constructor(@Inject(ORGANIZATION_STORE) private readonly store: OrganizationStore) {}

  async bootstrap(input: BootstrapTenantInput, context: RequestContext): Promise<BootstrapResult> {
    const now = new Date();
    const tenant = createTenant(
      { id: randomUUID(), name: input.tenantName, createdBy: context.actorId },
      now,
    );
    const company = createCompany(
      {
        id: randomUUID(),
        tenantId: tenant.id,
        name: input.company.name,
        unifiedSocialCreditCode: input.company.unifiedSocialCreditCode,
        provinceCode: input.company.provinceCode,
        cityCode: input.company.cityCode,
        createdBy: context.actorId,
      },
      now,
    );

    await this.store.bootstrap({
      tenant,
      company,
      ownerUserId: context.actorId,
      traceId: context.traceId,
    });
    return { tenantId: tenant.id, company };
  }

  async getCompany(companyId: string, context: RequestContext): Promise<Company> {
    if (!context.tenantId) throw new NotFoundException('Company not found');
    const company = await this.store.findCompany(context.tenantId, companyId);
    if (!company) {
      await this.store.recordDeniedCompanyAccess({
        tenantId: context.tenantId,
        actorId: context.actorId,
        companyId,
        traceId: context.traceId,
      });
      throw new NotFoundException('Company not found');
    }
    return company;
  }
}
