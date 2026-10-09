import type { ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { customerRolesPermit, operationsRolesPermit } from '../src/modules/identity/application/authorization.policy.js';
import { RbacGuard } from '../src/modules/identity/presentation/rbac.guard.js';
import { OPERATIONS_RESOURCE } from '../src/modules/identity/presentation/operations-resource.decorator.js';
import { PUBLIC_AUTH_ROUTE } from '../src/modules/identity/presentation/public-auth.decorator.js';

describe('global RBAC policy', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps customer and operations role domains separate', () => {
    expect(customerRolesPermit(['member'], 'customer.read')).toBe(true);
    expect(customerRolesPermit(['member'], 'customer.write')).toBe(false);
    expect(customerRolesPermit(['bookkeeper'], 'customer.write')).toBe(true);
    expect(operationsRolesPermit(['support_readonly'], 'policy.read')).toBe(true);
    expect(operationsRolesPermit(['support_readonly'], 'policy.manage')).toBe(false);
    expect(operationsRolesPermit(['rule_editor'], 'policy.manage')).toBe(true);
    expect(operationsRolesPermit(['accounting_reviewer'], 'review.manage')).toBe(true);
  });

  it('denies customer writes and operations management without their required roles', () => {
    vi.stubEnv('AUTH_MODE', 'oidc');
    const metadata = new Map<string, unknown>();
    const reflector = { getAllAndOverride: (key: string) => metadata.get(key) };
    const guard = new RbacGuard(reflector as never);
    const request = {
      method: 'POST',
      authentication: { operationsRoles: ['support_readonly'] },
      tenantMembership: { roles: ['member'] },
    };
    const context = {
      getHandler: () => ({}), getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow('Customer permission customer.write is required');
    delete (request as { tenantMembership?: unknown }).tenantMembership;
    metadata.set(OPERATIONS_RESOURCE, 'policy');
    expect(() => guard.canActivate(context)).toThrow('Operations permission policy.manage is required');
    metadata.set(PUBLIC_AUTH_ROUTE, true);
    expect(guard.canActivate(context)).toBe(true);
  });
});
