import { Injectable } from '@nestjs/common';
import type { SaveScopeRecord, SavedScopeEvaluation, ScopeStore } from '../application/scope-store.js';

@Injectable()
export class MemoryScopeStore implements ScopeStore {
  private readonly evaluations = new Map<string, SavedScopeEvaluation>();

  save(record: SaveScopeRecord): Promise<SavedScopeEvaluation> {
    const saved: SavedScopeEvaluation = Object.freeze({
      id: record.id,
      profileId: record.profileId,
      companyId: record.companyId,
      profile: record.profile,
      decision: record.evaluation.decision,
      reasons: record.evaluation.reasons,
      nextAction: record.evaluation.nextAction,
      evaluatedAt: record.evaluatedAt,
    });
    this.evaluations.set(this.key(record.tenantId, record.companyId), saved);
    return Promise.resolve(saved);
  }

  findLatest(tenantId: string, companyId: string): Promise<SavedScopeEvaluation | null> {
    return Promise.resolve(this.evaluations.get(this.key(tenantId, companyId)) ?? null);
  }

  private key(tenantId: string, companyId: string): string {
    return `${tenantId}:${companyId}`;
  }
}
