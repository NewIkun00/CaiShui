import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CompanyProfileInput } from '@ledgerly/contracts';
import { evaluateScope, type CompanyProfile } from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import type { RequestContext } from '../../organization/application/organization.service.js';
import {
  ORGANIZATION_STORE,
  type OrganizationStore,
} from '../../organization/application/organization-store.js';
import { SCOPE_STORE, type SavedScopeEvaluation, type ScopeStore } from './scope-store.js';

@Injectable()
export class ProfileScopeService {
  constructor(
    @Inject(ORGANIZATION_STORE) private readonly organizations: OrganizationStore,
    @Inject(SCOPE_STORE) private readonly scopes: ScopeStore,
  ) {}

  async evaluate(
    companyId: string,
    input: CompanyProfileInput,
    context: RequestContext,
  ): Promise<SavedScopeEvaluation> {
    if (!context.tenantId) throw new NotFoundException('Company not found');
    const company = await this.organizations.findCompany(context.tenantId, companyId);
    if (!company) throw new NotFoundException('Company not found');
    const profile: CompanyProfile = input;
    return this.scopes.save({
      id: randomUUID(),
      profileId: randomUUID(),
      tenantId: context.tenantId,
      companyId,
      actorId: context.actorId,
      traceId: context.traceId,
      profile,
      evaluation: evaluateScope(profile),
      evaluatedAt: new Date(),
    });
  }

  async latest(companyId: string, context: RequestContext): Promise<SavedScopeEvaluation> {
    if (!context.tenantId) throw new NotFoundException('Scope evaluation not found');
    const evaluation = await this.scopes.findLatest(context.tenantId, companyId);
    if (!evaluation) throw new NotFoundException('Scope evaluation not found');
    return evaluation;
  }
}
