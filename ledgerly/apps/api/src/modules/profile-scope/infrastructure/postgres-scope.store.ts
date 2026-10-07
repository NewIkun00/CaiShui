import { Inject, Injectable } from '@nestjs/common';
import { desc, and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import {
  auditEvents,
  companyProfiles,
  outboxEvents,
  scopeEvaluations,
} from '../../../infrastructure/database/schema.js';
import type { ScopeDecision, ScopeReason } from '@ledgerly/domain';
import type { SaveScopeRecord, SavedScopeEvaluation, ScopeStore } from '../application/scope-store.js';

@Injectable()
export class PostgresScopeStore implements ScopeStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(record: SaveScopeRecord): Promise<SavedScopeEvaluation> {
    await this.db.transaction(async (tx) => {
      await tx.insert(companyProfiles).values({
        id: record.profileId,
        tenantId: record.tenantId,
        companyId: record.companyId,
        ...record.profile,
        createdAt: record.evaluatedAt,
        createdBy: record.actorId,
        updatedAt: record.evaluatedAt,
        updatedBy: record.actorId,
      });
      await tx.insert(scopeEvaluations).values({
        id: record.id,
        tenantId: record.tenantId,
        companyId: record.companyId,
        profileId: record.profileId,
        decision: record.evaluation.decision,
        reasons: record.evaluation.reasons.map((reason) => ({ ...reason })),
        nextAction: record.evaluation.nextAction,
        evaluatedAt: record.evaluatedAt,
        evaluatedBy: record.actorId,
        traceId: record.traceId,
      });
      await tx.insert(auditEvents).values({
        id: randomUUID(),
        tenantId: record.tenantId,
        actorId: record.actorId,
        action: 'scope.evaluate',
        resourceType: 'company',
        resourceId: record.companyId,
        outcome: 'success',
        traceId: record.traceId,
        metadata: { decision: record.evaluation.decision },
      });
      await tx.insert(outboxEvents).values({
        id: randomUUID(),
        tenantId: record.tenantId,
        eventType: 'scope.evaluated.v1',
        aggregateType: 'company',
        aggregateId: record.companyId,
        payload: { evaluationId: record.id, decision: record.evaluation.decision },
        occurredAt: record.evaluatedAt,
      });
    });
    return this.toSaved(record);
  }

  async findLatest(tenantId: string, companyId: string): Promise<SavedScopeEvaluation | null> {
    const [row] = await this.db.select().from(scopeEvaluations)
      .where(and(eq(scopeEvaluations.tenantId, tenantId), eq(scopeEvaluations.companyId, companyId)))
      .orderBy(desc(scopeEvaluations.evaluatedAt)).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      companyId: row.companyId,
      decision: row.decision as ScopeDecision,
      reasons: row.reasons as ScopeReason[],
      nextAction: row.nextAction as SavedScopeEvaluation['nextAction'],
      evaluatedAt: row.evaluatedAt,
    };
  }

  private toSaved(record: SaveScopeRecord): SavedScopeEvaluation {
    return {
      id: record.id,
      companyId: record.companyId,
      ...record.evaluation,
      evaluatedAt: record.evaluatedAt,
    };
  }
}
