import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { RequestContext } from '../modules/organization/application/organization.service.js';
import type { AuthenticatedFastifyRequest } from './authenticated-request.js';
import { authMode } from '../modules/identity/infrastructure/auth-mode.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function requestContext(request: FastifyRequest, tenantRequired: boolean): RequestContext {
  const authenticated = (request as AuthenticatedFastifyRequest).authentication;
  const actorId = authenticated?.userId ?? (authMode() === 'development-headers' ? header(request, 'x-user-id') : undefined);
  const tenantId = header(request, 'x-tenant-id');
  const traceId = header(request, 'x-request-id') ?? 'missing-trace-id';
  if (!actorId || !UUID.test(actorId)) throw new UnauthorizedException('Valid x-user-id required');
  if (tenantRequired && (!tenantId || !UUID.test(tenantId))) {
    throw new BadRequestException('Valid x-tenant-id required');
  }
  return tenantId ? { actorId, tenantId, traceId } : { actorId, traceId };
}
