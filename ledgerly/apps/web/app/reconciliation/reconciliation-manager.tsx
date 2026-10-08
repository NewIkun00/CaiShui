'use client';
import {
  counterpartyListResponseSchema, reconciliationCheckIssueSchema, reconciliationCheckRunResponseSchema,
  reconciliationOverviewSchema, settlementResponseSchema, type CounterpartyResponse,
  type ReconciliationCheckRunResponse, type ReconciliationOverview,
} from '@ledgerly/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

interface WorkspaceContext { tenantId:string; companyId:string }
function context():WorkspaceContext|null { try { const raw:unknown=JSON.parse(window.localStorage.getItem('ledgerly.context')??'null'); if(typeof raw!=='object'||raw===null)return null; const value=raw as Partial<WorkspaceContext>; return typeof value.tenantId==='string'&&typeof value.companyId==='string'?{tenantId:value.tenantId,companyId:value.companyId}:null } catch { return null } }
function api(){return process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001'}
function headers(workspace:WorkspaceContext,json=false){return{'x-user-id':'10000000-0000-4000-8000-000000000001','x-tenant-id':workspace.tenantId,...(json?{'content-type':'application/json'}:{})}}
const triageLabels={investigating:'调查中',needs_documents:'待补资料',ready_for_recheck:'待重新检查'} as const;

export function ReconciliationManager(){
  const[workspace,setWorkspace]=useState<WorkspaceContext|null>(null),[ready,setReady]=useState(false);
  const[overview,setOverview]=useState<ReconciliationOverview|null>(null),[parties,setParties]=useState<CounterpartyResponse[]>([]);
  const[check,setCheck]=useState<ReconciliationCheckRunResponse|null>(null),[invoiceId,setInvoiceId]=useState('');
  const[paymentId,setPaymentId]=useState(''),[amount,setAmount]=useState(''),[pending,setPending]=useState(false);
  const[message,setMessage]=useState<string|null>(null); const names=useMemo(()=>new Map(parties.map(p=>[p.id,p.name])),[parties]);

  async function load(workspace:WorkspaceContext){
    const[overviewResponse,partyResponse,checkResponse]=await Promise.all([
      fetch(`${api()}/v1/companies/${workspace.companyId}/reconciliation`,{headers:headers(workspace)}),
      fetch(`${api()}/v1/companies/${workspace.companyId}/counterparties`,{headers:headers(workspace)}),
      fetch(`${api()}/v1/companies/${workspace.companyId}/reconciliation/check-runs/latest`,{headers:headers(workspace)}),
    ]);
    if(!overviewResponse.ok||!partyResponse.ok)throw new Error('无法读取核销数据');
    setOverview(reconciliationOverviewSchema.parse(await overviewResponse.json()));
    setParties(counterpartyListResponseSchema.parse(await partyResponse.json()).items);
    setCheck(checkResponse.ok?reconciliationCheckRunResponseSchema.parse(await checkResponse.json()):null);
  }
  useEffect(()=>{const current=context();setWorkspace(current);if(!current){setReady(true);return}void load(current).catch(()=>setMessage('暂时无法读取核销数据。')).finally(()=>setReady(true))},[]);
  const invoice=overview?.invoices.find(item=>item.invoiceId===invoiceId);
  const payments=(overview?.payments??[]).filter(payment=>payment.status==='open'&&(!invoice||(payment.type===(invoice.direction==='output'?'money_received':'money_paid')&&payment.counterpartyId===invoice.counterpartyId)));
  function selectInvoice(id:string){setInvoiceId(id);setPaymentId('');setAmount('')}
  function selectPayment(id:string){setPaymentId(id);const payment=payments.find(item=>item.paymentEventId===id);if(invoice&&payment)setAmount(Math.min(Number(invoice.outstandingAmount),Number(payment.unallocatedAmount)).toFixed(2))}

  async function submit(event:FormEvent){event.preventDefault();if(!workspace||!invoiceId||!paymentId)return;setPending(true);setMessage('正在核对双方余额并创建核销…');try{const response=await fetch(`${api()}/v1/companies/${workspace.companyId}/reconciliation/settlements`,{method:'POST',headers:headers(workspace,true),body:JSON.stringify({invoiceId,paymentEventId:paymentId,amount})});const payload:unknown=await response.json();if(!response.ok)throw new Error(response.status===409?'核销关系已存在或余额刚刚发生变化。':'金额超过未核销余额，或双方方向、往来单位不一致。');settlementResponseSchema.parse(payload);await load(workspace);setInvoiceId('');setPaymentId('');setAmount('');setMessage('核销成功。请重新运行勾稽检查确认差异是否解除。')}catch(error:unknown){setMessage(error instanceof Error?error.message:'核销失败。')}finally{setPending(false)}}
  async function runCheck(){if(!workspace)return;setPending(true);setMessage('正在冻结当前数据并运行全部勾稽检查…');try{const response=await fetch(`${api()}/v1/companies/${workspace.companyId}/reconciliation/check-runs`,{method:'POST',headers:headers(workspace)});const payload:unknown=await response.json();if(!response.ok)throw new Error('勾稽检查失败。');const result=reconciliationCheckRunResponseSchema.parse(payload);setCheck(result);setMessage(result.blocksFiling?`发现 ${result.totalIssues} 项待处理差异，当前阻断后续申报。`:'勾稽检查通过，当前没有未解决差异。')}catch(error:unknown){setMessage(error instanceof Error?error.message:'勾稽检查失败。')}finally{setPending(false)}}
  async function triage(issueId:string,status:keyof typeof triageLabels,note:string,expectedVersion:number){if(!workspace||!check)return;const response=await fetch(`${api()}/v1/companies/${workspace.companyId}/reconciliation/check-runs/${check.id}/issues/${issueId}/triage`,{method:'POST',headers:headers(workspace,true),body:JSON.stringify({status,note,expectedVersion})});const payload:unknown=await response.json();if(!response.ok)throw new Error(response.status===409?'处理状态已变化，请刷新后重试。':'无法更新处理状态。');const updated=reconciliationCheckIssueSchema.parse(payload);setCheck({...check,issues:check.issues.map(item=>item.id===updated.id?updated:item)});setMessage('处理状态已记录；只有修复事实并重新检查通过后，申报阻断才会解除。')}

  if(!ready)return <section className="reconciliation-workspace"><div className="onboarding-card">正在读取核销数据…</div></section>;
  if(!workspace||!overview)return <section className="reconciliation-workspace"><div className="onboarding-card">请先完成建档、发票和收付款记录。</div></section>;
  return <section className="reconciliation-workspace">
    <form className="onboarding-card settlement-form" onSubmit={event=>void submit(event)}><h2>新增核销</h2><label>待核销发票<select value={invoiceId} onChange={event=>selectInvoice(event.target.value)} required><option value="">请选择…</option>{overview.invoices.filter(item=>item.status==='open').map(item=><option value={item.invoiceId} key={item.invoiceId}>{item.direction==='output'?'销项':'进项'} · {item.invoiceNumber} · 余 ¥{item.outstandingAmount}</option>)}</select></label><label>匹配的收付款<select value={paymentId} onChange={event=>selectPayment(event.target.value)} required disabled={!invoiceId}><option value="">请选择…</option>{payments.map(item=><option value={item.paymentEventId} key={item.paymentEventId}>{item.occurredOn} · {item.description} · 余 ¥{item.unallocatedAmount}</option>)}</select></label><label>本次核销金额<input value={amount} onChange={event=>setAmount(event.target.value)} inputMode="decimal" required/></label><div className="notice">系统会再次检查方向、往来单位和双方余额。已创建的核销记录不直接覆盖。</div><button className="primary button" disabled={pending||!paymentId}>确认核销</button>{message&&<p className={message.includes('失败')||message.includes('超过')||message.includes('存在')?'form-error':'form-success'}>{message}</p>}</form>
    <div className="reconciliation-board">
      <section className="check-center"><div className="list-title"><div><p className="eyebrow">勾稽检查</p><h2>申报前差异清单</h2></div><button className="secondary button" type="button" disabled={pending} onClick={()=>void runCheck()}>重新运行全部检查</button></div>{!check?<p className="empty">尚未运行检查。系统会冻结核销与账簿输入，并检查期初余额、本期发生、期末余额和借贷试算平衡。</p>:<><div className={`check-summary ${check.grade}`}><strong>{check.grade==='green'?'检查通过':check.grade==='red'?'红色阻断':'需要处理'}</strong><span>{check.periodStart} 至 {check.periodEnd} · {check.totalIssues} 项差异</span><small>{check.blocksFiling?'当前阻断后续申报；人工备注不会直接解除。':'当前没有勾稽阻断项。'}</small></div>{check.issues.map(issue=><IssueTriage key={issue.id} issue={issue} onSave={(status,note)=>triage(issue.id,status,note,issue.triageVersion)}/>)}</>}</section>
      <section><div className="list-title"><div><p className="eyebrow">发票</p><h2>应收应付余额</h2></div><span>{overview.invoices.filter(item=>item.status==='settled').length} 张已结清</span></div>{overview.invoices.length===0?<p className="empty">还没有已确认发票。</p>:overview.invoices.map(item=><article key={item.invoiceId}><div><span>{item.direction==='output'?'销项':'进项'}</span><strong>{item.invoiceNumber}</strong><small>{names.get(item.counterpartyId)??'未知往来方'} · {item.issuedOn}</small></div><div><b>¥{item.outstandingAmount}</b><small>已核销 ¥{item.allocatedAmount} / ¥{item.totalAmount}</small></div><em className={item.status}>{item.status==='settled'?'已结清':'待核销'}</em></article>)}</section>
      <section><div className="list-title"><div><p className="eyebrow">资金</p><h2>收付款分配</h2></div><span>{overview.payments.filter(item=>item.status==='settled').length} 笔已分配</span></div>{overview.payments.length===0?<p className="empty">还没有已确认收付款。</p>:overview.payments.map(item=><article key={item.paymentEventId}><div><span>{item.type==='money_received'?'收款':'付款'}</span><strong>{item.description}</strong><small>{names.get(item.counterpartyId)??'未知往来方'} · {item.occurredOn}</small></div><div><b>¥{item.unallocatedAmount}</b><small>已核销 ¥{item.allocatedAmount} / ¥{item.totalAmount}</small></div><em className={item.status}>{item.status==='settled'?'已分配':'待分配'}</em></article>)}</section>
    </div>
  </section>;
}

function IssueTriage({issue,onSave}:{issue:ReconciliationCheckRunResponse['issues'][number];onSave:(status:keyof typeof triageLabels,note:string)=>Promise<void>}){
  const[status,setStatus]=useState<keyof typeof triageLabels>(issue.triageStatus==='open'?'investigating':issue.triageStatus),[note,setNote]=useState(issue.triageNote??''),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);
  async function submit(event:FormEvent){event.preventDefault();setSaving(true);setError(null);try{await onSave(status,note)}catch(cause:unknown){setError(cause instanceof Error?cause.message:'保存失败。')}finally{setSaving(false)}}
  return <form className="check-issue" onSubmit={event=>void submit(event)}><div><span className={`risk ${issue.severity}`}>{issue.severity==='red'?'红色阻断':'黄色复核'}</span><strong>{issue.message}</strong><small>{issue.amount!=='0.00'&&<>差异金额 ¥{issue.amount} · </>}{issue.suggestedAction}</small></div><label>处理状态<select value={status} onChange={event=>setStatus(event.target.value as keyof typeof triageLabels)}>{Object.entries(triageLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>处理说明<input value={note} onChange={event=>setNote(event.target.value)} minLength={5} maxLength={500} placeholder="记录调查进展或待补资料" required/></label><button className="secondary button" disabled={saving}>{saving?'保存中…':'记录进展'}</button>{error&&<p className="form-error">{error}</p>}</form>
}
