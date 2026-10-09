'use client';

import { apiFetch } from '@/app/lib/api-fetch';

import {
  counterpartyListResponseSchema, invoiceInputSchema, invoiceListResponseSchema,
  invoiceResponseSchema, mockInvoiceExtractionResponseSchema,
  type CounterpartyResponse, type InvoiceResponse,
} from '@ledgerly/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

interface WorkspaceContext { tenantId: string; companyId: string }
interface Fields {
  direction: 'input'|'output'; kind: 'ordinary'|'special'; color: 'blue'|'red';
  invoiceNumber: string; issuedOn: string; counterpartyId: string;
  amountExcludingTax: string; taxAmount: string; totalAmount: string; remarks: string;
}

const emptyFields: Fields = { direction:'output',kind:'ordinary',color:'blue',invoiceNumber:'',issuedOn:'',counterpartyId:'',amountExcludingTax:'',taxAmount:'',totalAmount:'',remarks:'' };
const mockSample = '方向：销项\n票种：普通发票\n蓝红：蓝字\n发票号码：25322000000000000001\n开票日期：2026-10-08\n往来单位：示例客户\n不含税金额：1000.00\n税额：60.00\n价税合计：1060.00\n备注：技术服务费';

function readContext(): WorkspaceContext|null {
  try { const raw: unknown=JSON.parse(window.localStorage.getItem('ledgerly.context')??'null'); if(typeof raw!=='object'||raw===null)return null; const value=raw as Partial<WorkspaceContext>; return typeof value.tenantId==='string'&&typeof value.companyId==='string'?{tenantId:value.tenantId,companyId:value.companyId}:null; } catch { return null; }
}

