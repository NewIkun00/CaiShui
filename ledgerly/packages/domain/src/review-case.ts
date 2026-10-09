export const reviewCaseStatuses=['open','awaiting_documents','in_review','approved','rejected','cancelled'] as const;
export type ReviewCaseStatus=typeof reviewCaseStatuses[number];
export type ReviewCaseDecision='approved'|'rejected';
export type ReviewCaseAction='start_review'|'request_documents'|'resume_review'|'cancel';

export class ReviewCaseError extends Error{}

export interface ReviewCaseState{
  readonly status:ReviewCaseStatus;
  readonly createdBy:string;
  readonly assignedTo?:string|undefined;
}

export function assignReviewCase(state:ReviewCaseState,assigneeId:string):ReviewCaseStatus{
  assertMutable(state);
  if(!assigneeId.trim())throw new ReviewCaseError('Review assignee is required');
  return state.status==='open'?'in_review':state.status;
}

export function transitionReviewCase(state:ReviewCaseState,actorId:string,action:ReviewCaseAction):ReviewCaseStatus{
  assertMutable(state);
  assertReviewer(state,actorId);
  if(action==='start_review'&&state.status==='open')return'in_review';
  if(action==='request_documents'&&(state.status==='open'||state.status==='in_review'))return'awaiting_documents';
  if(action==='resume_review'&&state.status==='awaiting_documents')return'in_review';
  if(action==='cancel')return'cancelled';
  throw new ReviewCaseError(`Invalid review transition: ${state.status} -> ${action}`);
}

export function decideReviewCase(state:ReviewCaseState,actorId:string,decision:ReviewCaseDecision):ReviewCaseStatus{
  assertMutable(state);
  assertReviewer(state,actorId);
  if(state.status!=='in_review')throw new ReviewCaseError('Only a case in review can be decided');
  if(state.createdBy===actorId)throw new ReviewCaseError('Case creator cannot approve or reject their own case');
  return decision;
}

export function assertReviewWorkItemAllowed(state:ReviewCaseState,actorId:string):void{
  assertMutable(state);assertReviewer(state,actorId);
}

function assertMutable(state:ReviewCaseState){if(['approved','rejected','cancelled'].includes(state.status))throw new ReviewCaseError('Terminal review case cannot be changed');}
function assertReviewer(state:ReviewCaseState,actorId:string){if(!state.assignedTo||state.assignedTo!==actorId)throw new ReviewCaseError('Only the assigned reviewer can perform this action');}
