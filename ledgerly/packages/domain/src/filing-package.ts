export const filingPackageStatuses=['draft','frozen']as const;
export type FilingPackageStatus=typeof filingPackageStatuses[number];
export type FilingPackageBlockerCode='PACKAGE_NOT_DRAFT'|'RED_REVIEW_BLOCKER'|'APPROVED_REVIEW_REQUIRED'|'CALCULATION_RESULT_REQUIRED'|'INPUT_HASH_REQUIRED'|'RULE_HASH_REQUIRED'|'RESULT_HASH_REQUIRED'|'SOP_HASH_REQUIRED'|'REFERENCE_HASH_MISMATCH';

export interface FilingPackageFreezeContext{
  readonly status:FilingPackageStatus;
  readonly hasRedReviewBlocker:boolean;
  readonly approvedReviewCount:number;
  readonly calculationReady:boolean;
  readonly inputHash?:string|undefined;
  readonly ruleHash?:string|undefined;
  readonly resultHash?:string|undefined;
  readonly sopHash?:string|undefined;
  readonly referencesMatchSnapshot:boolean;
}

export class FilingPackageError extends Error{
  constructor(message:string,readonly blockers:readonly FilingPackageBlockerCode[]=[]){super(message);}
}

export function filingPackageFreezeBlockers(context:FilingPackageFreezeContext):readonly FilingPackageBlockerCode[]{
  const blockers:FilingPackageBlockerCode[]=[];
  if(context.status!=='draft')blockers.push('PACKAGE_NOT_DRAFT');
  if(context.hasRedReviewBlocker)blockers.push('RED_REVIEW_BLOCKER');
  if(context.approvedReviewCount<1)blockers.push('APPROVED_REVIEW_REQUIRED');
  if(!context.calculationReady)blockers.push('CALCULATION_RESULT_REQUIRED');
  if(!sha256(context.inputHash))blockers.push('INPUT_HASH_REQUIRED');
  if(!sha256(context.ruleHash))blockers.push('RULE_HASH_REQUIRED');
  if(!sha256(context.resultHash))blockers.push('RESULT_HASH_REQUIRED');
  if(!sha256(context.sopHash))blockers.push('SOP_HASH_REQUIRED');
  if(!context.referencesMatchSnapshot)blockers.push('REFERENCE_HASH_MISMATCH');
  return blockers;
}

export function freezeFilingPackage(context:FilingPackageFreezeContext):FilingPackageStatus{
  const blockers=filingPackageFreezeBlockers(context);
  if(blockers.length)throw new FilingPackageError('Filing package cannot be frozen',blockers);
  return'frozen';
}

export function assertCorrectionParent(status:FilingPackageStatus|undefined):void{
  if(status!=='frozen')throw new FilingPackageError('Correction package requires a frozen parent');
}

function sha256(value?:string){return Boolean(value&&/^[0-9a-f]{64}$/.test(value));}
