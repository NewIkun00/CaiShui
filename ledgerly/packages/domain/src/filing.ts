export const filingTaskStatuses=['todo','filed','paid'] as const;
export type FilingTaskStatus=typeof filingTaskStatuses[number];
export type FilingTaskAction='mark_filed'|'mark_paid';
export type FilingTaskTiming='upcoming'|'due_today'|'overdue'|'completed';
export type FilingCalendarSourceType='test_fixture'|'official_notice';

export interface FilingCalendarSource{
  readonly type:FilingCalendarSourceType;
  readonly title:string;
  readonly officialUrl?:string|undefined;
  readonly documentNumber?:string|undefined;
  readonly contentHash?:string|undefined;
  readonly verifiedAt?:string|undefined;
  readonly verifiedBy?:string|undefined;
}

export class FilingError extends Error{}

export function assertFilingCalendarSource(source:FilingCalendarSource):void{
  if(source.type==='test_fixture')return;
  if(!source.officialUrl||!source.documentNumber||!source.contentHash||!source.verifiedAt||!source.verifiedBy){
    throw new FilingError('Production filing calendar requires a complete authoritative source');
  }
  let hostname='';
  try{hostname=new URL(source.officialUrl).hostname.toLowerCase();}catch{throw new FilingError('Official filing calendar source URL is invalid');}
  if(hostname!=='gov.cn'&&!hostname.endsWith('.gov.cn'))throw new FilingError('Official filing calendar source must use a gov.cn URL');
  if(!/^[0-9a-f]{64}$/.test(source.contentHash))throw new FilingError('Official filing calendar source requires a SHA-256 content hash');
}

export function transitionFilingTask(status:FilingTaskStatus,action:FilingTaskAction):FilingTaskStatus{
  if(status==='todo'&&action==='mark_filed')return'filed';
  if(status==='filed'&&action==='mark_paid')return'paid';
  throw new FilingError(`Invalid filing task transition: ${status} -> ${action}`);
}

export function deriveFilingTaskTiming(status:FilingTaskStatus,dueDate:string,asOf:string):FilingTaskTiming{
  if(status==='paid')return'completed';
  if(asOf>dueDate)return'overdue';
  if(asOf===dueDate)return'due_today';
  return'upcoming';
}
