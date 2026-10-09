import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import {
  CalculationRunStatus, TaxType, type CalculationDecisionCode, type CalculationExplanationStep,
} from '@ledgerly/domain';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../../../infrastructure/database/database.provider.js';
import {
  auditEvents, calculationRunFacts, calculationRuns, calculationRunSteps, outboxEvents,
} from '../../../infrastructure/database/schema.js';
import type {
  CalculationInputSnapshot, CalculationStore, SaveCalculationRunRecord, SavedCalculationRun,
} from '../application/calculation-store.js';

@Injectable()
export class PostgresCalculationStore implements CalculationStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(record: SaveCalculationRunRecord): Promise<SavedCalculationRun> {
    await this.db.transaction(async (tx) => {
      await tx.insert(calculationRuns).values({
        id: record.run.id, tenantId: record.run.tenantId, companyId: record.run.companyId,
        taxType: record.run.taxType, periodStart: record.run.periodStart, periodEnd: record.run.periodEnd,
        status: record.run.status, inputSnapshot: record.run.inputSnapshot, inputHash: record.run.inputHash,
        ruleVersionId: record.run.ruleVersionId ?? null, ruleContentHash: record.run.ruleContentHash ?? null,
        decision: record.run.decision ?? null, createdAt: record.run.createdAt, createdBy: record.run.createdBy,
      });
      if (record.factIds.length > 0) {
        await tx.insert(calculationRunFacts).values(record.factIds.map((businessEventId) => ({
          calculationRunId: record.run.id, businessEventId,
        })));
      }
      await tx.insert(calculationRunSteps).values(record.run.steps.map((step) => ({
        id: randomUUID(), calculationRunId: record.run.id, sequence: step.sequence, key: step.key,
        category: step.category, status: step.status, inputs: step.inputs, output: step.output,
        explanation: step.explanation,
      })));
      await tx.insert(auditEvents).values({
        id: randomUUID(), tenantId: record.run.tenantId, actorId: record.run.createdBy,
        action: 'calculation_run.create', resourceType: 'calculation_run', resourceId: record.run.id,
        outcome: 'success', traceId: record.traceId,
        metadata: { status: record.run.status, inputHash: record.run.inputHash,
          ruleVersionId: record.run.ruleVersionId ?? null, decisionCode: record.run.decision?.code ?? null },
      });
      await tx.insert(outboxEvents).values({
        id: randomUUID(), tenantId: record.run.tenantId, eventType: 'calculation.run_created.v1',
        aggregateType: 'calculation_run', aggregateId: record.run.id,
        payload: { companyId: record.run.companyId, status: record.run.status,
          inputHash: record.run.inputHash, ruleVersionId: record.run.ruleVersionId ?? null },
        occurredAt: record.run.createdAt,
      });
    });
    return record.run;
  }

  async list(tenantId: string, companyId: string): Promise<readonly SavedCalculationRun[]> {
    const rows = await this.db.select().from(calculationRuns)
      .where(and(eq(calculationRuns.tenantId, tenantId), eq(calculationRuns.companyId, companyId)))
      .orderBy(desc(calculationRuns.createdAt));
    return Promise.all(rows.map(async (row) => this.present(row)));
  }

  async find(tenantId: string, companyId: string, id: string): Promise<SavedCalculationRun | null> {
    const [row] = await this.db.select().from(calculationRuns)
      .where(and(eq(calculationRuns.tenantId, tenantId), eq(calculationRuns.companyId, companyId), eq(calculationRuns.id, id))).limit(1);
    return row ? this.present(row) : null;
  }

  private async present(row: typeof calculationRuns.$inferSelect): Promise<SavedCalculationRun> {
      const stepRows = await this.db.select().from(calculationRunSteps)
        .where(eq(calculationRunSteps.calculationRunId, row.id))
        .orderBy(calculationRunSteps.sequence);
      return {
        id: row.id, tenantId: row.tenantId, companyId: row.companyId, taxType: row.taxType as TaxType,
        periodStart: row.periodStart, periodEnd: row.periodEnd, status: row.status as CalculationRunStatus,
        inputSnapshot: row.inputSnapshot as CalculationInputSnapshot, inputHash: row.inputHash,
        ruleVersionId: row.ruleVersionId ?? undefined, ruleContentHash: row.ruleContentHash ?? undefined,
        decision: row.decision as SavedCalculationRun['decision'] & { code: CalculationDecisionCode } | undefined,
        steps: stepRows.map((step) => ({
          sequence: step.sequence, key: step.key, category: step.category, status: step.status,
          inputs: step.inputs, output: step.output, explanation: step.explanation,
        })) as CalculationExplanationStep[],
        createdAt: row.createdAt, createdBy: row.createdBy,
      };
  }
  }