export function InvoiceManager() {
  const [workspace,setWorkspace]=useState<WorkspaceContext|null>(null);
  const [ready,setReady]=useState(false);
  const [parties,setParties]=useState<CounterpartyResponse[]>([]);
  const [invoices,setInvoices]=useState<InvoiceResponse[]>([]);
  const [fields,setFields]=useState<Fields>(emptyFields);
  const [source,setSource]=useState<'manual'|'mock_ocr'>('manual');
  const [mockText,setMockText]=useState(mockSample);
  const [message,setMessage]=useState<string|null>(null);
  const [warnings,setWarnings]=useState<string[]>([]);
  const [pending,setPending]=useState(false);

  useEffect(()=>{ const current=readContext(); setWorkspace(current); if(!current){setReady(true);return;} const headers=authHeaders(current); void Promise.all([
    apiFetch(`${api()}/v1/companies/${current.companyId}/counterparties`,{headers}).then(r=>r.json()),
    apiFetch(`${api()}/v1/companies/${current.companyId}/invoices`,{headers}).then(r=>r.json()),
  ]).then(([partyPayload,invoicePayload]:unknown[])=>{ const p=counterpartyListResponseSchema.safeParse(partyPayload); const i=invoiceListResponseSchema.safeParse(invoicePayload); if(p.success)setParties(p.data.items); if(i.success)setInvoices(i.data.items); }).catch(()=>setMessage('暂时无法读取发票数据。')).finally(()=>setReady(true)); },[]);

  const eligibleParties=useMemo(()=>parties.filter(p=>p.type===(fields.direction==='output'?'customer':'supplier')),[parties,fields.direction]);
  const partyNames=useMemo(()=>new Map(parties.map(p=>[p.id,p.name])),[parties]);
  function change<K extends keyof Fields>(key:K,value:Fields[K]) { setFields(current=>({...current,[key]:value,...(key==='direction'?{counterpartyId:''}:{})})); }

  async function extract() {
    if(!workspace)return setMessage('请先完成企业建档。'); setPending(true); setWarnings([]); setMessage('正在运行模拟识别…');
    try { const response=await apiFetch(`${api()}/v1/companies/${workspace.companyId}/invoices/extractions/mock`,{method:'POST',headers:{...authHeaders(workspace),'content-type':'application/json'},body:JSON.stringify({text:mockText})}); const payload:unknown=await response.json(); if(!response.ok)throw new Error('模拟识别失败。'); const result=mockInvoiceExtractionResponseSchema.parse(payload); const c=result.candidate; setFields(current=>({...current,...(c.direction?{direction:c.direction}:{}),...(c.kind?{kind:c.kind}:{}),...(c.color?{color:c.color}:{}),...(c.invoiceNumber?{invoiceNumber:c.invoiceNumber}:{}),...(c.issuedOn?{issuedOn:c.issuedOn}:{}),...(c.counterpartyId?{counterpartyId:c.counterpartyId}:{}),...(c.amountExcludingTax?{amountExcludingTax:c.amountExcludingTax}:{}),...(c.taxAmount?{taxAmount:c.taxAmount}:{}),...(c.totalAmount?{totalAmount:c.totalAmount}:{}),...(c.remarks?{remarks:c.remarks}:{})})); setSource('mock_ocr'); setWarnings(result.warnings); setMessage(`模拟识别完成，置信度 ${Math.round(result.confidence*100)}%，请人工核对。`); }
    catch(error:unknown){setMessage(error instanceof Error?error.message:'模拟识别失败。');} finally{setPending(false);}
  }

  async function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!workspace)return setMessage('请先完成企业建档。'); const parsed=invoiceInputSchema.safeParse({...fields,remarks:fields.remarks||undefined,source}); if(!parsed.success)return setMessage('请检查号码、日期、往来单位和金额，价税合计也必须正确。'); setPending(true); setMessage('正在保存发票草稿…');
    try { const response=await apiFetch(`${api()}/v1/companies/${workspace.companyId}/invoices`,{method:'POST',headers:{...authHeaders(workspace),'content-type':'application/json'},body:JSON.stringify(parsed.data)}); const payload:unknown=await response.json(); if(!response.ok)throw new Error(response.status===409?'发票号码重复，或往来单位类型不匹配。':'保存失败，请核对价税合计。'); const saved=invoiceResponseSchema.parse(payload); setInvoices(current=>[saved,...current]); setFields({...emptyFields,direction:fields.direction}); setSource('manual'); setWarnings([]); setMessage('发票草稿已保存，请在右侧列表确认。'); }
    catch(error:unknown){setMessage(error instanceof Error?error.message:'保存失败。');} finally{setPending(false);}
  }

  async function confirm(invoice:InvoiceResponse) {
    if(!workspace)return; setPending(true); setMessage('正在确认发票…'); try { const response=await apiFetch(`${api()}/v1/companies/${workspace.companyId}/invoices/${invoice.id}/confirm`,{method:'POST',headers:{...authHeaders(workspace),'content-type':'application/json'},body:'{}'}); const payload:unknown=await response.json(); if(!response.ok)throw new Error('确认失败，请刷新后重试。'); const saved=invoiceResponseSchema.parse(payload); setInvoices(current=>current.map(item=>item.id===saved.id?saved:item)); setMessage('发票事实已确认。'); } catch(error:unknown){setMessage(error instanceof Error?error.message:'确认失败。');} finally{setPending(false);}
  }

  if(!ready)return <section className="invoice-workspace"><div className="onboarding-card">正在读取发票数据…</div></section>;
  if(!workspace)return <section className="invoice-workspace"><div className="onboarding-card">请先完成企业建档和账套初始化。</div></section>;
  return <section className="invoice-workspace"><div className="invoice-entry"><details className="extract-card"><summary>模拟 OCR 识别</summary><p>粘贴下列固定标签文本。它模拟未来 OCR 适配器的结构化输出，不上传真实文件。</p><textarea rows={11} value={mockText} onChange={e=>setMockText(e.target.value)}/><button type="button" className="secondary" disabled={pending} onClick={()=>void extract()}>识别并填入草稿</button></details><form className="onboarding-card invoice-form" onSubmit={e=>void create(e)}><div className="invoice-form-grid"><label>方向<select value={fields.direction} onChange={e=>change('direction',e.target.value as Fields['direction'])}><option value="output">销项发票</option><option value="input">进项发票</option></select></label><label>票种<select value={fields.kind} onChange={e=>change('kind',e.target.value as Fields['kind'])}><option value="ordinary">普通发票</option><option value="special">专用发票</option></select></label><label>蓝红字<select value={fields.color} onChange={e=>change('color',e.target.value as Fields['color'])}><option value="blue">蓝字</option><option value="red">红字</option></select></label><label>开票日期<input type="date" required value={fields.issuedOn} onChange={e=>change('issuedOn',e.target.value)}/></label></div><label>发票号码<input required minLength={8} maxLength={40} value={fields.invoiceNumber} onChange={e=>change('invoiceNumber',e.target.value)} placeholder="8–30 位字母或数字"/></label><label>往来单位<select required value={fields.counterpartyId} onChange={e=>change('counterpartyId',e.target.value)}><option value="">请选择{fields.direction==='output'?'客户':'供应商'}</option>{eligibleParties.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><div className="invoice-form-grid money"><label>不含税金额<input inputMode="decimal" required value={fields.amountExcludingTax} onChange={e=>change('amountExcludingTax',e.target.value)}/></label><label>税额<input inputMode="decimal" required value={fields.taxAmount} onChange={e=>change('taxAmount',e.target.value)}/></label><label>价税合计<input inputMode="decimal" required value={fields.totalAmount} onChange={e=>change('totalAmount',e.target.value)}/></label></div><label>备注<textarea rows={2} maxLength={500} value={fields.remarks} onChange={e=>change('remarks',e.target.value)}/></label><div className="notice">红字发票也按正数录入，由“红字”字段表达冲减方向。保存后仍是草稿，必须人工确认。</div><button className="primary button" disabled={pending}>保存发票草稿</button>{warnings.map(w=><p className="row-error" key={w}>{w}</p>)}{message&&<p className={message.includes('完成')||message.includes('保存')||message.includes('确认')?'form-success':'form-error'} role="status">{message}</p>}</form></div><section className="invoice-list"><header><div><p className="eyebrow">共 {invoices.length} 张</p><h2>发票记录</h2></div></header>{invoices.length===0?<div className="empty-state">还没有发票，请从左侧录入。</div>:invoices.map(item=><article key={item.id}><div className="invoice-meta"><span className={item.direction}>{item.direction==='output'?'销项':'进项'}</span><small>{item.issuedOn} · {item.kind==='special'?'专票':'普票'} · {item.color==='red'?'红字':'蓝字'}</small><strong>{partyNames.get(item.counterpartyId)??'未知往来单位'}</strong><code>{item.invoiceNumber}</code></div><div className="invoice-amount"><b>¥{item.totalAmount}</b><small>未税 ¥{item.amountExcludingTax} · 税额 ¥{item.taxAmount}</small></div><div className={`event-status ${item.status}`}>{item.status==='confirmed'?<span>已确认</span>:<button disabled={pending} onClick={()=>void confirm(item)}>确认</button>}<small>{item.source==='mock_ocr'?'模拟识别':'人工录入'}</small></div></article>)}</section></section>;
}

function api(){return process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';}
function authHeaders(workspace:WorkspaceContext){return {'x-user-id':'10000000-0000-4000-8000-000000000001','x-tenant-id':workspace.tenantId};}
