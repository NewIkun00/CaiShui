export interface TaxResultReference{
  readonly source:'test_fixture'|'calculation_result';
  readonly calculationRunId:string;
  readonly inputHash:string;
  readonly ruleVersionId:string;
  readonly ruleContentHash:string;
  readonly resultHash:string;
}
export const TAX_RESULT_REFERENCE_PORT=Symbol('TAX_RESULT_REFERENCE_PORT');
export interface TaxResultReferencePort{find(tenantId:string,companyId:string,calculationRunId:string):Promise<TaxResultReference|null>;registerTestFixture?(tenantId:string,companyId:string,reference:TaxResultReference):Promise<TaxResultReference>}
