import type { ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepUpGuard } from '../src/modules/identity/presentation/step-up.guard.js';

describe('high-risk operation step-up guard', () => {
  afterEach(() => vi.unstubAllEnvs());

  function guardFor(authentication: { authMethods: string[]; authenticatedAt: Date }) {
    const reflector = { getAllAndOverride: () => true };
    const request = { authentication };
    const context = {
      getHandler: () => ({}), getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return () => new StepUpGuard(reflector as never).canActivate(context);
  }

  it('requires a fresh OTP or WebAuthn method', () => {
    vi.stubEnv('AUTH_MODE', 'oidc');
    expect(guardFor({ authMethods: ['pwd'], authenticatedAt: new Date() })).toThrow('Fresh multi-factor authentication');
    expect(guardFor({ authMethods: ['pwd', 'otp'], authenticatedAt: new Date(Date.now() - 16 * 60_000) })).toThrow('Fresh multi-factor authentication');
    expect(guardFor({ authMethods: ['webauthn'], authenticatedAt: new Date() })()).toBe(true);
  });
});
