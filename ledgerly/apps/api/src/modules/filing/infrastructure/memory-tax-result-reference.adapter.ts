import{Injectable}from'@nestjs/common';
import type{TaxResultReference,TaxResultReferencePort}from'../application/tax-result-reference.port.js';
@Injectable()
export class MemoryTaxResultReferenceAdapter implements TaxResultReferencePort{
  private readonly records=new Map<string,TaxResultReference>();
  find(tenantId:string,companyId:string,calculationRunId:string){return Promise.resolve(this.records.get(this.key(tenantId,companyId,calculationRunId))??null);}
  registerTestFixture(tenantId:string,companyId:string,reference:TaxResultReference){this.records.set(this.key(tenantId,companyId,reference.calculationRunId),reference);return Promise.resolve(reference);}
  private key(tenantId:string,companyId:string,calculationRunId:string){return`${tenantId}:${companyId}:${calculationRunId}`;}
}
