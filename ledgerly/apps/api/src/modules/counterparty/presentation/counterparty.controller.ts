import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { counterpartyInputSchema, type CounterpartyInputRequest } from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { CounterpartyService } from '../application/counterparty.service.js';
import type { SavedCounterparty } from '../application/counterparty-store.js';

@ApiTags('counterparties')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/companies/:companyId/counterparties')
export class CounterpartyController {
  constructor(private readonly service: CounterpartyService) {}

  @Post()
  @ApiOperation({ summary: '新增客户、供应商、股东或员工' })
  async create(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(counterpartyInputSchema)) input: CounterpartyInputRequest,
    @Req() request: FastifyRequest) {
    return this.present(await this.service.create(companyId, input, requestContext(request, true)));
  }

  @Get()
  @ApiOperation({ summary: '列出当前公司的往来单位' })
  async list(@Param('companyId', new ParseUUIDPipe()) companyId: string, @Req() request: FastifyRequest) {
    const items = await this.service.list(companyId, requestContext(request, true));
    return { items: items.map((item) => this.present(item)) };
  }

  private present(item: SavedCounterparty) {
    return {
      id: item.id, companyId: item.companyId, name: item.name, type: item.type,
      ...(item.taxId ? { taxId: item.taxId } : {}),
      ...(item.contactName ? { contactName: item.contactName } : {}),
      ...(item.phone ? { phone: item.phone } : {}),
      ...(item.notes ? { notes: item.notes } : {}),
      isRelatedParty: item.isRelatedParty, version: item.version,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
