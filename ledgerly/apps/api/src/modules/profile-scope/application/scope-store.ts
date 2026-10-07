import type { CompanyProfile, ScopeEvaluation } from '@ledgerly/domain';

export interface SavedScopeEvaluation extends ScopeEvaluation {
  readonly id: string;
  readonly companyId: string;
  readonly evaluatedAt: Date;
}

export interface SaveScopeRecord {
  readonly id: string;
  readonly profileId: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly actorId: string;
  readonly traceId: string;
  readonly profile: CompanyProfile;
  readonly evaluation: ScopeEvaluation;
  readonly evaluatedAt: Date;
}

export const SCOPE_STORE = Symbol('SCOPE_STORE');

export interface ScopeStore {
  save(record: SaveScopeRecord): Promise<SavedScopeEvaluation>;
  findLatest(tenantId: string, companyId: string): Promise<SavedScopeEvaluation | null>;
}
