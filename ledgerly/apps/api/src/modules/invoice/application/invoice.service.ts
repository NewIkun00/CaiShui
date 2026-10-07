import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { InvoiceInputRequest } from '@ledgerly/contracts';
import {
  confirmInvoice, CounterpartyType, createInvoice, InvoiceColor, InvoiceDirection,
  InvoiceError, InvoiceKind, normalizeCounterpartyName, normalizeInvoiceNumber,
} from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import { COUNTERPARTY_STORE, type CounterpartyStore } from '../../counterparty/application/counterparty-store.js';
import { LEDGER_SETUP_STORE, type LedgerSetupStore } from '../../ledger-setup/application/ledger-setup-store.js';
import { assertAccountingPeriodOpen } from '../../ledger-setup/application/accounting-period-guard.js';
import type { RequestContext } from '../../organization/application/organization.service.js';
import { INVOICE_EXTRACTION_PROVIDER, type InvoiceExtractionProvider } from './invoice-extraction-provider.js';
import { INVOICE_STORE, type InvoiceStore, type SavedInvoice } from './invoice-store.js';

@Injectable()
export class InvoiceService {
  constructor(
    @Inject(LEDGER_SETUP_STORE) private readonly ledgerSetups: LedgerSetupStore,
    @Inject(COUNTERPARTY_STORE) private readonly counterparties: CounterpartyStore,
    @Inject(INVOICE_STORE) private readonly invoices: InvoiceStore,
    @Inject(INVOICE_EXTRACTION_PROVIDER) private readonly extractor: InvoiceExtractionProvider,
  ) {}

  async create(companyId: string, input: InvoiceInputRequest, context: RequestContext): Promise<SavedInvoice> {
    const tenantId = await this.requireLedger(companyId, context, true);
    const counterparty = await this.counterparties.findById(tenantId, companyId, input.counterpartyId);
    if (!counterparty) throw new NotFoundException('Counterparty not found');
    if (input.direction === 'output' && counterparty.type !== CounterpartyType.Customer) {
      throw new ConflictException({ code: 'CUSTOMER_REQUIRED', message: 'An output invoice requires a customer counterparty' });
    }
    if (input.direction === 'input' && counterparty.type !== CounterpartyType.Supplier) {
      throw new ConflictException({ code: 'SUPPLIER_REQUIRED', message: 'An input invoice requires a supplier counterparty' });
    }
    const direction = input.direction as InvoiceDirection;
    const number = normalizeInvoiceNumber(input.invoiceNumber);
    if (await this.invoices.exists(tenantId, companyId, direction, number)) {
      throw new ConflictException({ code: 'INVOICE_EXISTS', message: 'The invoice number already exists in this direction' });
    }
    try {
      const invoice = createInvoice({
        ...input, direction, kind: input.kind as InvoiceKind, color: input.color as InvoiceColor,
      }, input.source);
      return this.invoices.save({
        id: randomUUID(), tenantId, companyId, actorId: context.actorId,
        traceId: context.traceId, invoice, createdAt: new Date(),
      });
    } catch (error: unknown) {
      if (error instanceof InvoiceError) throw new BadRequestException({ code: 'INVALID_INVOICE', message: error.message });
      throw error;
    }
  }

  async list(companyId: string, context: RequestContext): Promise<readonly SavedInvoice[]> {
    if (!context.tenantId) throw new NotFoundException('Company not found');
    return this.invoices.list(context.tenantId, companyId);
  }

  async confirm(companyId: string, invoiceId: string, context: RequestContext): Promise<SavedInvoice> {
    if (!context.tenantId) throw new NotFoundException('Invoice not found');
    const setup = await this.ledgerSetups.find(context.tenantId, companyId);
    if (!setup) throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    assertAccountingPeriodOpen(setup);
    const existing = await this.invoices.find(context.tenantId, companyId, invoiceId);
    if (!existing) throw new NotFoundException('Invoice not found');
    let confirmed;
    try { confirmed = confirmInvoice(existing, context.actorId, new Date()); }
    catch (error: unknown) {
      if (error instanceof InvoiceError) throw new ConflictException({ code: 'INVOICE_NOT_DRAFT', message: error.message });
      throw error;
    }
    const saved = await this.invoices.confirm({
      tenantId: context.tenantId, companyId, actorId: context.actorId,
      traceId: context.traceId, invoice: { ...existing, ...confirmed },
    });
    if (!saved) throw new ConflictException({ code: 'INVOICE_VERSION_CONFLICT', message: 'Invoice changed; reload and retry' });
    return saved;
  }

  async extract(companyId: string, text: string, context: RequestContext) {
    const tenantId = await this.requireLedger(companyId, context, false);
    const extracted = await this.extractor.extract(text);
    const parties = await this.counterparties.list(tenantId, companyId);
    const name = extracted.candidate.counterpartyName;
    const match = name ? parties.find((item) => item.normalizedName === normalizeCounterpartyName(name)) : undefined;
    return {
      ...extracted,
      candidate: { ...extracted.candidate, ...(match ? { counterpartyId: match.id } : {}) },
      warnings: [...extracted.warnings, ...(name && !match ? ['未找到同名往来单位，请人工选择'] : [])],
    };
  }

  private async requireLedger(companyId: string, context: RequestContext, requireOpen: boolean): Promise<string> {
    if (!context.tenantId) {
      throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    }
    const setup = await this.ledgerSetups.find(context.tenantId, companyId);
    if (!setup) throw new ConflictException({ code: 'LEDGER_SETUP_REQUIRED', message: 'Ledger setup is required' });
    if (requireOpen) assertAccountingPeriodOpen(setup);
    return context.tenantId;
  }
}
