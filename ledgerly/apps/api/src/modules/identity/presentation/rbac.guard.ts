import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedFastifyRequest } from '../../../shared/authenticated-request.js';
import {
  customerRolesPermit,
  operationsRolesPermit,
  type CustomerPermission,
  type OperationsPermission,
  type OperationsResource,
} from '../application/authorization.policy.js';
import { authMode } from '../infrastructure/auth-mode.js';
import { OPERATIONS_RESOURCE } from './operations-resource.decorator.js';
import { PUBLIC_AUTH_ROUTE } from './public-auth.decorator.js';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_AUTH_ROUTE, [context.getHandler(), context.getClass()])) return true;
    // Header identities are an explicit local fixture adapter. Production authorization is always enforced below.
    if (authMode() === 'development-headers') return true;
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    const operationsResource = this.reflector.getAllAndOverride<OperationsResource>(OPERATIONS_RESOURCE, [
      context.getHandler(), context.getClass(),
    ]);
    if (operationsResource) {
      const permission: OperationsPermission = `${operationsResource}.${this.readOnly(request) ? 'read' : 'manage'}`;
      if (!request.authentication || !operationsRolesPermit(request.authentication.operationsRoles, permission)) {
        throw new ForbiddenException({ code: 'OPERATIONS_PERMISSION_DENIED', message: `Operations permission ${permission} is required` });
      }
    }
    if (request.tenantMembership) {
      const permission: CustomerPermission = this.readOnly(request) ? 'customer.read' : 'customer.write';
      if (!customerRolesPermit(request.tenantMembership.roles, permission)) {
        throw new ForbiddenException({ code: 'CUSTOMER_PERMISSION_DENIED', message: `Customer permission ${permission} is required` });
      }
    }
    return true;
  }

  private readOnly(request: FastifyRequest): boolean {
    return request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS';
  }
}
