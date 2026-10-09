import{Injectable}from'@nestjs/common';
import type{TaxResultReferencePort}from'../application/tax-result-reference.port.js';
@Injectable()
export class UnavailableTaxResultReferenceAdapter implements TaxResultReferencePort{
  find(){return Promise.resolve(null);}
}
