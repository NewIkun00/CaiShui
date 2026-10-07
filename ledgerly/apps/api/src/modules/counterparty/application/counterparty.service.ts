import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CounterpartyInputRequest } from '@ledgerly/contracts';
import { CounterpartyType, createCounterparty } from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import { LEDGER_SETUP_STORE, type LedgerSetupStore } from '../../ledger-setup/application/ledger-setup-store.js';
import { ORGANIZATION_STORE, type OrganizationStore } from '../../organization/application/organization-store.js';
import type { RequestContext } from '../../organization/application/organization.service.js';
import { COUNTERPARTY_STORE, type CounterpartyStore, type SavedCounterparty } from './counterparty-store.js';

@Injectable()
export class CounterpartyService {
  constructor(
    @Inject(ORGANIZATION_STORE) private readonly organizations: OrganizationStore,
    @Inject(LEDGER_SETUP_STORE) private readonly ledgerSetups: LedgerSetupStore,
    @Inject(COUNTERPARTY_STORE) private readonly counterparties: CounterpartyStore,
  ) {}

  async create(companyId: string, input: CounterpartyInputRequest, context: RequestContext): Promise<SavedCounterparty> {
    if (!context.tenantId) throw new NotFoundException('Company not found');
    if (!await this.organizations.findCompany(context.tenantId, companyId)) {
      throw new NotFoundException('Company not found');
    }
    if (!await this.ledgerSetups.find(context.tenantId, companyId)) {
      throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    }
    const counterparty = createCounterparty({ ...input, type: input.type as CounterpartyType });
    if (await this.counterparties.exists(context.tenantId, companyId, counterparty.type, counterparty.normalizedName)) {
      throw new ConflictException({ code: 'COUNTERPARTY_EXISTS', message: 'A counterparty with this type and name already exists' });
    }
    return this.counterparties.save({
      id: randomUUID(), tenantId: context.tenantId, companyId,
      actorId: context.actorId, traceId: context.traceId, counterparty, createdAt: new Date(),
    });
  }

  async list(companyId: string, context: RequestContext): Promise<readonly SavedCounterparty[]> {
    if (!context.tenantId) throw new NotFoundException('Company not found');
    if (!await this.organizations.findCompany(context.tenantId, companyId)) {
      throw new NotFoundException('Company not found');
    }
    return this.counterparties.list(context.tenantId, companyId);
  }
}
