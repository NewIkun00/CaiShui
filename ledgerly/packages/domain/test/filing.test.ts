import{describe,expect,it}from'vitest';
import{assertFilingCalendarSource,deriveFilingTaskTiming,FilingError,transitionFilingTask}from'../src/filing.js';

describe('filing calendar and task policy',()=>{
  it('supports the fixed forward-only filing workflow',()=>{
    expect(transitionFilingTask('todo','mark_filed')).toBe('filed');
    expect(transitionFilingTask('filed','mark_paid')).toBe('paid');
    expect(()=>transitionFilingTask('todo','mark_paid')).toThrow(FilingError);
    expect(()=>transitionFilingTask('paid','mark_filed')).toThrow(FilingError);
  });
  it('derives due state without mutating the workflow status',()=>{
    expect(deriveFilingTaskTiming('todo','2026-10-09','2026-10-08')).toBe('upcoming');
    expect(deriveFilingTaskTiming('todo','2026-10-09','2026-10-09')).toBe('due_today');
    expect(deriveFilingTaskTiming('filed','2026-10-09','2026-10-10')).toBe('overdue');
    expect(deriveFilingTaskTiming('paid','2026-10-09','2026-10-10')).toBe('completed');
  });
  it('allows explicit fixtures but blocks incomplete or non-government production sources',()=>{
    expect(()=>assertFilingCalendarSource({type:'test_fixture',title:'R2 人工测试日历'})).not.toThrow();
    expect(()=>assertFilingCalendarSource({type:'official_notice',title:'missing source'})).toThrow(FilingError);
    expect(()=>assertFilingCalendarSource({type:'official_notice',title:'untrusted',officialUrl:'https://example.com/a',documentNumber:'X',contentHash:'a'.repeat(64),verifiedAt:'2026-10-09T00:00:00.000Z',verifiedBy:'10000000-0000-4000-8000-000000000001'})).toThrow('gov.cn');
  });
});
