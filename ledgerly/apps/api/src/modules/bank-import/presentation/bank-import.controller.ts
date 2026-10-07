import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { bankCsvImportRequestSchema, type BankCsvImportRequest } from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import type { BankImportBatch } from '../application/bank-import-store.js';
import { BankImportService } from '../application/bank-import.service.js';

@ApiTags('bank-imports')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/companies/:companyId/imports/bank-csv')
export class BankImportController {
  constructor(private readonly service: BankImportService) {}

  @Post()
  @ApiOperation({ summary: '上传并校验银行 CSV V1 模板' })
  async upload(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(bankCsvImportRequestSchema)) input: BankCsvImportRequest,
    @Req() request: FastifyRequest) {
    return this.present(await this.service.upload(companyId, input, requestContext(request, true)));
  }

  @Get(':batchId')
  async get(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('batchId', new ParseUUIDPipe()) batchId: string, @Req() request: FastifyRequest) {
    return this.present(await this.service.get(companyId, batchId, requestContext(request, true)));
  }

  @Post(':batchId/confirm')
  @ApiOperation({ summary: '确认有效银行流水并生成已确认业务事件' })
  async confirm(@Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Param('batchId', new ParseUUIDPipe()) batchId: string, @Req() request: FastifyRequest) {
    return this.present(await this.service.confirm(companyId, batchId, requestContext(request, true)));
  }

  private present(batch: BankImportBatch) {
    return {
      ...batch, createdAt: batch.createdAt.toISOString(),
      ...(batch.confirmedAt ? { confirmedAt: batch.confirmedAt.toISOString() } : {}),
    };
  }
}
