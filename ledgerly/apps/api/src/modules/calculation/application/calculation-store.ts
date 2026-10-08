import type {
  CalculationDecisionCode, CalculationExplanationStep, CalculationRunStatus, TaxType,
} from '@ledgerly/domain';

export interface CalculationInputSnapshot {
  readonly companyId: string;
  readonly scopeEvaluationId?: string | undefined;
  readonly taxType: TaxType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly jurisdictionCodes: readonly string[];
  readonly profile?: Readonly<Record<string, unknown>> | undefined;
  readonly facts: readonly Readonly<Record<string, unknown>>[];
}

export interface SavedCalculationRun {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly taxType: TaxType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: CalculationRunStatus;
  readonly inputSnapshot: CalculationInputSnapshot;
  readonly inputHash: string;
  readonly ruleVersionId?: string | undefined;
  readonly ruleContentHash?: string | undefined;
  readonly decision?: {
    readonly code: CalculationDecisionCode;
    readonly message: string;
    readonly candidateRuleVersionIds: readonly string[];
  } | undefined;
  readonly steps: readonly CalculationExplanationStep[];
  readonly createdAt: Date;
  readonly createdBy: string;
}

export interface SaveCalculationRunRecord {
  readonly run: SavedCalculationRun;
  readonly traceId: string;
  readonly factIds: readonly string[];
}

export const CALCULATION_STORE = Symbol('CALCULATION_STORE');

export interface CalculationStore {
  save(record: SaveCalculationRunRecord): Promise<SavedCalculationRun>;
  list(tenantId: string, companyId: string): Promise<readonly SavedCalculationRun[]>;
}
