'use client';

import { apiFetch } from '@/app/lib/api-fetch';

import {
  businessEventListResponseSchema, chartOfAccountsResponseSchema, ledgerResponseSchema,
  periodReopenRequestCreationResponseSchema, periodReopenRequestListResponseSchema,
  periodReopenRequestResponseSchema,
  reviewCaseCreationResponseSchema,
  voucherGenerationResponseSchema, voucherListResponseSchema, voucherResponseSchema,
  type BusinessEventResponse, type LedgerResponse, type PeriodReopenRequestResponse, type VoucherResponse,
} from '@ledgerly/contracts';
import { useEffect, useMemo, useState } from 'react';

interface WorkspaceContext { tenantId: string; companyId: string }
type View = 'vouchers' | 'ledger';
const labels = { service_completed:'完成服务', invoice_issued:'开具发票', money_received:'收到款项', expense_incurred:'发生费用', money_paid:'支付款项', capital_contribution:'股东出资', shareholder_advance:'股东垫付款' } as const;
const statusLabels = { draft:'待确认', confirmed:'已入账', reversed:'已冲销' } as const;

function context(): WorkspaceContext | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem('ledgerly.context') ?? 'null');
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Partial<WorkspaceContext>;
    return typeof value.tenantId === 'string' && typeof value.companyId === 'string' ? { tenantId:value.tenantId, companyId:value.companyId } : null;
  } catch { return null; }
}
function api() { return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'; }
function headers(workspace: WorkspaceContext, json=false) { return { 'x-user-id':'10000000-0000-4000-8000-000000000001', 'x-tenant-id':workspace.tenantId, ...(json ? { 'content-type':'application/json' } : {}) }; }
async function errorMessage(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
  const messages: Record<string,string> = {
    ACCOUNTING_PERIOD_LOCKED:'当前会计期间已锁定，不能再修改。', DRAFT_VOUCHERS_EXIST:'仍有待确认凭证，请全部处理后再锁账。',
    VOUCHER_CONFIRM_CONFLICT:'凭证状态已变化，请刷新后重试。', VOUCHER_REVERSAL_CONFLICT:'凭证已变化、已冲销或不允许冲销。',
    VOUCHER_MAPPING_REQUIRES_REVIEW:'该事项需要核销关系或补充证据，已停止自动入账。', EVENT_OUTSIDE_OPEN_PERIOD:'事项不在当前会计期间，不能生成凭证。',
    ACCOUNTING_PERIOD_NOT_LOCKED:'当前期间尚未锁定，无需申请反结账。',
    PERIOD_REOPEN_REQUEST_CHANGED:'申请已被其他人处理，请刷新后重试。',
    PERIOD_REOPEN_DECISION_REJECTED:'申请人不能复核自己的申请，且只能处理待复核申请。',
  };
  return messages[payload?.error?.code ?? ''] ?? payload?.error?.message ?? fallback;
}

export function AccountingManager() {
  const [workspace,setWorkspace] = useState<WorkspaceContext|null>(null);
  const [ready,setReady] = useState(false);
  const [events,setEvents] = useState<BusinessEventResponse[]>([]);
  const [vouchers,setVouchers] = useState<VoucherResponse[]>([]);
  const [ledger,setLedger] = useState<LedgerResponse|null>(null);
  const [templateVersion,setTemplateVersion] = useState('');
  const [accountCount,setAccountCount] = useState(0);
  const [selected,setSelected] = useState('');
  const [pending,setPending] = useState(false);
  const [message,setMessage] = useState<string|null>(null);
  const [view,setView] = useState<View>('vouchers');
  const [reopenRequests,setReopenRequests] = useState<PeriodReopenRequestResponse[]>([]);
  const [reviewerId,setReviewerId] = useState('20000000-0000-4000-8000-000000000002');

  async function loadLedger(current: WorkspaceContext) {
    const response = await apiFetch(`${api()}/v1/companies/${current.companyId}/accounting/ledger`,{ headers:headers(current) });
    if (!response.ok) throw new Error(await errorMessage(response,'账簿读取失败。'));
    setLedger(ledgerResponseSchema.parse(await response.json()));
  }

  useEffect(() => {
    const current=context(); setWorkspace(current);
    if (!current) { setReady(true); return; }
    const h=headers(current);
    void Promise.all([
      apiFetch(`${api()}/v1/companies/${current.companyId}/business-events`,{headers:h}).then(r=>r.json()),
      apiFetch(`${api()}/v1/companies/${current.companyId}/accounting/vouchers`,{headers:h}).then(r=>r.json()),
      apiFetch(`${api()}/v1/companies/${current.companyId}/accounting/chart-of-accounts`,{headers:h}).then(r=>r.json()),
      apiFetch(`${api()}/v1/companies/${current.companyId}/accounting/ledger`,{headers:h}).then(r=>r.json()),
      apiFetch(`${api()}/v1/companies/${current.companyId}/accounting-period/reopen-requests`,{headers:h}).then(r=>r.json()),
    ]).then(([eventPayload,voucherPayload,chartPayload,ledgerPayload,reopenPayload]:unknown[]) => {
      const e=businessEventListResponseSchema.safeParse(eventPayload),v=voucherListResponseSchema.safeParse(voucherPayload),c=chartOfAccountsResponseSchema.safeParse(chartPayload),l=ledgerResponseSchema.safeParse(ledgerPayload),r=periodReopenRequestListResponseSchema.safeParse(reopenPayload);
      if(e.success)setEvents(e.data.items); if(v.success)setVouchers(v.data.items); if(c.success){setTemplateVersion(c.data.templateVersion);setAccountCount(c.data.items.length);} if(l.success)setLedger(l.data);if(r.success)setReopenRequests(r.data.items);
    }).catch(()=>setMessage('暂时无法读取账务数据。')).finally(()=>setReady(true));
  },[]);

  const used=useMemo(()=>new Set(vouchers.filter(item=>!item.reversalOfVoucherId).map(item=>item.sourceBusinessEventId)),[vouchers]);
  const candidates=events.filter(item=>item.status==='confirmed'&&!used.has(item.id));
  const locked=ledger?.period.status==='locked';
  const reopenRequest=reopenRequests.find(item=>item.status==='pending')??null;

  async function generate() {
    if(!workspace||!selected)return; setPending(true); setMessage('正在应用确定性记账规则…');
    try {
      const response=await apiFetch(`${api()}/v1/companies/${workspace.companyId}/accounting/vouchers/from-business-event/${selected}`,{method:'POST',headers:headers(workspace,true),body:'{}'});
      if(!response.ok)throw new Error(await errorMessage(response,'凭证生成失败。'));
      const result=voucherGenerationResponseSchema.parse(await response.json());
      setVouchers(current=>result.generated?[result.voucher,...current]:current); setSelected('');
      setMessage(result.generated?'已生成平衡凭证草稿，请复核后确认入账。':'该事项已有相同规则版本的凭证，没有重复生成。');
    } catch(error:unknown){setMessage(error instanceof Error?error.message:'生成失败。');} finally{setPending(false);}
  }

  async function confirm(voucher: VoucherResponse) {
    if(!workspace)return; setPending(true); setMessage('正在确认入账…');
    try {
      const response=await apiFetch(`${api()}/v1/companies/${workspace.companyId}/accounting/vouchers/${voucher.id}/confirm`,{method:'POST',headers:headers(workspace,true),body:JSON.stringify({expectedVersion:voucher.version})});
      if(!response.ok)throw new Error(await errorMessage(response,'确认入账失败。'));
      const saved=voucherResponseSchema.parse(await response.json()); setVouchers(current=>current.map(item=>item.id===saved.id?saved:item)); await loadLedger(workspace); setMessage('凭证已正式入账，账簿与科目余额已更新。');
    } catch(error:unknown){setMessage(error instanceof Error?error.message:'确认失败。');} finally{setPending(false);}
  }

  async function reverse(voucher: VoucherResponse) {
    if(!workspace)return; const reason=window.prompt('请输入冲销原因（将写入审计记录）'); if(!reason?.trim())return;
    if(!window.confirm('冲销不会删除原凭证，而会生成一张相反分录。确定继续吗？'))return;
    setPending(true); setMessage('正在生成冲销凭证…');
    try {
      const response=await apiFetch(`${api()}/v1/companies/${workspace.companyId}/accounting/vouchers/${voucher.id}/reverse`,{method:'POST',headers:headers(workspace,true),body:JSON.stringify({reversalDate:voucher.voucherDate,reason:reason.trim(),expectedVersion:voucher.version})});
      if(!response.ok)throw new Error(await errorMessage(response,'冲销失败。'));
      const reversal=voucherResponseSchema.parse(await response.json()); setVouchers(current=>[reversal,...current.map(item=>item.id===voucher.id?{...item,status:'reversed' as const,version:item.version+1}:item)]); await loadLedger(workspace); setMessage('冲销完成：原凭证已保留，并生成相反分录。');
    } catch(error:unknown){setMessage(error instanceof Error?error.message:'冲销失败。');} finally{setPending(false);}
  }

  async function lockPeriod() {
    if(!workspace||!ledger||!window.confirm(`锁定 ${ledger.period.start} 至 ${ledger.period.end} 后，普通写操作将被阻止。确定锁账吗？`))return;
    setPending(true); setMessage('正在执行锁账检查…');
    try {
      const response=await apiFetch(`${api()}/v1/companies/${workspace.companyId}/accounting/period/lock`,{method:'POST',headers:headers(workspace,true),body:'{}'});
      if(!response.ok)throw new Error(await errorMessage(response,'锁账失败。')); await loadLedger(workspace); setMessage('会计期间已锁定，后续修改需走反结账审批。');
    } catch(error:unknown){setMessage(error instanceof Error?error.message:'锁账失败。');} finally{setPending(false);}
  }

  async function requestReopen() {
    if(!workspace)return;const reason=window.prompt('请说明反结账原因（至少 5 个字，将进入审计记录）');if(!reason?.trim())return;
    setPending(true);setMessage('正在提交反结账申请…');
    try{const response=await apiFetch(`${api()}/v1/companies/${workspace.companyId}/accounting-period/reopen-requests`,{method:'POST',headers:headers(workspace,true),body:JSON.stringify({reason:reason.trim()})});if(!response.ok)throw new Error(await errorMessage(response,'反结账申请提交失败。'));const result=periodReopenRequestCreationResponseSchema.parse(await response.json());setReopenRequests(current=>[result.request,...current.filter(item=>item.id!==result.request.id)]);const reviewResponse=await apiFetch(`${api()}/v1/companies/${workspace.companyId}/review-cases`,{method:'POST',headers:headers(workspace,true),body:JSON.stringify({sourceType:'period_reopen_request',sourceId:result.request.id})});if(!reviewResponse.ok)throw new Error('反结账申请已保存，但进入统一复核队列失败，请重试。');reviewCaseCreationResponseSchema.parse(await reviewResponse.json());setMessage(result.created?'反结账申请已提交，并进入统一人工复核队列。':'本期已有待复核申请，已确认关联统一复核案件。');}catch(error:unknown){setMessage(error instanceof Error?error.message:'申请提交失败。');}finally{setPending(false);}
  }

  async function decideReopen(decision:'approve'|'reject') {
    if(!workspace||!reopenRequest)return;const reason=window.prompt(decision==='approve'?'请输入批准依据（批准后会立即解锁期间）':'请输入驳回原因（期间将保持锁定）');if(!reason?.trim())return;if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reviewerId)){setMessage('复核人 ID 必须是 UUID。');return;}setPending(true);setMessage('正在记录专业复核决定…');
    try{const response=await apiFetch(`${api()}/v1/companies/${workspace.companyId}/accounting-period/reopen-requests/${reopenRequest.id}/decision`,{method:'POST',headers:{'x-user-id':reviewerId,'x-tenant-id':workspace.tenantId,'content-type':'application/json'},body:JSON.stringify({decision,reason:reason.trim(),expectedVersion:reopenRequest.version})});if(!response.ok)throw new Error(await errorMessage(response,'反结账复核失败。'));const result=periodReopenRequestResponseSchema.parse(await response.json());setReopenRequests(current=>current.map(item=>item.id===result.id?result:item));await loadLedger(workspace);setMessage(decision==='approve'?'反结账已批准，会计期间已重新开放。':'申请已驳回，会计期间保持锁定。');}catch(error:unknown){setMessage(error instanceof Error?error.message:'反结账复核失败。');}finally{setPending(false);}
  }

  if(!ready)return <section className="accounting-workspace"><div className="onboarding-card">正在读取账务数据…</div></section>;
  if(!workspace)return <section className="accounting-workspace"><div className="onboarding-card">请先完成企业建档和账套初始化。</div></section>;
  return <section className="accounting-workspace">
    <aside>
      <div className="accounting-template"><p className="eyebrow">科目模板</p><strong>{templateVersion||'—'}</strong><span>{accountCount} 个启用科目</span></div>
      <div className="onboarding-card voucher-generator"><h2>生成记账草稿</h2><label>已确认业务事项<select value={selected} onChange={e=>setSelected(e.target.value)} disabled={locked}><option value="">请选择…</option>{candidates.map(item=><option value={item.id} key={item.id}>{item.occurredOn} · {labels[item.type]} · ¥{item.amount}</option>)}</select></label><div className="notice">收付款需先完成核销；证据不足时系统会停止自动生成。</div><button className="primary button" type="button" disabled={!selected||pending||locked} onClick={()=>void generate()}>生成凭证草稿</button></div>
      {ledger&&<div className="onboarding-card period-card"><p className="eyebrow">当前会计期间</p><strong>{ledger.period.start} — {ledger.period.end}</strong><span className={`period-status ${ledger.period.status}`}>{ledger.period.status==='open'?'开放记账':'已锁定'}</span>{locked?(reopenRequest?<div className="reopen-pending"><b>反结账申请待复核</b><span>{reopenRequest.reason}</span><small>{new Date(reopenRequest.requestedAt).toLocaleString('zh-CN')}</small><label>开发态复核人 UUID<input value={reviewerId} onChange={event=>setReviewerId(event.target.value)}/></label><div className="voucher-actions"><button type="button" disabled={pending} onClick={()=>void decideReopen('approve')}>批准并解锁</button><button type="button" disabled={pending} onClick={()=>void decideReopen('reject')}>驳回</button></div></div>:<button type="button" className="button" disabled={pending} onClick={()=>void requestReopen()}>申请反结账</button>):<button type="button" className="button" disabled={pending} onClick={()=>void lockPeriod()}>锁定本期</button>}<small>申请人与复核人必须不同；批准后申请决定与期间解锁在同一事务完成。</small>{reopenRequests.filter(item=>item.status!=='pending').slice(0,3).map(item=><small key={item.id}>{item.status==='approved'?'已批准':'已驳回'} · {item.decisionReason} · {item.decidedAt?new Date(item.decidedAt).toLocaleString('zh-CN'):''}</small>)}</div>}
      {message&&<p className={message.includes('失败')||message.includes('不能')||message.includes('阻止')?'form-error':'form-success'}>{message}</p>}
    </aside>
    <section className="voucher-list">
      <div className="accounting-tabs"><button className={view==='vouchers'?'active':''} onClick={()=>setView('vouchers')}>凭证</button><button className={view==='ledger'?'active':''} onClick={()=>setView('ledger')}>账簿与科目余额</button></div>
      {view==='vouchers'?<VoucherList vouchers={vouchers} pending={pending} locked={Boolean(locked)} confirm={confirm} reverse={reverse}/>:ledger?<LedgerView ledger={ledger}/>:<div className="empty-state">账簿尚未生成。</div>}
    </section>
  </section>;
}

