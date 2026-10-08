import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { companyProfileSchema, scopeEvaluationSchema, type CompanyProfileInput } from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { ApiZodBody, ApiZodCreatedResponse, ApiZodOkResponse } from '../../../shared/zod-openapi.js';
import { ProfileScopeService } from '../application/profile-scope.service.js';

@ApiTags('profile-scope')
@ApiHeader({ name: 'x-user-id', required: true })
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller('v1/companies/:companyId/scope-evaluations')
export class ProfileScopeController {
  constructor(private readonly profileScope: ProfileScopeService) {}

  @Post()
  @ApiOperation({ summary: '保存主体画像并生成适用性结论' })
  @ApiZodBody(companyProfileSchema)
  @ApiZodCreatedResponse(scopeEvaluationSchema)
  async evaluate(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body(new ZodValidationPipe(companyProfileSchema)) input: CompanyProfileInput,
    @Req() request: FastifyRequest,
  ) {
    return this.present(await this.profileScope.evaluate(companyId, input, requestContext(request, true)));
  }

  @Get('latest')
  @ApiOperation({ summary: '读取最近一次适用性结论' })
  @ApiZodOkResponse(scopeEvaluationSchema)
  async latest(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() request: FastifyRequest,
  ) {
    return this.present(await this.profileScope.latest(companyId, requestContext(request, true)));
  }

  private present(result: Awaited<ReturnType<ProfileScopeService['latest']>>) {
    return { ...result, evaluatedAt: result.evaluatedAt.toISOString() };
  }
}
