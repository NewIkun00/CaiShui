import { ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { OperationsRole } from '@ledgerly/domain';
import { IDENTITY_PROVIDER, type IdentityProviderPort } from './identity-provider.port.js';
import { IDENTITY_STORE, type IdentityStore } from './identity-store.js';
import { IdentityService } from './identity.service.js';
import { AuthTransactionCodec, type AuthTransactionPayload } from '../infrastructure/auth-transaction.codec.js';
import { authMode, oidcRedirectUri } from '../infrastructure/auth-mode.js';

export interface ActiveAuthentication {
  readonly userId: string;
  readonly sessionId: string;
  readonly issuer: string;
  readonly providerSessionId: string;
  readonly authMethods: readonly string[];
  readonly authenticatedAt: Date;
  readonly expiresAt: Date;
  readonly operationsRoles: readonly OperationsRole[];
}

@Injectable()
export class AuthenticationService {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityProviderPort,
    @Inject(IDENTITY_STORE) private readonly store: IdentityStore,
    private readonly identities: IdentityService,
    private readonly transactions: AuthTransactionCodec,
  ) {}

  async beginLogin(returnTo: string, traceId: string, intent: 'login' | 'register' = 'login') {
    return this.beginAuthorization(returnTo, traceId, intent);
  }

  async beginStepUp(returnTo: string, authenticated: ActiveAuthentication, traceId: string) {
    return this.beginAuthorization(returnTo, traceId, 'step-up', authenticated);
  }

  private async beginAuthorization(
    returnTo: string,
    traceId: string,
    intent: 'login' | 'register' | 'step-up',
    authenticated?: ActiveAuthentication,
  ) {
    if (authMode() !== 'oidc') throw new ServiceUnavailableException('OIDC login is disabled in development-headers mode');
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60_000);
    await this.store.createLoginState({ stateHash: this.hash(state), expiresAt, createdAt: now, traceId });
    const payload: AuthTransactionPayload = {
      state, nonce, codeVerifier, returnTo, expiresAt: expiresAt.toISOString(),
      ...(authenticated ? { expectedUserId: authenticated.userId, replaceSessionId: authenticated.sessionId } : {}),
    };
    return {
      authorizationUrl: this.provider.authorizationUrl({ state, nonce, codeChallenge, redirectUri: oidcRedirectUri(), intent }),
      expiresAt,
      transaction: this.transactions.seal(payload),
    };
  }

  async completeLogin(code: string, state: string, sealedTransaction: string, traceId: string) {
    const transaction = this.transactions.open(sealedTransaction);
    const now = new Date();
    if (new Date(transaction.expiresAt) <= now || !this.same(state, transaction.state)) {
      throw new UnauthorizedException({ code: 'OIDC_STATE_INVALID', message: 'Login state is invalid or expired' });
    }
    if (!await this.store.consumeLoginState(this.hash(state), now)) {
      throw new UnauthorizedException({ code: 'OIDC_STATE_REPLAYED', message: 'Login state has already been used or expired' });
    }
    const principal = await this.provider.exchangeAuthorizationCode({
      code,
      codeVerifier: transaction.codeVerifier,
      redirectUri: oidcRedirectUri(),
      expectedNonce: transaction.nonce,
    });
    const established = await this.identities.establishVerifiedIdentity(principal, traceId);
    if (transaction.expectedUserId && established.user.id !== transaction.expectedUserId) {
      await this.identities.revokeOwnSession(established.user.id, established.session.id, 'step-up identity mismatch', traceId);
      throw new ForbiddenException({ code: 'STEP_UP_IDENTITY_MISMATCH', message: 'Step-up must use the current account' });
    }
    if (transaction.replaceSessionId && transaction.replaceSessionId !== established.session.id) {
      await this.identities.revokeOwnSession(established.user.id, transaction.replaceSessionId, 'replaced by step-up session', traceId);
    }
    const memberships = await this.store.listMembershipsForUser(established.user.id);
    return { established, memberships, returnTo: transaction.returnTo };
  }

  async authenticate(sessionId: string): Promise<ActiveAuthentication | null> {
    const authenticated = await this.store.findAuthenticatedSession(sessionId, new Date());
    if (!authenticated) return null;
    return {
      userId: authenticated.user.id,
      sessionId: authenticated.session.id,
      issuer: authenticated.session.issuer,
      providerSessionId: authenticated.session.providerSessionId,
      authMethods: authenticated.session.authMethods,
      authenticatedAt: authenticated.session.authenticatedAt,
      expiresAt: authenticated.session.expiresAt,
      operationsRoles: await this.store.listOperationsRoles(authenticated.user.id),
    };
  }

  async current(sessionId: string) {
    const authenticated = await this.store.findAuthenticatedSession(sessionId, new Date());
    if (!authenticated) throw new UnauthorizedException('Session is invalid or expired');
    return { ...authenticated, memberships: await this.store.listMembershipsForUser(authenticated.user.id) };
  }

  async authorizeTenant(userId: string, tenantId: string, companyId?: string) {
    const membership = await this.store.findMember(tenantId, userId);
    if (!membership || membership.status !== 'active') throw new NotFoundException('Tenant not found');
    if (companyId && !membership.companyIds.includes(companyId)) {
      throw new ForbiddenException({ code: 'COMPANY_SCOPE_DENIED', message: 'Company is outside the member scope' });
    }
    return membership;
  }

  async logout(sessionId: string, traceId: string): Promise<{ providerRevoked: boolean }> {
    const current = await this.store.findAuthenticatedSession(sessionId, new Date());
    if (!current) return { providerRevoked: true };
    await this.identities.revokeOwnSession(current.user.id, sessionId, 'logout', traceId);
    try {
      await this.provider.revokeSession(current.session.issuer, current.session.providerSessionId);
      return { providerRevoked: true };
    } catch {
      return { providerRevoked: false };
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private same(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