function VoucherList({vouchers,pending,locked,confirm,reverse}:{vouchers:VoucherResponse[];pending:boolean;locked:boolean;confirm:(voucher:VoucherResponse)=>Promise<void>;reverse:(voucher:VoucherResponse)=>Promise<void>}) {
  return <><div className="list-title"><div><p className="eyebrow">共 {vouchers.length} 张</p><h2>记账凭证</h2></div><span>草稿复核后才进入账簿</span></div>{vouchers.length===0?<div className="empty-state">还没有凭证。</div>:vouchers.map(item=><article key={item.id} className={`voucher-${item.status}`}><header><div className="voucher-date"><b>{item.voucherDate.slice(8)}</b><span>{item.voucherDate.slice(0,7)}</span></div><div><strong>{item.summary}</strong><small>规则 {item.ruleVersion}</small></div><span className="balanced">{statusLabels[item.status]}</span></header><div className="voucher-total">金额 <b>¥{item.entries.filter(entry=>entry.side==='debit').reduce((sum,entry)=>sum+Number(entry.amount),0).toFixed(2)}</b><span>{item.status==='draft'?'借贷平衡 · 待人工确认':item.status==='confirmed'?'已进入正式账簿':'原凭证保留 · 已生成冲销分录'}</span></div><div className="voucher-actions">{item.status==='draft'&&<button type="button" disabled={pending||locked} onClick={()=>void confirm(item)}>确认入账</button>}{item.status==='confirmed'&&!item.reversalOfVoucherId&&<button type="button" disabled={pending||locked} onClick={()=>void reverse(item)}>冲销凭证</button>}</div><details><summary>查看会计分录（高级）</summary><table><thead><tr><th>科目</th><th>借方</th><th>贷方</th></tr></thead><tbody>{item.entries.map(entry=><tr key={entry.id}><td>{entry.accountCode} {entry.accountName}</td><td>{entry.side==='debit'?`¥${entry.amount}`:'—'}</td><td>{entry.side==='credit'?`¥${entry.amount}`:'—'}</td></tr>)}</tbody></table></details></article>)}</>;
}

