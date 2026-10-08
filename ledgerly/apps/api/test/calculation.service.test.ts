import { describe, expect, it } from 'vitest';
import {
  CalculationDecisionCode, CalculationRunStatus, RuleVersionStatus, TaxType,
  confirmBusinessEvent, createBusinessEvent, createCompany, createTenant, evaluateScope,
} from '@ledgerly/domain';
import { CalculationService } from '../src/modules/calculation/application/calculation.service.js';
import { MemoryCalculationStore } from '../src/modules/calculation/infrastructure/memory-calculation.store.js';
import { MemoryBusinessEventStore } from '../src/modules/business-event/infrastructure/memory-business-event.store.js';
import { MemoryOrganizationStore } from '../src/modules/organization/infrastructure/memory-organization.store.js';
import { MemoryPolicyRuleStore } from '../src/modules/policy-rule/infrastructure/memory-policy-rule.store.js';
import { MemoryScopeStore } from '../src/modules/profile-scope/infrastructure/memory-scope.store.js';
import type { RuleCalculationImplementation } from '../src/modules/policy-rule/application/rule-calculation-registry.js';

describe('CalculationService', () => {
  it('freezes confirmed facts and blocks until exactly one active rule matches', async () => {
    const organizations = new MemoryOrganizationStore();
    const scopes = new MemoryScopeStore();
    const events = new MemoryBusinessEventStore();
    const rules = new MemoryPolicyRuleStore();
    const runs = new MemoryCalculationStore();
    const implementations=new Map<string,RuleCalculationImplementation>();
    const service = new CalculationService(organizations, scopes, events, rules, runs,{find:key=>implementations.get(key)??null});
    const actorId = '10000000-0000-4000-8000-000000000001';
    const tenantId = '20000000-0000-4000-8000-000000000002';
    const companyId = '30000000-0000-4000-8000-000000000003';
    const now = new Date('2026-10-08T00:00:00Z');
    const tenant = createTenant({ id: tenantId, name: '计算测试租户', createdBy: actorId }, now);
    const company = createCompany({
      id: companyId, tenantId, name: '计算测试公司', unifiedSocialCreditCode: '913200001234567890',
      provinceCode: '32', cityCode: '3201', createdBy: actorId,
    }, now);
    await organizations.bootstrap({ tenant, company, ownerUserId: actorId, traceId: 'calculation-test' });
    const profile = {
      entityType: 'one_person_llc', vatTaxpayerStatus: 'small_scale', vatFilingCycle: 'quarterly',
      incomeTaxCollection: 'audit', industry: 'modern_service', hasInventory: false, hasBranches: false,
      hasImportExport: false, hasForeignCurrency: false, hasSpecialVatFivePercent: false,
      hasDifferenceTax: false, hasCrossRegionPrepayment: false, hasComplexPayroll: false,
      hasShareholderTransactions: false, hasComplexTaxAdjustments: false, sourceDocumentsComplete: true,
    } as const;
    await scopes.save({
      id: '40000000-0000-4000-8000-000000000004', profileId: '50000000-0000-4000-8000-000000000005',
      tenantId, companyId, actorId, traceId: 'scope', profile, evaluation: evaluateScope(profile), evaluatedAt: now,
    });
    const draftEvent = createBusinessEvent({
      type: 'service_completed', occurredOn: '2026-10-02', amount: '100.00',
      counterpartyId: '60000000-0000-4000-8000-000000000006', description: '脱敏测试事实',
    });
    const confirmed = confirmBusinessEvent(draftEvent, actorId, now);
    await events.save({
      id: '70000000-0000-4000-8000-000000000007', tenantId, companyId, actorId,
      traceId: 'fact', event: confirmed, createdAt: now,
    });
    const context = { actorId, tenantId, traceId: 'run' };
    const input = { taxType: 'vat', periodStart: '2026-10-01', periodEnd: '2026-12-31' } as const;
    const blocked = await service.createRun(companyId, input, context);
    expect(blocked).toMatchObject({
      status: CalculationRunStatus.DecisionRequired,
      decision: { code: CalculationDecisionCode.NoMatchingRule },
    });
    expect(blocked.steps.map((step) => step.key)).toEqual([
      'scope_validation', 'fact_snapshot', 'rule_selection','implementation_readiness',
    ]);
    expect(blocked.steps[2]).toMatchObject({ status: 'blocked' });
    const rulePackage = await rules.saveRulePackage({
      id: '80000000-0000-4000-8000-000000000008', actorId, traceId: 'rule', createdAt: now,
      rulePackage: { code: 'vat.cn-js.snapshot-test', name: '计算快照测试', taxType: TaxType.Vat,
        jurisdictions: ['CN-JS'], description: '不含生产税率。' },
    });
    await rules.saveRuleVersion({
      id: '90000000-0000-4000-8000-000000000009', rulePackageId: rulePackage.id,
      actorId, traceId: 'rule-version', createdAt: now,
      ruleVersion: {
        versionTag: '2026.10.08-1', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
        sourceIds: ['a0000000-0000-4000-8000-00000000000a'], applicability: {
          taxpayerStatuses: ['small_scale'], filingCycles: ['quarterly'], industries: ['modern_service'],
          requiredTags: [], excludedTags: ['special_vat_five_percent'],
        }, calculationImplementation: 'vat-snapshot-test-v1', parameters: {},
        explanation: '只验证确定性快照。', contentHash: 'a'.repeat(64), status: RuleVersionStatus.Active,
      },
    });
    const implementationBlocked=await service.createRun(companyId,input,context);
    expect(implementationBlocked).toMatchObject({status:CalculationRunStatus.DecisionRequired,decision:{code:CalculationDecisionCode.ImplementationNotRegistered,candidateRuleVersionIds:['90000000-0000-4000-8000-000000000009']}});
    expect(implementationBlocked.steps.slice(2)).toEqual([expect.objectContaining({key:'rule_selection',status:'passed'}),expect.objectContaining({key:'implementation_readiness',status:'blocked'})]);
    implementations.set('vat-snapshot-test-v1',{key:'vat-snapshot-test-v1',execute:()=>({output:{},steps:[]})});
    const ready = await service.createRun(companyId, input, context);
    expect(ready).toMatchObject({
      status: CalculationRunStatus.Ready, ruleVersionId: '90000000-0000-4000-8000-000000000009',
      ruleContentHash: 'a'.repeat(64),
    });
    expect(ready.inputHash).toBe(blocked.inputHash);
    expect(ready.inputSnapshot.facts).toHaveLength(1);
    expect(ready.steps.every((step) => step.status === 'passed')).toBe(true);
    expect(ready).not.toHaveProperty('amount');
  });
});
