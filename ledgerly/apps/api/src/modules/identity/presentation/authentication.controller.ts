import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  authCallbackInputSchema,
  authCurrentResponseSchema,
  authLoginInputSchema,
  authLoginResponseSchema,
  authLogoutResponseSchema,
  type AuthCallbackInput,
  type AuthLoginInput,
} from '@ledgerly/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { requestContext } from '../../../shared/request-context.js';
import { cookie } from '../../../shared/authenticated-request.js';
import { ApiZodBody, ApiZodCreatedResponse, ApiZodOkResponse } from '../../../shared/zod-openapi.js';
import { ZodValidationPipe } from '../../../shared/zod-validation.pipe.js';
import { AuthenticationService } from '../application/authentication.service.js';
import type { SavedTenantMember } from '../application/identity-store.js';
import { PublicAuth } from './public-auth.decorator.js';
import { OIDC_TRANSACTION_COOKIE, SESSION_COOKIE } from './session-auth.guard.js';
import type { AuthenticatedFastifyRequest } from '../../../shared/authenticated-request.js';

@ApiTags('authentication')
@Controller('v1/auth')
export class AuthenticationController {
  constructor(private readonly authentication: AuthenticationService) {}

  @PublicAuth()
  @Post('login')
  @ApiOperation({ summary: '创建 OIDC Authorization Code + PKCE 登录事务' })
  @ApiZodBody(authLoginInputSchema)
  @ApiZodCreatedResponse(authLoginResponseSchema)
  async login(
    @Body(new ZodValidationPipe(authLoginInputSchema)) input: AuthLoginInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const traceId = this.traceId(request);
    const result = await this.authentication.beginLogin(input.returnTo, traceId, 'login');
    reply.header('set-cookie', this.cookie(OIDC_TRANSACTION_COOKIE, result.transaction, 600, '/v1/auth'));
    return { authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt.toISOString() };
  }

  @PublicAuth()
  @Post('register')
  @ApiOperation({ summary: '创建 OIDC 注册事务；新身份登录后进入企业建档' })
  @ApiZodBody(authLoginInputSchema)
  @ApiZodCreatedResponse(authLoginResponseSchema)
  async register(
    @Body(new ZodValidationPipe(authLoginInputSchema)) input: AuthLoginInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.authentication.beginLogin(input.returnTo, this.traceId(request), 'register');
    reply.header('set-cookie', this.cookie(OIDC_TRANSACTION_COOKIE, result.transaction, 600, '/v1/auth'));
    return { authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt.toISOString() };
  }

  @Post('step-up')
  @ApiOperation({ summary: '为当前账号发起高风险操作二次认证' })
  @ApiZodBody(authLoginInputSchema)
  @ApiZodCreatedResponse(authLoginResponseSchema)
  async stepUp(
    @Body(new ZodValidationPipe(authLoginInputSchema)) input: AuthLoginInput,
    @Req() request: AuthenticatedFastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (!request.authentication) throw new UnauthorizedException('Authenticated session required');
    const result = await this.authentication.beginStepUp(input.returnTo, request.authentication, this.traceId(request));
    reply.header('set-cookie', this.cookie(OIDC_TRANSACTION_COOKIE, result.transaction, 600, '/v1/auth'));
    return { authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt.toISOString() };
  }

  @PublicAuth()
  @Post('callback')
  @ApiOperation({ summary: '完成 OIDC 回调并建立 HttpOnly BFF 会话' })
  @ApiZodBody(authCallbackInputSchema)
  @ApiZodOkResponse(authCurrentResponseSchema)
  async callback(
    @Body(new ZodValidationPipe(authCallbackInputSchema)) input: AuthCallbackInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const transaction = cookie(request, OIDC_TRANSACTION_COOKIE);
    if (!transaction) throw new UnauthorizedException('OIDC transaction cookie required');
    const result = await this.authentication.completeLogin(input.code, input.state, transaction, this.traceId(request));
    const maxAge = Math.max(0, Math.floor((result.established.session.expiresAt.getTime() - Date.now()) / 1000));
    reply.header('set-cookie', [
      this.cookie(SESSION_COOKIE, result.established.session.id, maxAge, '/'),
      this.clearCookie(OIDC_TRANSACTION_COOKIE, '/v1/auth'),
    ]);
    return {
      user: { id: result.established.user.id, displayName: result.established.user.displayName, status: result.established.user.status },
      session: {
        id: result.established.session.id, authMethods: result.established.session.authMethods,
        authenticatedAt: result.established.session.authenticatedAt.toISOString(),
        expiresAt: result.established.session.expiresAt.toISOString(),
      },
      memberships: result.memberships.map((member) => this.presentMember(member)),
      operationsRoles: result.operationsRoles,
      returnTo: result.returnTo,
    };
  }

  @Get('me')
  @ApiOperation({ summary: '读取当前正式用户、会话和活动租户成员关系' })
  @ApiZodOkResponse(authCurrentResponseSchema)
  async me(@Req() request: FastifyRequest) {
    const sessionId = cookie(request, SESSION_COOKIE);
    if (!sessionId) throw new UnauthorizedException('Authenticated session required');
    const current = await this.authentication.current(sessionId);
    return {
      user: { id: current.user.id, displayName: current.user.displayName, status: current.user.status },
      session: {
        id: current.session.id, authMethods: current.session.authMethods,
        authenticatedAt: current.session.authenticatedAt.toISOString(), expiresAt: current.session.expiresAt.toISOString(),
      },
      memberships: current.memberships.map((member) => this.presentMember(member)),
      operationsRoles: current.operationsRoles,
    };
  }

  @Post('logout')
  @ApiOperation({ summary: '撤销本地会话并请求撤销 Provider 会话' })
  @ApiZodOkResponse(authLogoutResponseSchema)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const sessionId = cookie(request, SESSION_COOKIE);
    if (!sessionId) throw new UnauthorizedException('Authenticated session required');
    const result = await this.authentication.logout(sessionId, requestContext(request, false).traceId);
    reply.header('set-cookie', this.clearCookie(SESSION_COOKIE, '/'));
    return result;
  }

  private presentMember(member: SavedTenantMember) {
    return {
      tenantId: member.tenantId, userId: member.userId, displayName: member.displayName,
      status: member.status, roles: member.roles, companyIds: member.companyIds, version: member.version,
      ...(member.activatedAt ? { activatedAt: member.activatedAt.toISOString() } : {}),
      ...(member.deactivatedAt ? { deactivatedAt: member.deactivatedAt.toISOString() } : {}),
    };
  }

  private traceId(request: FastifyRequest): string {
    const value = request.headers['x-request-id'];
    return typeof value === 'string' ? value : 'missing-trace-id';
  }

  private cookie(name: string, value: string, maxAge: number, path: string): string {
    const secure = process.env['NODE_ENV'] === 'production' ? '; Secure' : '';
    return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  }

  private clearCookie(name: string, path: string): string {
    return `${name}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0${process.env['NODE_ENV'] === 'production' ? '; Secure' : ''}`;
  }
}
