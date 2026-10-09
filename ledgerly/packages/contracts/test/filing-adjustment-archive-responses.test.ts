import{describe,expect,it}from'vitest';
import{annualFilingArchiveResponseSchema,filingAdjustmentInputSchema,filingAdjustmentResponseSchema,filingAdjustmentTransitionSchema}from'../src/index.js';
const id=(prefix:string)=>`${prefix}0000000-0000-4000-8000-000000000001`,hash='a'.repeat(64),time='2026-10-09T00:00:00.000Z';
describe('filing adjustment and archive contracts',()=>{
  it('accepts only controlled adjustment types and versioned transitions',()=>{
    expect(filingAdjustmentInputSchema.safeParse({sourcePackageId:id('1'),type:'correction',reason:'测试更正原因完整明确',evidenceDocumentIds:[]}).success).toBe(true);
    expect(filingAdjustmentInputSchema.safeParse({sourcePackageId:id('1'),type:'delete',reason:'不得删除原包',evidenceDocumentIds:[]}).success).toBe(false);
    expect(filingAdjustmentTransitionSchema.safeParse({expectedVersion:2,action:'resolve',note:'独立复核结论完整',resolutionEvidenceDocumentIds:[id('2')]}).success).toBe(true);
    expect(filingAdjustmentResponseSchema.parse({id:id('1'),companyId:id('2'),filingTaskId:id('3'),sourcePackageId:id('4'),type:'refund',status:'open',version:1,reason:'测试退税工单原因',evidence:[],resolutionEvidence:[],openedAt:time,openedBy:id('5'),updatedAt:time,updatedBy:id('5')}).status).toBe('open');
  });
  it('requires portable files and manifest checksums',()=>{
    const parsed=annualFilingArchiveResponseSchema.parse({format:'ledgerly-portable-archive.v1',companyId:id('1'),year:2026,generatedAt:time,archiveHash:hash,manifest:{entryCount:1,entries:[{path:'books/ledger.json',mediaType:'application/json',byteSize:2,sha256:hash}]},files:[{path:'books/ledger.json',mediaType:'application/json',sha256:hash,contentBase64:'e30='}]});
    expect(parsed.files[0]?.contentBase64).toBe('e30=');
  });
});
