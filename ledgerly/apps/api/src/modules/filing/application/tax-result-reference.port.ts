export interface TaxResultReference{
  readonly calculationRunId:string;
  readonly inputHash:string;
  readonly ruleVersionId:string;
  readonly ruleContentHash:string;
  readonly resultHash:string;
}
export const TAX_RESULT_REFERENCE_PORT=Symbol('TAX_RESULT_REFERENCE_PORT');
export interface TaxResultReferencePort{find(tenantId:string,companyId:string,calculationRunId:string):Promise<TaxResultReference|null>}
