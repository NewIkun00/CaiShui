import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  tenantInvitationAcceptSchema,
  tenantInvitationInputSchema,
  tenantInvitationResponseSchema,
  tenantMemberDeactivateSchema,
  tenantMemberListResponseSchema,
  tenantMemberResponseSchema,
  type TenantInvitationAcceptInput,
  type TenantInvitationInput,
  type TenantMemberDeactivateInput,
} from '@ledgerly/contracts';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ApiZodBody, ApiZodCreatedResponse, ApiZodOkResponse } from '../../../shared/zod-openapi.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { IdentityService } from '../application/identity.service.js';
import type { SavedTenantMember } from '../application/identity-store.js';

@ApiTags('identity')
@ApiHeader({ name: 'x-user-id', required: true, description: '开发态用户 UUID；R5 OIDC 接入后由可信会话提供' })
@Controller('v1')
export class IdentityController {
  constructor(private readonly identities: IdentityService) {}

  @Post('tenants/:tenantId/invitations')
  @ApiHeader({ name: 'x-tenant-id', required: true, description: '当前租户 UUID' })
  @ApiOperation({ summary: '由租户管理员邀请成员并限定公司范围' })
  @ApiZodBody(tenantInvitationInputSchema)
  @ApiZodCreatedResponse(tenantInvitationResponseSchema)
  async invite(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body(new ZodValidationPipe(tenantInvitationInputSchema)) input: TenantInvitationInput,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.identities.inviteMember(tenantId, input, requestContext(request, true));
    return {
      id: result.invitation.id,
      tenantId: result.invitation.tenantId,
      identifierHint: result.invitation.identifierHint,
      roles: result.invitation.roles,
      companyIds: result.invitation.companyIds,
      status: result.invitation.status,
      expiresAt: result.invitation.expiresAt.toISOString(),
      createdAt: result.invitation.createdAt.toISOString(),
      createdBy: result.invitation.createdBy,
      ...(result.developmentToken ? { developmentToken: result.developmentToken } : {}),
    };
  }

  @Post('tenant-invitations/accept')
  @ApiOperation({ summary: '已验证身份接受租户邀请' })
  @ApiZodBody(tenantInvitationAcceptSchema)
  @ApiZodOkResponse(tenantMemberResponseSchema)
  async accept(
    @Body(new ZodValidationPipe(tenantInvitationAcceptSchema)) input: TenantInvitationAcceptInput,
    @Req() request: FastifyRequest,
  ) {
    return this.presentMember(await this.identities.acceptInvitation(input.token, requestContext(request, false)));
  }

  @Get('tenants/:tenantId/members')
  @ApiHeader({ name: 'x-tenant-id', required: true, description: '当前租户 UUID' })
  @ApiOperation({ summary: '租户管理员查看成员与公司权限范围' })
  @ApiZodOkResponse(tenantMemberListResponseSchema)
  async list(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Req() request: FastifyRequest,
  ) {
    const items = await this.identities.listMembers(tenantId, requestContext(request, true));
    return { items: items.map((member) => this.presentMember(member)) };
  }

  @Post('tenants/:tenantId/members/:userId/deactivate')
  @ApiHeader({ name: 'x-tenant-id', required: true, description: '当前租户 UUID' })
  @ApiOperation({ summary: '租户管理员停用成员' })
  @ApiZodBody(tenantMemberDeactivateSchema)
  @ApiZodOkResponse(tenantMemberResponseSchema)
  async deactivate(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(tenantMemberDeactivateSchema)) input: TenantMemberDeactivateInput,
    @Req() request: FastifyRequest,
  ) {
    return this.presentMember(await this.identities.deactivateMember(
      tenantId,
      userId,
      input,
      requestContext(request, true),
    ));
  }

  private presentMember(member: SavedTenantMember) {
    return {
      tenantId: member.tenantId,
      userId: member.userId,
      displayName: member.displayName,
      status: member.status,
      roles: member.roles,
      companyIds: member.companyIds,
      version: member.version,
      ...(member.activatedAt ? { activatedAt: member.activatedAt.toISOString() } : {}),
      ...(member.deactivatedAt ? { deactivatedAt: member.deactivatedAt.toISOString() } : {}),
    };
  }
}
