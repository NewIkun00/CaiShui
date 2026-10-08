import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  invoiceInputSchema, invoiceListResponseSchema, invoiceResponseSchema,
  mockInvoiceExtractionRequestSchema, mockInvoiceExtractionResponseSchema, type InvoiceInputRequest,
} from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { ApiZodBody, ApiZodCreatedResponse, ApiZodOkResponse } from '../../../shared/zod-openapi.js';
import { InvoiceService } from '../application/invoice.service.js';
import type { SavedInvoice } from '../application/invoice-store.js';

@ApiTags('invoices')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/companies/:companyId/invoices')
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Post()
  @ApiOperation({ summary: '新增发票草稿' })
  @ApiZodBody(invoiceInputSchema)
  @ApiZodCreatedResponse(invoiceResponseSchema)
  async create(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(invoiceInputSchema)) input: InvoiceInputRequest,
    @Req() request: FastifyRequest) {
    return this.present(await this.service.create(companyId, input, requestContext(request, true)));
  }

  @Get()
  @ApiOperation({ summary: '列出当前公司的发票' })
  @ApiZodOkResponse(invoiceListResponseSchema)
  async list(@Param('companyId', new ParseUUIDPipe()) companyId: string, @Req() request: FastifyRequest) {
    const items = await this.service.list(companyId, requestContext(request, true));
    return { items: items.map((item) => this.present(item)) };
  }

  @Post('extractions/mock')
  @ApiOperation({ summary: '使用确定性模拟适配器提取发票字段' })
  @ApiZodBody(mockInvoiceExtractionRequestSchema)
  @ApiZodCreatedResponse(mockInvoiceExtractionResponseSchema)
  extract(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(mockInvoiceExtractionRequestSchema)) input: { text: string },
    @Req() request: FastifyRequest) {
    return this.service.extract(companyId, input.text, requestContext(request, true));
  }

  @Post(':invoiceId/confirm')
  @ApiOperation({ summary: '确认发票事实' })
  @ApiZodCreatedResponse(invoiceResponseSchema)
  async confirm(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string, @Req() request: FastifyRequest) {
    return this.present(await this.service.confirm(companyId, invoiceId, requestContext(request, true)));
  }

  private present(item: SavedInvoice) {
    return {
      id: item.id, companyId: item.companyId, direction: item.direction, kind: item.kind, color: item.color,
      invoiceNumber: item.invoiceNumber, issuedOn: item.issuedOn, counterpartyId: item.counterpartyId,
      amountExcludingTax: item.amountExcludingTax.toString(), taxAmount: item.taxAmount.toString(),
      totalAmount: item.totalAmount.toString(), ...(item.remarks ? { remarks: item.remarks } : {}),
      source: item.source, status: item.status, version: item.version,
      createdAt: item.createdAt.toISOString(), ...(item.confirmedAt ? { confirmedAt: item.confirmedAt.toISOString() } : {}),
    };
  }
}
