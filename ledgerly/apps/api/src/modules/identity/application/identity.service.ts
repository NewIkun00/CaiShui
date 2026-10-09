import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { VerifiedProviderIdentity } from './identity-provider.port.js';
import { IDENTITY_STORE, type EstablishedIdentity, type IdentityStore } from './identity-store.js';

@Injectable()
export class IdentityService {
  constructor(@Inject(IDENTITY_STORE) private readonly store: IdentityStore) {}

  establishVerifiedIdentity(principal: VerifiedProviderIdentity, traceId: string): Promise<EstablishedIdentity> {
    if (principal.expiresAt <= principal.authenticatedAt) {
      throw new ConflictException({ code: 'IDENTITY_TOKEN_INVALID', message: 'Identity token expiry is invalid' });
    }
    const now = new Date();
    return this.store.establish({
      userId: randomUUID(),
      identityId: randomUUID(),
      sessionId: randomUUID(),
      principal,
      traceId,
      occurredAt: now,
    });
  }

  async revokeOwnSession(userId: string, sessionId: string, reason: string, traceId: string) {
    const current = await this.store.findSession(userId, sessionId);
    if (!current) throw new NotFoundException('Session not found');
    if (current.revokedAt) return current;
    const revoked = await this.store.revokeSession({
      userId,
      sessionId,
      actorId: userId,
      reason,
      traceId,
      occurredAt: new Date(),
    });
    if (!revoked) throw new ConflictException({ code: 'SESSION_REVOCATION_CONFLICT', message: 'Session changed concurrently' });
    return revoked;
  }
}
