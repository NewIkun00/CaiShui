import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  operationsRoleAssignmentInputSchema,
  operationsRoleAssignmentListResponseSchema,
  operationsRoleAssignmentResponseSchema,
  operationsRoleRevocationInputSchema,
  operationsRoleSchema,
  type OperationsRoleAssignmentInput,
  type OperationsRoleRevocationInput,
} from '@ledgerly/contracts';
import type { OperationsRole } from '@ledgerly/domain';
import type { FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { ApiZodBody, ApiZodCreatedResponse, ApiZodOkResponse } from '../../../shared/zod-openapi.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { IdentityService } from '../application/identity.service.js';
import type { SavedOperationsRoleAssignment } from '../application/identity-store.js';
import { OperationsAccess } from './operations-resource.decorator.js';
import { RequireStepUp } from './step-up.decorator.js';

@ApiTags('operations-identity')
@OperationsAccess('identity')
@Controller('v1/operations/role-assignments')
export class OperationsIdentityController {
  constructor(private readonly identities: IdentityService) {}

  @Get()
  @ApiOperation({ summary: '平台管理员查看运营角色分配；不授予企业数据访问权' })
  @ApiZodOkResponse(operationsRoleAssignmentListResponseSchema)
  async list(@Req() request: FastifyRequest) {
    const items = await this.identities.listOperationsRoleAssignments(requestContext(request, false));
    return { items: items.map((item) => this.present(item)) };
  }

  @Post()
  @RequireStepUp()
  @ApiOperation({ summary: '经 MFA 为另一名活动用户分配平台运营角色' })
  @ApiZodBody(operationsRoleAssignmentInputSchema)
  @ApiZodCreatedResponse(operationsRoleAssignmentResponseSchema)
  async assign(
    @Body(new ZodValidationPipe(operationsRoleAssignmentInputSchema)) input: OperationsRoleAssignmentInput,
    @Req() request: FastifyRequest,
  ) {
    return this.present(await this.identities.assignOperationsRole(input, requestContext(request, false)));
  }

  @Post(':userId/:role/revoke')
  @RequireStepUp()
  @ApiOperation({ summary: '经 MFA 撤销另一名用户的平台运营角色' })
  @ApiZodBody(operationsRoleRevocationInputSchema)
  @ApiZodOkResponse(operationsRoleAssignmentResponseSchema)
  async revoke(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Param('role', new ZodValidationPipe(operationsRoleSchema)) role: OperationsRole,
    @Body(new ZodValidationPipe(operationsRoleRevocationInputSchema)) input: OperationsRoleRevocationInput,
    @Req() request: FastifyRequest,
  ) {
    return this.present(await this.identities.revokeOperationsRole(userId, role, input, requestContext(request, false)));
  }

  private present(item: SavedOperationsRoleAssignment) {
    return {
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