function LedgerView({ledger}:{ledger:LedgerResponse}) {
  const sourceLabels={none:'无期初余额',paid_in_capital:'股东投入资本',shareholder_advance:'股东借款或垫资'} as const;
  return <div className="ledger-view"><div className="list-title"><div><p className="eyebrow">{ledger.period.start} — {ledger.period.end}</p><h2>科目余额</h2></div><span>期初与正式凭证合并计算</span></div><div className="notice">期初余额 ¥{ledger.openingBalance.amount}（截至 {ledger.openingBalance.asOf}），来源：{sourceLabels[ledger.openingBalance.source]}，已按复式分录纳入试算平衡。</div><div className="ledger-table"><table><thead><tr><th>科目</th><th>期初借方</th><th>期初贷方</th><th>本期借方</th><th>本期贷方</th><th>期末借方</th><th>期末贷方</th></tr></thead><tbody>{ledger.trialBalance.length===0?<tr><td colSpan={7}>暂无期初余额或正式凭证发生额</td></tr>:ledger.trialBalance.map(row=><tr key={row.accountCode}><td>{row.accountCode} {row.accountName}</td><td>¥{row.openingDebit}</td><td>¥{row.openingCredit}</td><td>¥{row.debitMovement}</td><td>¥{row.creditMovement}</td><td>¥{row.endingDebit}</td><td>¥{row.endingCredit}</td></tr>)}</tbody></table></div><div className="list-title journal-title"><div><p className="eyebrow">共 {ledger.journal.length} 条分录</p><h2>明细账</h2></div></div><div className="ledger-table"><table><thead><tr><th>日期</th><th>摘要</th><th>科目</th><th>方向</th><th>金额</th></tr></thead><tbody>{ledger.journal.map((row,index)=><tr key={`${row.voucherId}-${row.accountCode}-${index}`}><td>{row.voucherDate}</td><td>{row.summary}</td><td>{row.accountCode} {row.accountName}</td><td>{row.side==='debit'?'借':'贷'}</td><td>¥{row.amount}</td></tr>)}</tbody></table></div></div>;
}
