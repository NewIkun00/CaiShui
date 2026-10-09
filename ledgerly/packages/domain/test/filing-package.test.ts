import{describe,expect,it}from'vitest';
import{assertCorrectionParent,filingPackageFreezeBlockers,FilingPackageError,freezeFilingPackage}from'../src/filing-package.js';
const hash='a'.repeat(64);
const ready={status:'draft' as const,hasRedReviewBlocker:false,approvedReviewCount:1,calculationReady:true,inputHash:hash,ruleHash:hash,resultHash:hash,sopHash:hash,referencesMatchSnapshot:true};
describe('filing package freeze gate',()=>{
  it('freezes only a complete draft snapshot',()=>{expect(filingPackageFreezeBlockers(ready)).toEqual([]);expect(freezeFilingPackage(ready)).toBe('frozen');});
  it('returns every blocker instead of silently accepting partial references',()=>{expect(filingPackageFreezeBlockers({...ready,hasRedReviewBlocker:true,approvedReviewCount:0,calculationReady:false,inputHash:undefined,ruleHash:'bad',resultHash:undefined,sopHash:undefined,referencesMatchSnapshot:false})).toEqual(['RED_REVIEW_BLOCKER','APPROVED_REVIEW_REQUIRED','CALCULATION_RESULT_REQUIRED','INPUT_HASH_REQUIRED','RULE_HASH_REQUIRED','RESULT_HASH_REQUIRED','SOP_HASH_REQUIRED','REFERENCE_HASH_MISMATCH']);});
  it('keeps frozen packages terminal and requires correction versions to point to frozen parents',()=>{expect(()=>freezeFilingPackage({...ready,status:'frozen'})).toThrow(FilingPackageError);expect(()=>assertCorrectionParent('draft')).toThrow(FilingPackageError);expect(()=>assertCorrectionParent('frozen')).not.toThrow();});
});
