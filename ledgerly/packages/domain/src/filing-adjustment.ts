export const filingAdjustmentTypes=['void','correction','additional_tax','refund']as const;
export type FilingAdjustmentType=typeof filingAdjustmentTypes[number];
export const filingAdjustmentStatuses=['open','in_review','resolved','cancelled']as const;
export type FilingAdjustmentStatus=typeof filingAdjustmentStatuses[number];
export type FilingAdjustmentAction='start_review'|'resolve'|'cancel';

export class FilingAdjustmentError extends Error{}

export function transitionFilingAdjustment(status:FilingAdjustmentStatus,action:FilingAdjustmentAction):FilingAdjustmentStatus{
  if(status==='open'&&action==='start_review')return'in_review';
  if((status==='open'||status==='in_review')&&action==='cancel')return'cancelled';
  if(status==='in_review'&&action==='resolve')return'resolved';
  throw new FilingAdjustmentError(`Cannot ${action} filing adjustment from ${status}`);
}

export function assertIndependentAdjustmentResolution(openedBy:string,actorId:string,action:FilingAdjustmentAction):void{
  if(action==='resolve'&&openedBy===actorId)throw new FilingAdjustmentError('Adjustment opener cannot resolve the same work order');
}
