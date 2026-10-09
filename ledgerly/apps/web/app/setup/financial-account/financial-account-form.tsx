'use client';

import { apiFetch } from '@/app/lib/api-fetch';

import { ledgerSetupResponseSchema, ledgerSetupSchema, type LedgerSetupResponse } from '@ledgerly/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

interface WorkspaceContext { tenantId: string; companyId: string }
type State = { kind: 'form' } | { kind: 'submitting' } | { kind: 'error'; message: string } | { kind: 'success'; setup: LedgerSetupResponse };

function workspaceContext(): WorkspaceContext | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem('ledgerly.context') ?? 'null');
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Partial<WorkspaceContext>;
    return typeof value.tenantId === 'string' && typeof value.companyId === 'string'
      ? { tenantId: value.tenantId, companyId: value.companyId }
      : null;
  } catch { return null; }
}

function monthDates(month: string): { periodStart: string; periodEnd: string; openingBalanceAsOf: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText); const monthNumber = Number(monthText);
  const end = new Date(Date.UTC(year, monthNumber, 0));
  const before = new Date(Date.UTC(year, monthNumber - 1, 0));
  return { periodStart: `${month}-01`, periodEnd: end.toISOString().slice(0, 10), openingBalanceAsOf: before.toISOString().slice(0, 10) };
}

function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

export function FinancialAccountForm() {
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [ready, setReady] = useState(false);
  const [accountType, setAccountType] = useState<'bank' | 'cash'>('bank');
  const [openingBalanceSource,setOpeningBalanceSource]=useState<'none'|'paid_in_capital'|'shareholder_advance'>('none');
  const [state, setState] = useState<State>({ kind: 'form' });
  useEffect(() => { setContext(workspaceContext()); setReady(true); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!context) return;
    const form = new FormData(event.currentTarget);
    const period = monthDates(textField(form, 'periodMonth'));
    if (!period) { setState({ kind: 'error', message: '请选择首个会计月份。' }); return; }
    const candidate = {
      accountName: textField(form, 'accountName'), accountType,
      ...(accountType === 'bank' ? { bankName: textField(form, 'bankName'), accountNumberLast4: textField(form, 'last4') } : {}),
      openingBalance: textField(form, 'openingBalance'), openingBalanceSource, ...period,
    };
    const parsed = ledgerSetupSchema.safeParse(candidate);
    if (!parsed.success) { setState({ kind: 'error', message: '请检查账户名称、金额、银行信息和会计月份。' }); return; }
    setState({ kind: 'submitting' });
    try {
      const response = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/v1/companies/${context.companyId}/ledger-setup`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': '10000000-0000-4000-8000-000000000001', 'x-tenant-id': context.tenantId }, body: JSON.stringify(parsed.data),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? '当前企业尚未通过绿色筛查，或已经完成初始化。' : '保存失败，请稍后重试。');
      const setup = ledgerSetupResponseSchema.parse(payload);
      window.localStorage.setItem('ledgerly.ledgerSetup', JSON.stringify(setup));
      setState({ kind: 'success', setup });
    } catch (error: unknown) { setState({ kind: 'error', message: error instanceof TypeError ? '无法连接后端服务。' : error instanceof Error ? error.message : '请求失败。' }); }
  }

  if (!ready) return <div className="onboarding-card">正在读取企业档案…</div>;
  if (!context) return <div className="onboarding-card"><p>没有找到企业档案，请先完成建档。</p><Link className="primary" href="/onboarding">返回建档</Link></div>;
  if (state.kind === 'success') return <section className="scope-result green"><p className="eyebrow">保存成功</p><h2>{state.setup.accountName}</h2><p>期初余额 ¥{state.setup.openingBalance}，已生成 {state.setup.openingEntries.length} 条期初分录；首个会计期间为 {state.setup.periodStart} 至 {state.setup.periodEnd}。</p><div className="result-actions"><Link className="primary" href="/dashboard">返回初始化工作台</Link></div></section>;

  return <form className="onboarding-card" onSubmit={(event) => void submit(event)}><label>账户类型<select value={accountType} onChange={(event) => setAccountType(event.target.value as 'bank' | 'cash')}><option value="bank">公司银行账户</option><option value="cash">库存现金</option></select></label><label>账户名称<input name="accountName" defaultValue="公司基本户" required /></label>{accountType === 'bank' && <><label>开户银行<input name="bankName" placeholder="例如：招商银行常州分行" required /></label><label>银行账号后四位<input name="last4" inputMode="numeric" minLength={4} maxLength={4} pattern="\d{4}" placeholder="1234" required /></label></>}<label>启用前账户余额（元）<input name="openingBalance" inputMode="decimal" defaultValue="0.00" pattern="(0|[1-9]\d*)(\.\d{1,2})?" required /><small>必须与启用前一日的银行余额或现金盘点一致，不允许负数。</small></label><label>期初资金来源<select value={openingBalanceSource}onChange={event=>setOpeningBalanceSource(event.target.value as typeof openingBalanceSource)}><option value="none">无期初余额（余额为 0）</option><option value="paid_in_capital">股东投入资本</option><option value="shareholder_advance">股东借款或垫资</option></select><small>非零余额必须选择真实来源；历史经营积累等复杂期初余额需要人工建账。</small></label><label>首个会计月份<input name="periodMonth" type="month" defaultValue="2026-10" required /></label><div className="notice">系统将自动把上月最后一天作为期初余额日期，并生成平衡的期初分录。保存后当前试点不支持自行修改，请谨慎核对。</div><button className="primary button" disabled={state.kind === 'submitting'}>{state.kind === 'submitting' ? '正在保存…' : '保存账户并建立首期'}</button>{state.kind === 'error' && <p className="form-error" role="alert">{state.message}</p>}</form>;
}
