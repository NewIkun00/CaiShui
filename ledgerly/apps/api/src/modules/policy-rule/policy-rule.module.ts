import { Module } from '@nestjs/common';
import { PolicyRuleService } from './application/policy-rule.service.js';
import { POLICY_RULE_STORE } from './application/policy-rule-store.js';
import { MemoryPolicyRuleStore } from './infrastructure/memory-policy-rule.store.js';
import { PostgresPolicyRuleStore } from './infrastructure/postgres-policy-rule.store.js';
import { PolicyRuleController } from './presentation/policy-rule.controller.js';
import {
  EmptyRuleCalculationRegistry, RULE_CALCULATION_REGISTRY,
} from './application/rule-calculation-registry.js';

const storageProviders = process.env['STORAGE_MODE'] === 'memory'
  ? [MemoryPolicyRuleStore, { provide: POLICY_RULE_STORE, useExisting: MemoryPolicyRuleStore }]
  : [PostgresPolicyRuleStore, { provide: POLICY_RULE_STORE, useExisting: PostgresPolicyRuleStore }];

@Module({
  controllers: [PolicyRuleController],
  providers: [
    ...storageProviders, EmptyRuleCalculationRegistry,
    { provide: RULE_CALCULATION_REGISTRY, useExisting: EmptyRuleCalculationRegistry },
    PolicyRuleService,
  ],
  exports: [POLICY_RULE_STORE,RULE_CALCULATION_REGISTRY],
})
export class PolicyRuleModule {}
