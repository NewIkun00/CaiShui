import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  calculationRunInputSchema, calculationRunListResponseSchema, calculationRunResponseSchema,
  type CalculationRunInputRequest,
} from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { ApiZodBody, ApiZodCreatedResponse, ApiZodOkResponse } from '../../../shared/zod-openapi.js';
import { CalculationService } from '../application/calculation.service.js';

@ApiTags('calculation-runs')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/companies/:companyId/calculation-runs')
export class CalculationController {
  constructor(private readonly service: CalculationService) {}

  @Post()
  @ApiOperation({ summary: '冻结计算输入并选择唯一活动规则；无法确定时返回 DecisionRequired' })
  @ApiZodBody(calculationRunInputSchema)
  @ApiZodCreatedResponse(calculationRunResponseSchema)
  create(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(calculationRunInputSchema)) input: CalculationRunInputRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.service.createRun(companyId, input, requestContext(request, true));
  }

  @Get()
  @ApiOperation({ summary: '列出公司的不可变计算运行快照' })
  @ApiZodOkResponse(calculationRunListResponseSchema)
  async list(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() request: FastifyRequest,
  ) {
    return { items: await this.service.listRuns(companyId, requestContext(request, true)) };
  }
}
