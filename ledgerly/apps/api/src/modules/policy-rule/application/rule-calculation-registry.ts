export interface RuleCalculationOutput {
  readonly output: Readonly<Record<string, unknown>>;
  readonly steps: readonly Readonly<Record<string, unknown>>[];
}

export interface RuleCalculationImplementation {
  readonly key: string;
  execute(input: Readonly<Record<string, unknown>>): RuleCalculationOutput;
}

export const RULE_CALCULATION_REGISTRY = Symbol('RULE_CALCULATION_REGISTRY');

export interface RuleCalculationRegistry {
  find(key: string): RuleCalculationImplementation | null;
}

export class EmptyRuleCalculationRegistry implements RuleCalculationRegistry {
  find(): RuleCalculationImplementation | null { return null; }
}
