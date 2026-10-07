import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { BusinessEventInputRequest } from '@ledgerly/contracts';
import {
  BusinessEventType,
  CounterpartyType,
  confirmBusinessEvent,
  createBusinessEvent,
} from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import { COUNTERPARTY_STORE, type CounterpartyStore } from '../../counterparty/application/counterparty-store.js';
import { LEDGER_SETUP_STORE, type LedgerSetupStore } from '../../ledger-setup/application/ledger-setup-store.js';
import { assertAccountingPeriodOpen } from '../../ledger-setup/application/accounting-period-guard.js';
import type { RequestContext } from '../../organization/application/organization.service.js';
import { BUSINESS_EVENT_STORE, type BusinessEventStore, type SavedBusinessEvent } from './business-event-store.js';

const shareholderEventTypes = new Set<BusinessEventType>([
  BusinessEventType.CapitalContribution,
  BusinessEventType.ShareholderAdvance,
]);

@Injectable()
export class BusinessEventService {
  constructor(
    @Inject(LEDGER_SETUP_STORE) private readonly ledgerSetups: LedgerSetupStore,
    @Inject(COUNTERPARTY_STORE) private readonly counterparties: CounterpartyStore,
    @Inject(BUSINESS_EVENT_STORE) private readonly events: BusinessEventStore,
  ) {}

  async create(companyId: string, input: BusinessEventInputRequest, context: RequestContext): Promise<SavedBusinessEvent> {
    if (!context.tenantId) {
      throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    }
    const setup = await this.ledgerSetups.find(context.tenantId, companyId);
    if (!setup) throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    assertAccountingPeriodOpen(setup);
    const counterparty = await this.counterparties.findById(context.tenantId, companyId, input.counterpartyId);
    if (!counterparty) throw new NotFoundException('Counterparty not found');
    const type = input.type as BusinessEventType;
    if (shareholderEventTypes.has(type) && counterparty.type !== CounterpartyType.Shareholder) {
      throw new ConflictException({
        code: 'SHAREHOLDER_REQUIRED',
        message: 'Capital contributions and shareholder advances require a shareholder counterparty',
      });
    }
    const event = createBusinessEvent({ ...input, type });
    return this.events.save({
      id: randomUUID(), tenantId: context.tenantId, companyId,
      actorId: context.actorId, traceId: context.traceId, event, createdAt: new Date(),
    });
  }

  async list(companyId: string, context: RequestContext): Promise<readonly SavedBusinessEvent[]> {
    if (!context.tenantId) throw new NotFoundException('Company not found');
    return this.events.list(context.tenantId, companyId);
  }

  async confirm(companyId: string, eventId: string, context: RequestContext): Promise<SavedBusinessEvent> {
    if (!context.tenantId) throw new NotFoundException('Business event not found');
    const setup = await this.ledgerSetups.find(context.tenantId, companyId);
    if (!setup) throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    assertAccountingPeriodOpen(setup);
    const existing = await this.events.find(context.tenantId, companyId, eventId);
    if (!existing) throw new NotFoundException('Business event not found');
    const confirmed = confirmBusinessEvent(existing, context.actorId, new Date());
    const saved = await this.events.confirm({
      tenantId: context.tenantId, companyId, actorId: context.actorId,
      traceId: context.traceId, event: { ...existing, ...confirmed },
    });
    if (!saved) throw new ConflictException({ code: 'EVENT_VERSION_CONFLICT', message: 'Business event changed; reload and retry' });
    return saved;
  }
}
