import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  businessEventInputSchema, businessEventListResponseSchema, businessEventResponseSchema,
  type BusinessEventInputRequest,
} from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { ApiZodBody, ApiZodCreatedResponse, ApiZodOkResponse } from '../../../shared/zod-openapi.js';
import type { SavedBusinessEvent } from '../application/business-event-store.js';
import { BusinessEventService } from '../application/business-event.service.js';

@ApiTags('business-events')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/companies/:companyId/business-events')
export class BusinessEventController {
  constructor(private readonly service: BusinessEventService) {}

  @Post()
  @ApiOperation({ summary: '手工创建业务事件草稿' })
  @ApiZodBody(businessEventInputSchema)
  @ApiZodCreatedResponse(businessEventResponseSchema)
  async create(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(businessEventInputSchema)) input: BusinessEventInputRequest,
    @Req() request: FastifyRequest) {
    return this.present(await this.service.create(companyId, input, requestContext(request, true)));
  }

  @Get()
  @ApiOperation({ summary: '列出业务事件' })
  @ApiZodOkResponse(businessEventListResponseSchema)
  async list(@Param('companyId', new ParseUUIDPipe()) companyId: string, @Req() request: FastifyRequest) {
    const items = await this.service.list(companyId, requestContext(request, true));
    return { items: items.map((item) => this.present(item)) };
  }

  @Post(':eventId/confirm')
  @ApiOperation({ summary: '确认业务事件并冻结该版本' })
  @ApiZodCreatedResponse(businessEventResponseSchema)
  async confirm(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string, @Req() request: FastifyRequest) {
    return this.present(await this.service.confirm(companyId, eventId, requestContext(request, true)));
  }

  private present(event: SavedBusinessEvent) {
    return {
      id: event.id, companyId: event.companyId, type: event.type,
      occurredOn: event.occurredOn, amount: event.amount.toString(),
      counterpartyId: event.counterpartyId, description: event.description,
      source: event.source, status: event.status, version: event.version,
      createdAt: event.createdAt.toISOString(),
      ...(event.confirmedAt ? { confirmedAt: event.confirmedAt.toISOString() } : {}),
    };
  }
}
