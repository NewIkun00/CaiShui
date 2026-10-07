import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { bootstrapTenantSchema, type BootstrapTenantInput } from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { OrganizationService } from '../application/organization.service.js';

@ApiTags('organization')
@ApiHeader({ name: 'x-user-id', required: true, description: '开发态用户 UUID' })
@Controller('v1')
export class OrganizationController {
  constructor(private readonly organizations: OrganizationService) {}

  @Post('tenants/bootstrap')
  @ApiOperation({ summary: '创建租户、所有者成员和首家公司' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tenantName', 'company'],
      properties: {
        tenantName: { type: 'string' },
        company: {
          type: 'object',
          required: ['name', 'unifiedSocialCreditCode', 'provinceCode', 'cityCode'],
          properties: {
            name: { type: 'string' },
            unifiedSocialCreditCode: { type: 'string', pattern: '^\\d{18}$' },
            provinceCode: { type: 'string', enum: ['32'] },
            cityCode: { type: 'string', pattern: '^32\\d{2}$' },
          },
        },
      },
    },
  })
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
  async getCompany(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() request: FastifyRequest,
  ) {
    const company = await this.organizations.getCompany(companyId, requestContext(request, true));
    return { ...company, createdAt: company.createdAt.toISOString() };
  }
}
