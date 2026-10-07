import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { LedgerSetupRequest } from '@ledgerly/contracts';
import { createLedgerSetup, createOpeningBalanceEntries, ScopeDecision } from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import {
  ORGANIZATION_STORE,
  type OrganizationStore,
} from '../../organization/application/organization-store.js';
import type { RequestContext } from '../../organization/application/organization.service.js';
import { SCOPE_STORE, type ScopeStore } from '../../profile-scope/application/scope-store.js';
import {
  LEDGER_SETUP_STORE,
  type LedgerSetupStore,
  type SavedLedgerSetup,
} from './ledger-setup-store.js';

@Injectable()
export class LedgerSetupService {
  constructor(
    @Inject(ORGANIZATION_STORE) private readonly organizations: OrganizationStore,
    @Inject(SCOPE_STORE) private readonly scopes: ScopeStore,
    @Inject(LEDGER_SETUP_STORE) private readonly setups: LedgerSetupStore,
  ) {}

  async create(
    companyId: string,
    input: LedgerSetupRequest,
    context: RequestContext,
  ): Promise<SavedLedgerSetup> {
    if (!context.tenantId) throw new NotFoundException('Company not found');
    const company = await this.organizations.findCompany(context.tenantId, companyId);
    if (!company) throw new NotFoundException('Company not found');
    const scope = await this.scopes.findLatest(context.tenantId, companyId);
    if (!scope || scope.decision !== ScopeDecision.Green) {
      throw new ConflictException({
        code: 'GREEN_SCOPE_REQUIRED',
        message: 'Only a green scope evaluation can continue to ledger setup',
      });
    }
    if (await this.setups.find(context.tenantId, companyId)) {
      throw new ConflictException({
        code: 'LEDGER_SETUP_EXISTS',
        message: 'Ledger setup already exists',
      });
    }
    const setup=createLedgerSetup(input),openingEntries=createOpeningBalanceEntries(setup);
    return this.setups.save({
      id: randomUUID(),
      accountId: randomUUID(),
      periodId: randomUUID(),
      openingBalanceId: randomUUID(),
      openingEntryIds:openingEntries.map(()=>randomUUID()),
      tenantId: context.tenantId,
      companyId,
      actorId: context.actorId,
      traceId: context.traceId,
      setup,
      createdAt: new Date(),
    });
  }

  async get(companyId: string, context: RequestContext): Promise<SavedLedgerSetup> {
    if (!context.tenantId) throw new NotFoundException('Ledger setup not found');
    const setup = await this.setups.find(context.tenantId, companyId);
    if (!setup) throw new NotFoundException('Ledger setup not found');
    return setup;
  }
}
