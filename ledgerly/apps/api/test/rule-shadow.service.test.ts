import { describe,expect,it } from 'vitest';
import { createGoldenFixtureSet,RuleVersionStatus,TaxType } from '@ledgerly/domain';
import { PolicyRuleService } from '../src/modules/policy-rule/application/policy-rule.service.js';
import type { RuleCalculationRegistry } from '../src/modules/policy-rule/application/rule-calculation-registry.js';
import { MemoryPolicyRuleStore } from '../src/modules/policy-rule/infrastructure/memory-policy-rule.store.js';

const signerId='30000000-0000-4000-8000-000000000003';
const context={actorId:signerId,traceId:'shadow-test'};
const packageId='10000000-0000-4000-8000-000000000001';
const baselineId='20000000-0000-4000-8000-000000000002';
const candidateId='40000000-0000-4000-8000-000000000004';
const fixtureSetId='50000000-0000-4000-8000-000000000005';

async function fixture(options:{identical?:boolean;missingCandidate?:boolean}={}){
  const store=new MemoryPolicyRuleStore();
  await store.saveRulePackage({id:packageId,actorId:signerId,traceId:'package',createdAt:new Date('2026-10-08T00:00:00Z'),rulePackage:{
    code:'vat.cn-js.shadow-test',name:'影子计算测试',taxType:TaxType.Vat,jurisdictions:['CN-JS'],description:'仅验证影子计算基础设施。',
  }});
  const base={effectiveFrom:'2026-01-01',sourceIds:['source'],applicability:{taxpayerStatuses:['test'],filingCycles:['quarterly'],industries:['test'],requiredTags:[],excludedTags:[]},parameters:{},explanation:'测试实现，不含生产税率。'} as const;
  const baseline=await store.saveRuleVersion({id:baselineId,rulePackageId:packageId,actorId:signerId,traceId:'baseline',createdAt:new Date('2026-01-01T00:00:00Z'),ruleVersion:{...base,versionTag:'2026.01.01-1',calculationImplementation:'shadow-baseline-v1',contentHash:'a'.repeat(64),status:RuleVersionStatus.Active}});
  await store.saveRuleVersion({id:candidateId,rulePackageId:packageId,actorId:signerId,traceId:'candidate',createdAt:new Date('2026-10-08T00:00:00Z'),ruleVersion:{...base,versionTag:'2026.10.08-1',calculationImplementation:'shadow-candidate-v2',contentHash:'b'.repeat(64),status:RuleVersionStatus.TaxReviewed}});
  const scenarios=['normal','boundary','cross_period','red_invoice','correction','exception'] as const;
  const modes=['same','output','steps','both','candidate-fail','baseline-fail'] as const;
  const fixtureSet=createGoldenFixtureSet({fixtureSetVersion:'2026.10.08-1',redactionAttested:true,professionalNote:'专业签审人确认这些自动化测试样本均为脱敏合成数据。',contentHash:'c'.repeat(64),fixtures:scenarios.map((scenario,index)=>({
    caseId:`case-${index+1}`,scenario,input:{mode:modes[index]},expected:{amount:'1.00'},explanation:'用于影子计算差异分类测试。',
  }))});
  await store.saveGoldenFixtureSet({id:fixtureSetId,current:baseline,fixtureSet,actorId:signerId,traceId:'fixtures',occurredAt:new Date('2026-10-08T01:00:00Z')});
  const registry:RuleCalculationRegistry={find:(key)=>{
    if(key==='shadow-baseline-v1')return{key,execute:(input)=>{
      if(!options.identical&&input['mode']==='baseline-fail')throw new Error('baseline failed');
      return{output:{amount:'1.00'},steps:[{key:'calculate',value:'1.00'}]};
    }};
    if(key==='shadow-candidate-v2'&&!options.missingCandidate)return{key,execute:(input)=>{
      if(options.identical)return{output:{amount:'1.00'},steps:[{value:'1.00',key:'calculate'}]};
      if(input['mode']==='candidate-fail')throw new Error('candidate failed');
      const output=input['mode']==='output'||input['mode']==='both'?{amount:'2.00'}:{amount:'1.00'};
      const steps=input['mode']==='steps'||input['mode']==='both'?[{key:'candidate-step',value:'1.00'}]:[{key:'calculate',value:'1.00'}];
      return{output,steps};
    }};
    return null;
  }};
  return{store,service:new PolicyRuleService(store,()=>new Date('2026-10-08T02:00:00Z'),registry)};
}

describe('rule shadow analysis',()=>{
  it('persists stable per-case output, step, and failure differences idempotently',async()=>{
    const{service}=await fixture();
    const input={baselineRuleVersionId:baselineId,candidateRuleVersionId:candidateId,fixtureSetId};
    const first=await service.executeRuleShadowRun(packageId,input,context);
    expect(first.created).toBe(true);
    expect(first.run).toMatchObject({status:'execution_failed',totalFixtures:6,identicalFixtures:1,changedFixtures:3,failedFixtures:2});
    expect(first.run.differences.map((item)=>item.status)).toEqual([
      'identical','output_changed','steps_changed','output_and_steps_changed','candidate_failed','baseline_failed',
    ]);
    expect(first.run.artifactHash).toMatch(/^[0-9a-f]{64}$/);
    const duplicate=await service.executeRuleShadowRun(packageId,input,context);
    expect(duplicate).toMatchObject({created:false,run:{id:first.run.id,artifactHash:first.run.artifactHash}});
    expect(await service.listRuleShadowRuns(packageId)).toHaveLength(1);
    expect((await service.findRuleShadowRun(packageId,first.run.id)).differences).toHaveLength(6);
  });

  it('reports an identical comparison when both registered implementations agree',async()=>{
    const{service}=await fixture({identical:true});
    const result=await service.executeRuleShadowRun(packageId,{baselineRuleVersionId:baselineId,candidateRuleVersionId:candidateId,fixtureSetId},context);
    expect(result.run).toMatchObject({status:'identical',identicalFixtures:6,changedFixtures:0,failedFixtures:0});
  });

  it('blocks missing implementations and unsigned fixture references',async()=>{
    const{service}=await fixture({missingCandidate:true});
    await expect(service.executeRuleShadowRun(packageId,{baselineRuleVersionId:baselineId,candidateRuleVersionId:candidateId,fixtureSetId},context))
      .rejects.toMatchObject({response:{code:'CANDIDATE_CALCULATION_IMPLEMENTATION_NOT_REGISTERED'}});
    await expect(service.executeRuleShadowRun(packageId,{baselineRuleVersionId:baselineId,candidateRuleVersionId:candidateId,fixtureSetId:'60000000-0000-4000-8000-000000000006'},context))
      .rejects.toMatchObject({response:{code:'SIGNED_GOLDEN_FIXTURE_REQUIRED'}});
    const registered=await fixture();
    await expect(registered.service.executeRuleShadowRun(packageId,{baselineRuleVersionId:baselineId,candidateRuleVersionId:candidateId,fixtureSetId},{actorId:'70000000-0000-4000-8000-000000000007',traceId:'unauthorized'}))
      .rejects.toMatchObject({response:{code:'RULE_SHADOW_EXECUTOR_REJECTED'}});
  });
});
