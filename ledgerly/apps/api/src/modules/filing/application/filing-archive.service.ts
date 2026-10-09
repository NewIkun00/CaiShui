import{Inject,Injectable,NotFoundException}from'@nestjs/common';
import{createHash}from'node:crypto';
import{AccountingService}from'../../accounting/application/accounting.service.js';
import{DOCUMENT_STORE,type DocumentStore}from'../../document/application/document-store.js';
import{OBJECT_STORAGE,type ObjectStorage}from'../../document/application/object-storage.js';
import{ORGANIZATION_STORE,type OrganizationStore}from'../../organization/application/organization-store.js';
import type{RequestContext}from'../../organization/application/organization.service.js';
import{FILING_STORE,type FilingStore}from'./filing-store.js';

export interface ArchiveFile{readonly path:string;readonly mediaType:string;readonly sha256:string;readonly contentBase64:string}

@Injectable()
export class FilingArchiveService{
  constructor(@Inject(FILING_STORE)private readonly filing:FilingStore,@Inject(ORGANIZATION_STORE)private readonly organizations:OrganizationStore,@Inject(DOCUMENT_STORE)private readonly documents:DocumentStore,@Inject(OBJECT_STORAGE)private readonly objects:ObjectStorage,private readonly accounting:AccountingService){}

  async generate(companyId:string,year:number,context:RequestContext){
    const tenantId=await this.company(companyId,context),tasks=(await this.filing.listTasks(tenantId,companyId)).filter(item=>item.periodStart.startsWith(`${year}-`)),taskIds=new Set(tasks.map(item=>item.id)),packages=(await this.filing.listPackages(tenantId,companyId)).filter(item=>taskIds.has(item.snapshot.filingTaskId)),packageIds=new Set(packages.map(item=>item.id));
    const evidence=(await Promise.all(packages.map(item=>this.filing.listEvidence(tenantId,companyId,item.id)))).flat(),closures=(await this.filing.listClosures(tenantId,companyId)).filter(item=>packageIds.has(item.filingPackageId)),adjustments=(await this.filing.listAdjustments(tenantId,companyId)).filter(item=>packageIds.has(item.sourcePackageId));
    const vouchers=(await this.accounting.list(companyId,context)).filter(item=>item.voucherDate.startsWith(`${year}-`)),ledger=await this.accounting.ledger(companyId,context),reports=await this.accounting.reports(companyId,context),allDocuments=await this.documents.list(tenantId,companyId),referenced=new Set([...evidence.map(item=>item.documentId),...adjustments.flatMap(item=>[...item.evidence,...item.resolutionEvidence].map(value=>value.documentId))]),selectedDocuments=allDocuments.filter(item=>item.accountingMonth.startsWith(String(year))||referenced.has(item.id));
    const files:ArchiveFile[]=[];
    this.json(files,'records/vouchers.json',vouchers);this.json(files,'books/ledger.json',ledger);this.json(files,'reports/financial-statements.json',reports);this.json(files,'filings/tasks.json',tasks);this.json(files,'filings/packages.json',packages);this.json(files,'filings/evidence.json',evidence);this.json(files,'filings/closures.json',closures);this.json(files,'filings/adjustments.json',adjustments);
    this.json(files,'documents/index.json',selectedDocuments.map(item=>({...item,versions:item.versions.map(version=>({...version,storageKey:undefined}))})));
    for(const document of selectedDocuments)for(const version of document.versions){const content=await this.objects.get(version.storageKey);if(!content)throw new NotFoundException(`Archived document content missing: ${document.id} v${version.versionNumber}`);files.push(this.binary(`documents/${document.id}/v${version.versionNumber}-${safe(version.fileName)}`,version.mediaType,content));}
    files.sort((a,b)=>a.path.localeCompare(b.path));
    const entries=files.map(item=>({path:item.path,mediaType:item.mediaType,byteSize:Buffer.from(item.contentBase64,'base64').byteLength,sha256:item.sha256})),generatedAt=new Date(),manifest={entryCount:entries.length,entries},archiveHash=sha256({format:'ledgerly-portable-archive.v1',companyId,year,manifest});
    return{format:'ledgerly-portable-archive.v1' as const,companyId,year,generatedAt,archiveHash,manifest,files};
  }
  private json(files:ArchiveFile[],path:string,value:unknown){const content=Buffer.from(JSON.stringify(canonical(value),null,2),'utf8');files.push(this.binary(path,'application/json',content));}
  private binary(path:string,mediaType:string,content:Uint8Array):ArchiveFile{return{path,mediaType,sha256:createHash('sha256').update(content).digest('hex'),contentBase64:Buffer.from(content).toString('base64')};}
  private async company(companyId:string,context:RequestContext){if(!context.tenantId||!await this.organizations.findCompany(context.tenantId,companyId))throw new NotFoundException('Company not found');return context.tenantId;}
}
function canonical(value:unknown):unknown{if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));return value;}
function sha256(value:unknown){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function safe(value:string){return value.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120)||'file';}
