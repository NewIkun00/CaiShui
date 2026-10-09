import { BadRequestException, CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { AuthenticationService } from '../application/authentication.service.js';
import { authMode } from '../infrastructure/auth-mode.js';
import { cookie, type AuthenticatedFastifyRequest } from '../../../shared/authenticated-request.js';
import { PUBLIC_AUTH_ROUTE } from './public-auth.decorator.js';

export const SESSION_COOKIE = 'ledgerly_session';
export const OIDC_TRANSACTION_COOKIE = 'ledgerly_oidc_transaction';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authentication: AuthenticationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_AUTH_ROUTE, [context.getHandler(), context.getClass()])) return true;
    if (authMode() === 'development-headers') return true;
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    if (request.headers['x-user-id']) throw new UnauthorizedException('Development identity headers are forbidden in OIDC mode');
    const sessionId = cookie(request as FastifyRequest, SESSION_COOKIE);
    if (!sessionId) throw new UnauthorizedException('Authenticated session required');
    const authenticated = await this.authentication.authenticate(sessionId);
    if (!authenticated) throw new UnauthorizedException('Session is invalid, expired or revoked');
    request.authentication = authenticated;
    const tenantHeader = request.headers['x-tenant-id'];
    const tenantId = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;
    if (tenantId) {
      if (!UUID.test(tenantId)) throw new BadRequestException('Valid x-tenant-id required');
      const params = request.params as { companyId?: string } | undefined;
      request.tenantMembership = await this.authentication.authorizeTenant(
        authenticated.userId,
        tenantId,
        params?.companyId,
      );
    }
    return true;
  }
}
