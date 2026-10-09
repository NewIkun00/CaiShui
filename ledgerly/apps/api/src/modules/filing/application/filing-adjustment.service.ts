import{ConflictException,Inject,Injectable,NotFoundException}from'@nestjs/common';
import type{FilingAdjustmentInput,FilingAdjustmentTransitionInput}from'@ledgerly/contracts';
import{assertIndependentAdjustmentResolution,FilingAdjustmentError,transitionFilingAdjustment}from'@ledgerly/domain';
import{randomUUID}from'node:crypto';
import{DOCUMENT_STORE,type DocumentStore}from'../../document/application/document-store.js';
import{ORGANIZATION_STORE,type OrganizationStore}from'../../organization/application/organization-store.js';
import type{RequestContext}from'../../organization/application/organization.service.js';
import{FILING_STORE,type FilingAdjustmentEvidence,type FilingAdjustmentWorkOrder,type FilingStore}from'./filing-store.js';

@Injectable()
export class FilingAdjustmentService{
  constructor(@Inject(FILING_STORE)private readonly store:FilingStore,@Inject(ORGANIZATION_STORE)private readonly organizations:OrganizationStore,@Inject(DOCUMENT_STORE)private readonly documents:DocumentStore){}

  async create(companyId:string,input:FilingAdjustmentInput,context:RequestContext){
    const tenantId=await this.company(companyId,context),source=await this.store.findPackage(tenantId,companyId,input.sourcePackageId);
    if(!source)throw new NotFoundException('Source filing package not found');
    if(source.status!=='frozen')throw new ConflictException({code:'ADJUSTMENT_REQUIRES_FROZEN_PACKAGE',message:'Adjustment work orders require a frozen source package'});
    const evidence=await this.evidence(tenantId,companyId,input.evidenceDocumentIds),now=new Date(),workOrder:FilingAdjustmentWorkOrder={id:randomUUID(),companyId,filingTaskId:source.snapshot.filingTaskId,sourcePackageId:source.id,type:input.type,status:'open',version:1,reason:input.reason,evidence,resolutionEvidence:[],openedAt:now,openedBy:context.actorId,updatedAt:now,updatedBy:context.actorId};
    return this.store.createAdjustment({tenantId,workOrder,traceId:context.traceId});
  }
  async list(companyId:string,context:RequestContext){return this.store.listAdjustments(await this.company(companyId,context),companyId);}
  async transition(companyId:string,id:string,input:FilingAdjustmentTransitionInput,context:RequestContext){
    const tenantId=await this.company(companyId,context),current=await this.store.findAdjustment(tenantId,companyId,id);
    if(!current)throw new NotFoundException('Filing adjustment work order not found');
    if(current.version!==input.expectedVersion)throw new ConflictException({code:'FILING_ADJUSTMENT_CHANGED',message:'Filing adjustment work order has changed'});
    let status;
    try{assertIndependentAdjustmentResolution(current.openedBy,context.actorId,input.action);status=transitionFilingAdjustment(current.status,input.action);}catch(error){if(error instanceof FilingAdjustmentError)throw new ConflictException({code:'FILING_ADJUSTMENT_TRANSITION_REJECTED',message:error.message});throw error;}
    if(input.action==='resolve'&&current.reviewedBy!==context.actorId)throw new ConflictException({code:'FILING_ADJUSTMENT_REVIEWER_REQUIRED',message:'Only the assigned reviewer can resolve this work order'});
    let resolutionPackageId=current.resolutionPackageId,resolutionEvidence=current.resolutionEvidence;
    if(input.action==='resolve'){
      resolutionEvidence=await this.evidence(tenantId,companyId,input.resolutionEvidenceDocumentIds);
      if(resolutionEvidence.length<1)throw new ConflictException({code:'FILING_ADJUSTMENT_RESOLUTION_EVIDENCE_REQUIRED',message:'Resolution requires at least one immutable document version'});
      if(current.type==='correction'){
        if(!input.resolutionPackageId)throw new ConflictException({code:'CORRECTION_PACKAGE_REQUIRED',message:'Correction resolution requires a replacement filing package'});
        const replacement=await this.store.findPackage(tenantId,companyId,input.resolutionPackageId);
        if(!replacement||replacement.status!=='frozen'||replacement.correctionOfPackageId!==current.sourcePackageId)throw new ConflictException({code:'CORRECTION_PACKAGE_MISMATCH',message:'Replacement must be a frozen correction child of the source package'});
        resolutionPackageId=replacement.id;
      }else if(input.resolutionPackageId)throw new ConflictException({code:'RESOLUTION_PACKAGE_NOT_ALLOWED',message:'Only correction work orders can link a replacement package'});
    }
    const now=new Date(),next:FilingAdjustmentWorkOrder={...current,status,version:current.version+1,...(input.action==='start_review'?{reviewedBy:context.actorId}:{}),...(resolutionPackageId?{resolutionPackageId}:{}),resolutionEvidence,...(input.action==='resolve'?{resolutionNote:input.note}:{}),updatedAt:now,updatedBy:context.actorId};
    const saved=await this.store.transitionAdjustment({tenantId,companyId,workOrderId:id,expectedVersion:input.expectedVersion,next,action:input.action,note:input.note,traceId:context.traceId});
    if(!saved)throw new ConflictException({code:'FILING_ADJUSTMENT_CHANGED',message:'Filing adjustment work order has changed'});
    return saved;
  }
  private async evidence(tenantId:string,companyId:string,ids:readonly string[]):Promise<readonly FilingAdjustmentEvidence[]>{
    const unique=[...new Set(ids)],items=await Promise.all(unique.map(id=>this.documents.find(tenantId,companyId,id)));
    if(items.some(item=>!item))throw new NotFoundException('Adjustment evidence document not found');
    return items.map(item=>{const version=item!.versions.find(candidate=>candidate.versionNumber===item!.currentVersion);if(!version)throw new NotFoundException('Adjustment evidence document version not found');return{documentId:item!.id,documentVersion:version.versionNumber,documentHash:version.sha256};});
  }
  private async company(companyId:string,context:RequestContext){if(!context.tenantId||!await this.organizations.findCompany(context.tenantId,companyId))throw new NotFoundException('Company not found');return context.tenantId;}
}
