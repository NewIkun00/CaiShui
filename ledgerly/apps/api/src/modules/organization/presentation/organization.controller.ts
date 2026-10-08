import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  bootstrapTenantResponseSchema, bootstrapTenantSchema, companySchema, type BootstrapTenantInput,
} from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { ApiZodBody, ApiZodCreatedResponse, ApiZodOkResponse } from '../../../shared/zod-openapi.js';
import { OrganizationService } from '../application/organization.service.js';

@ApiTags('organization')
@ApiHeader({ name: 'x-user-id', required: true, description: '开发态用户 UUID' })
@Controller('v1')
export class OrganizationController {
  constructor(private readonly organizations: OrganizationService) {}

  @Post('tenants/bootstrap')
  @ApiOperation({ summary: '创建租户、所有者成员和首家公司' })
  @ApiZodBody(bootstrapTenantSchema)
  @ApiZodCreatedResponse(bootstrapTenantResponseSchema)
  async bootstrap(
    @Body(new ZodValidationPipe(bootstrapTenantSchema)) input: BootstrapTenantInput,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.organizations.bootstrap(input, requestContext(request, false));
    return {
      tenantId: result.tenantId,
      company: { ...result.company, createdAt: result.company.createdAt.toISOString() },
    };
  }

  @Get('companies/:companyId')
  @ApiHeader({ name: 'x-tenant-id', required: true, description: '当前租户 UUID' })
  @ApiOperation({ summary: '读取当前租户内的公司' })
  @ApiZodOkResponse(companySchema)
  async getCompany(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() request: FastifyRequest,
  ) {
    const company = await this.organizations.getCompany(companyId, requestContext(request, true));
    return { ...company, createdAt: company.createdAt.toISOString() };
  }
}
