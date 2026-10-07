import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ledgerSetupSchema, type LedgerSetupRequest } from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { LedgerSetupService } from '../application/ledger-setup.service.js';

@ApiTags('ledger-setup')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/companies/:companyId/ledger-setup')
export class LedgerSetupController {
  constructor(private readonly ledgerSetup: LedgerSetupService) {}

  @Post()
  @ApiOperation({ summary: '创建资金账户、期初余额和首个会计期间' })
  async create(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(ledgerSetupSchema)) input: LedgerSetupRequest,
    @Req() request: FastifyRequest,
  ) {
    return this.present(await this.ledgerSetup.create(companyId, input, requestContext(request, true)));
  }

  @Get()
  @ApiOperation({ summary: '读取账套初始化结果' })
  async get(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() request: FastifyRequest,
  ) {
    return this.present(await this.ledgerSetup.get(companyId, requestContext(request, true)));
  }

  private present(result: Awaited<ReturnType<LedgerSetupService['get']>>) {
    return { ...result, createdAt: result.createdAt.toISOString() };
  }
}
