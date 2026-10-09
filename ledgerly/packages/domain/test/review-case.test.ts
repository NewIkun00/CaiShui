import{describe,expect,it}from'vitest';
import{assertReviewWorkItemAllowed,assignReviewCase,decideReviewCase,ReviewCaseError,transitionReviewCase}from'../src/index.js';
const creator='10000000-0000-4000-8000-000000000001',reviewer='20000000-0000-4000-8000-000000000002';
describe('review case state machine',()=>{
  it('moves through assignment, document request, resume and approval',()=>{const state={status:'open' as const,createdBy:creator};expect(assignReviewCase(state,reviewer)).toBe('in_review');const assigned={...state,status:'in_review' as const,assignedTo:reviewer};expect(transitionReviewCase(assigned,reviewer,'request_documents')).toBe('awaiting_documents');expect(transitionReviewCase({...assigned,status:'awaiting_documents'},reviewer,'resume_review')).toBe('in_review');expect(decideReviewCase(assigned,reviewer,'approved')).toBe('approved');});
  it('enforces reviewer ownership and separation of duties',()=>{expect(()=>assertReviewWorkItemAllowed({status:'in_review',createdBy:creator,assignedTo:reviewer},creator)).toThrow(ReviewCaseError);expect(()=>decideReviewCase({status:'in_review',createdBy:creator,assignedTo:creator},creator,'approved')).toThrow('creator');});
  it('keeps terminal cases immutable and rejects invalid transitions',()=>{expect(()=>assignReviewCase({status:'approved',createdBy:creator,assignedTo:reviewer},reviewer)).toThrow('Terminal');expect(()=>transitionReviewCase({status:'open',createdBy:creator,assignedTo:reviewer},reviewer,'resume_review')).toThrow('Invalid');});
});
