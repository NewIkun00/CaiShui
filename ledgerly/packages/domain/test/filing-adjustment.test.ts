import{describe,expect,it}from'vitest';
import{assertIndependentAdjustmentResolution,transitionFilingAdjustment}from'../src/index.js';

describe('filing adjustment work order',()=>{
  it('uses a forward-only review workflow',()=>{
    expect(transitionFilingAdjustment('open','start_review')).toBe('in_review');
    expect(transitionFilingAdjustment('in_review','resolve')).toBe('resolved');
    expect(transitionFilingAdjustment('open','cancel')).toBe('cancelled');
    expect(()=>transitionFilingAdjustment('resolved','cancel')).toThrow(/Cannot cancel/);
  });
  it('separates opener and resolver',()=>{
    expect(()=>assertIndependentAdjustmentResolution('actor-a','actor-a','resolve')).toThrow(/cannot resolve/);
    expect(()=>assertIndependentAdjustmentResolution('actor-a','actor-b','resolve')).not.toThrow();
  });
});
