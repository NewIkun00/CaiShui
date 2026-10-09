import{createHash}from'node:crypto';
import{describe,expect,it}from'vitest';
import{DocumentStatus,DocumentType}from'@ledgerly/domain';
import type{OrganizationStore}from'../src/modules/organization/application/organization-store.js';
import type{AccountingService}from'../src/modules/accounting/application/accounting.service.js';
import{FilingArchiveService}from'../src/modules/filing/application/filing-archive.service.js';
import{MemoryFilingStore}from'../src/modules/filing/infrastructure/memory-filing.store.js';
import{MemoryDocumentStore}from'../src/modules/document/infrastructure/memory-document.store.js';
import{MemoryObjectStorage}from'../src/modules/document/infrastructure/memory-object-storage.js';

const actorId='10000000-0000-4000-8000-000000000001',tenantId='20000000-0000-4000-8000-000000000002',companyId='30000000-0000-4000-8000-000000000003',context={actorId,tenantId,traceId:'archive-test'};
const organizations:OrganizationStore={bootstrap:()=>Promise.resolve(),findCompany:(tenant,company)=>Promise.resolve(tenant===tenantId&&company===companyId?({id:companyId}as never):null),recordDeniedCompanyAccess:()=>Promise.resolve()};

describe('FilingArchiveService',()=>{
  it('exports readable file content and a checksum manifest instead of id-only references',async()=>{
    const documents=new MemoryDocumentStore(),objects=new MemoryObjectStorage(),content=Buffer.from('R4 portable archive proof','utf8'),hash=createHash('sha256').update(content).digest('hex'),documentId='40000000-0000-4000-8000-000000000004',versionId='50000000-0000-4000-8000-000000000005',now=new Date('2026-10-09T00:00:00Z');
    await documents.save({id:documentId,tenantId,companyId,actorId,traceId:'seed',createdAt:now,document:{type:DocumentType.Other,title:'年度归档测试原件',accountingMonth:'2026-09',status:DocumentStatus.Active,currentVersion:1},version:{id:versionId,versionNumber:1,fileName:'proof.txt',mediaType:'application/pdf',byteSize:content.byteLength,sha256:hash,storageKey:`${documentId}/${versionId}`,scanStatus:'clean',scanEngine:'test',createdAt:now,createdBy:actorId}});
    await objects.put(`${documentId}/${versionId}`,content,'application/pdf');
    const accounting={list:()=>Promise.resolve([]),ledger:()=>Promise.resolve({period:{start:'2026-01-01',end:'2026-12-31'},journal:[],trialBalance:[]}),reports:()=>Promise.resolve({period:{start:'2026-01-01',end:'2026-12-31'},profitStatement:{},balanceSheet:{}})}as unknown as AccountingService;
    const archive=await new FilingArchiveService(new MemoryFilingStore(),organizations,documents,objects,accounting).generate(companyId,2026,context);
    expect(archive.format).toBe('ledgerly-portable-archive.v1');
    expect(archive.manifest.entryCount).toBe(archive.files.length);
    const original=archive.files.find(item=>item.path.includes('proof.txt'))!;
    expect(Buffer.from(original.contentBase64,'base64').toString('utf8')).toBe('R4 portable archive proof');
    expect(original.sha256).toBe(hash);
    expect(archive.files.some(item=>item.path==='books/ledger.json')).toBe(true);
    expect(archive.files.some(item=>item.path==='filings/adjustments.json')).toBe(true);
  });
});
