import type { FastifyRequest } from 'fastify';
import type { ActiveAuthentication } from '../modules/identity/application/authentication.service.js';
import type { SavedTenantMember } from '../modules/identity/application/identity-store.js';

export interface AuthenticatedFastifyRequest extends FastifyRequest {
  authentication?: ActiveAuthentication;
  tenantMembership?: SavedTenantMember;
}

export function cookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}
