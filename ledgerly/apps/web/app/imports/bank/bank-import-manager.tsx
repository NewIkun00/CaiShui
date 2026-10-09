'use client';

import { apiFetch } from '@/app/lib/api-fetch';

import { bankImportBatchSchema, ledgerSetupResponseSchema, type BankImportBatchResponse } from '@ledgerly/contracts';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

interface WorkspaceContext { tenantId: string; companyId: string }
const template = '交易日期,摘要,对方名称,收入,支出,余额\n2026-10-08,收到项目款,示例客户,1200.50,,2200.60\n';

function context(): WorkspaceContext | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem('ledgerly.context') ?? 'null');
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Partial<WorkspaceContext>;
    return typeof value.tenantId === 'string' && typeof value.companyId === 'string' ? { tenantId: value.tenantId, companyId: value.companyId } : null;
  } catch { return null; }
}

export function BankImportManager() {
  const [batch, setBatch] = useState<BankImportBatchResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const workspace = context();
    if (!workspace) { setMessage('请先完成企业建档。'); return; }
    const form = new FormData(event.currentTarget); const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) { setMessage('请选择 CSV 文件。'); return; }
    if (file.size > 2_000_000) { setMessage('单个文件不能超过 2 MB。'); return; }
    setPending(true); setMessage('正在解析和校验…');
    try {
      const setupResponse=await apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/v1/companies/${workspace.companyId}/ledger-setup`,{headers:{'x-user-id':'10000000-0000-4000-8000-000000000001','x-tenant-id':workspace.tenantId}});
      if(!setupResponse.ok)throw new Error('请先完成资金账户和会计期间设置。');
      const setup=ledgerSetupResponseSchema.parse(await setupResponse.json());
      if(setup.accountType!=='bank')throw new Error('当前资金账户不是银行账户，不能导入银行对账单。');
      const response = await request(workspace, '', { method: 'POST', body: JSON.stringify({ fileName: file.name, content: await file.text(),statementPeriodStart:setup.periodStart,statementPeriodEnd:setup.periodEnd }) });
      const payload: unknown = await response.json(); if (!response.ok) throw new Error('上传或校验失败。');
      const parsed = bankImportBatchSchema.parse(payload); setBatch(parsed);
      setMessage(parsed.status === 'has_errors' ? '发现错误，请修正 CSV 或补充同名往来单位后重新上传。' : '校验通过，请核对后确认。');
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : '导入失败。'); }
    finally { setPending(false); }
  }

  async function confirm() {
    const workspace = context(); if (!workspace || !batch) return;
    setPending(true); setMessage('正在确认并生成业务事件…');
    try {
      const response = await request(workspace, `/${batch.id}/confirm`, { method: 'POST', body: '{}' });
      const payload: unknown = await response.json(); if (!response.ok) throw new Error('批次尚不能确认。');
      setBatch(bankImportBatchSchema.parse(payload)); setMessage('导入完成，已生成收付款业务事件。');
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : '确认失败。'); }
    finally { setPending(false); }
  }

  function request(workspace: WorkspaceContext, suffix: string, init: RequestInit) {
    return apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/v1/companies/${workspace.companyId}/imports/bank-csv${suffix}`, {
      ...init, headers: { 'content-type': 'application/json', 'x-user-id': '10000000-0000-4000-8000-000000000001', 'x-tenant-id': workspace.tenantId },
    });
  }

  return <div className="bank-import"><section className="import-upload"><form className="onboarding-card" onSubmit={(event) => void upload(event)}><label>银行对账单 CSV 文件<input type="file" name="file" accept=".csv,text/csv" required /></label><div className="template-help"><strong>文件将绑定当前资金账户和会计期间，必须包含：</strong><span>交易日期、摘要、对方名称、收入、支出、余额</span><a download="银行流水导入模板.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}>下载示例模板</a></div><button className="primary button" disabled={pending}>{pending?'处理中…':'上传并校验'}</button>{message&&<p className={message.includes('通过')||message.includes('完成')?'form-success':'form-error'} role="status">{message}</p>}</form></section>{batch&&<section className="import-result"><header><div><p className="eyebrow">{batch.statementPeriodStart} 至 {batch.statementPeriodEnd}</p><h2>{batch.fileName}</h2></div><span className={`batch-status ${batch.status}`}>{batch.status==='validated'?'可确认':batch.status==='confirmed'?'已确认':'存在错误'}</span></header><div className="import-metrics"><div><b>{batch.totalRows}</b><span>总行数</span></div><div><b>{batch.validRows}</b><span>有效</span></div><div><b>{batch.invalidRows}</b><span>错误</span></div><div><b>{batch.duplicateRows}</b><span>重复跳过</span></div></div>{batch.batchErrors.map((error)=><p className="row-error" key={error}>{error}</p>)}<div className="import-table"><table><thead><tr><th>行</th><th>日期</th><th>对方</th><th>方向</th><th>金额</th><th>余额</th><th>状态</th></tr></thead><tbody>{batch.rows.map((row)=><tr key={row.id}><td>{row.rowNumber}</td><td>{row.occurredOn??'—'}</td><td>{row.counterpartyName??'—'}</td><td>{row.direction==='income'?'收入':row.direction==='expense'?'支出':'—'}</td><td>{row.amount??'—'}</td><td>{row.balance??'—'}</td><td><span className={`row-status ${row.status}`}>{row.status==='valid'?'有效':row.status==='duplicate'?'重复':'错误'}</span>{row.errors.map((error)=><small key={error}>{error}</small>)}</td></tr>)}</tbody></table></div>{batch.status==='validated'&&<button className="primary button confirm-import" disabled={pending} onClick={() => void confirm()}>确认导入 {batch.validRows} 条</button>}{batch.status==='confirmed'&&<Link className="primary finish-link" href="/events">查看业务事件</Link>}</section>}</div>;
}
