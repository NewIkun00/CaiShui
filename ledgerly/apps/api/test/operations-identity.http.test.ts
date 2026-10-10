import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthenticationService } from '../src/modules/identity/application/authentication.service.js';
import { IDENTITY_PROVIDER } from '../src/modules/identity/application/identity-provider.port.js';
import { IDENTITY_STORE } from '../src/modules/identity/application/identity-store.js';
import { IdentityService } from '../src/modules/identity/application/identity.service.js';
import { AuthTransactionCodec } from '../src/modules/identity/infrastructure/auth-transaction.codec.js';
import { MemoryIdentityStore } from '../src/modules/identity/infrastructure/memory-identity.store.js';
import { IdentityController } from '../src/modules/identity/presentation/identity.controller.js';
import { OperationsIdentityController } from '../src/modules/identity/presentation/operations-identity.controller.js';
import { RbacGuard } from '../src/modules/identity/presentation/rbac.guard.js';
import { SessionAuthGuard } from '../src/modules/identity/presentation/session-auth.guard.js';
import { StepUpGuard } from '../src/modules/identity/presentation/step-up.guard.js';

const tenantId = '10000000-0000-4000-8000-000000000001';
const companyId = '20000000-0000-4000-8000-000000000001';

describe('operations identity HTTP boundary', () => {
  let app: NestFastifyApplication;
  let store: MemoryIdentityStore;
  let identities: IdentityService;
  let alice: Awaited<ReturnType<IdentityService['establishVerifiedIdentity']>>;
  let aliceElevated: Awaited<ReturnType<IdentityService['establishVerifiedIdentity']>>;
  let bob: Awaited<ReturnType<IdentityService['establishVerifiedIdentity']>>;

  beforeAll(async () => {
    vi.stubEnv('AUTH_MODE', 'oidc');
    vi.stubEnv('STORAGE_MODE', 'memory');
    vi.stubEnv('AUTH_COOKIE_KEY', Buffer.alloc(32, 7).toString('base64'));
    const module = await Test.createTestingModule({
      controllers: [OperationsIdentityController, IdentityController],
      providers: [
        MemoryIdentityStore,
        { provide: IDENTITY_STORE, useExisting: MemoryIdentityStore },
        {
          provide: IDENTITY_PROVIDER,
          useValue: {
            authorizationUrl: () => 'https://identity.example.test/authorize',
            exchangeAuthorizationCode: () => Promise.reject(new Error('not used')),
            verifyAccessToken: () => Promise.reject(new Error('not used')),
            revokeSession: () => Promise.resolve(),
          },
        },
        IdentityService,
        AuthenticationService,
        AuthTransactionCodec,
        {
          provide: SessionAuthGuard,
          inject: [Reflector, AuthenticationService],
          useFactory: (reflector: Reflector, authentication: AuthenticationService) =>
            new SessionAuthGuard(reflector, authentication),
        },
        { provide: APP_GUARD, useExisting: SessionAuthGuard },
        {
          provide: RbacGuard,
          inject: [Reflector],
          useFactory: (reflector: Reflector) => new RbacGuard(reflector),
        },
        { provide: APP_GUARD, useExisting: RbacGuard },
        {
          provide: StepUpGuard,
          inject: [Reflector],
          useFactory: (reflector: Reflector) => new StepUpGuard(reflector),
        },
        { provide: APP_GUARD, useExisting: StepUpGuard },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    store = module.get(MemoryIdentityStore);
    identities = module.get(IdentityService);
    alice = await establish('alice', 'pwd');
    aliceElevated = await establish('alice', 'otp');
    bob = await establish('bob', 'pwd');
    await store.assignOperationsRole({
      userId: alice.user.id,
      role: 'platform_admin',
      actorId: alice.user.id,
      traceId: 'bootstrap-http-test',
      occurredAt: new Date(),
    });
    await identities.bootstrapOwner(tenantId, alice.user.id, companyId);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  it('enforces authentication, platform RBAC, fresh MFA and self-grant separation', async () => {
    expect((await request('GET', '/v1/operations/role-assignments')).statusCode).toBe(401);
    expect(
      (await request('GET', '/v1/operations/role-assignments', bob.session.id)).statusCode,
    ).toBe(403);
    expect(
      (
        await request('POST', '/v1/operations/role-assignments', alice.session.id, {
          userId: bob.user.id,
          role: 'rule_editor',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request('POST', '/v1/operations/role-assignments', aliceElevated.session.id, {
          userId: alice.user.id,
          role: 'security_auditor',
        })
      ).statusCode,
    ).toBe(403);
  });

  it('applies assignment and revocation immediately without granting tenant access', async () => {
    const assigned = await request(
      'POST',
      '/v1/operations/role-assignments',
      aliceElevated.session.id,
      { userId: bob.user.id, role: 'rule_editor' },
    );
    expect(assigned.statusCode).toBe(201);
    expect(assigned.json()).toMatchObject({
      userId: bob.user.id,
      role: 'rule_editor',
      status: 'active',
      version: 1,
    });
    expect(await store.listOperationsRoles(bob.user.id)).toContain('rule_editor');

    const tenantAttempt = await request(
      'GET',
      `/v1/tenants/${tenantId}/members`,
      bob.session.id,
      undefined,
      { 'x-tenant-id': tenantId },
    );
    expect(tenantAttempt.statusCode).toBe(404);

    const revoked = await request(
      'POST',
      `/v1/operations/role-assignments/${bob.user.id}/rule_editor/revoke`,
      aliceElevated.session.id,
      { expectedVersion: 1, reason: 'HTTP 验收撤销规则编辑权限' },
    );
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toMatchObject({ status: 'removed', version: 2 });
    expect(await store.listOperationsRoles(bob.user.id)).not.toContain('rule_editor');
  });

  async function establish(subject: string, secondFactor: 'pwd' | 'otp') {
    const now = new Date();
    return identities.establishVerifiedIdentity(
      {
        issuer: 'https://identity.example.test',
        subject,
        providerSessionId: `${subject}-${secondFactor}-session`,
        displayName: subject === 'alice' ? 'Alice 管理员' : 'Bob 运营用户',
        identifierHint: `${subject[0]}***@example.test`,
        authMethods: secondFactor === 'otp' ? ['pwd', 'otp'] : ['pwd'],
        authenticatedAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
      },
      `trace-${subject}-${secondFactor}`,
    );
  }

  function request(
    method: 'GET' | 'POST',
    url: string,
    sessionId?: string,
    payload?: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    return app.inject({
      method,
      url,
      headers: {
        ...headers,
        'x-request-id': `http-${method.toLowerCase()}`,
        ...(sessionId ? { cookie: `ledgerly_session=${sessionId}` } : {}),
      },
      ...(payload ? { payload } : {}),
    });
  }
});
