'use client';

import { apiFetch } from '@/app/lib/api-fetch';

import { counterpartyInputSchema, counterpartyListResponseSchema, counterpartyResponseSchema, type CounterpartyResponse } from '@ledgerly/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

interface WorkspaceContext { tenantId: string; companyId: string }
const typeLabels = { customer: '客户', supplier: '供应商', shareholder: '股东', employee: '员工', other: '其他' } as const;

function readContext(): WorkspaceContext | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem('ledgerly.context') ?? 'null');
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Partial<WorkspaceContext>;
    return typeof value.tenantId === 'string' && typeof value.companyId === 'string' ? { tenantId: value.tenantId, companyId: value.companyId } : null;
  } catch { return null; }
}

function textField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function CounterpartyManager() {
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [items, setItems] = useState<CounterpartyResponse[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const current = readContext(); setContext(current);
    if (!current) { setReady(true); return; }
    void apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/v1/companies/${current.companyId}/counterparties`, {
      headers: { 'x-user-id': '10000000-0000-4000-8000-000000000001', 'x-tenant-id': current.tenantId },
    }).then((response) => response.json()).then((payload: unknown) => {
      const parsed = counterpartyListResponseSchema.safeParse(payload);
      if (parsed.success) setItems(parsed.data.items);
    }).catch(() => setMessage('暂时无法读取往来单位。')).finally(() => setReady(true));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!context) return;
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const candidate = { name: textField(form, 'name'), type: textField(form, 'type'), taxId: textField(form, 'taxId'), contactName: textField(form, 'contactName'), phone: textField(form, 'phone'), notes: textField(form, 'notes') };
    const parsed = counterpartyInputSchema.safeParse(candidate);
    if (!parsed.success) { setMessage('请检查名称、统一社会信用代码和联系电话。'); return; }
    setMessage('正在保存…');
    try {
      const response = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/v1/companies/${context.companyId}/counterparties`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': '10000000-0000-4000-8000-000000000001', 'x-tenant-id': context.tenantId }, body: JSON.stringify(parsed.data),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? '同类型、同名称的往来单位已经存在，或账套尚未初始化。' : '保存失败。');
      const saved = counterpartyResponseSchema.parse(payload);
      setItems((current) => [...current, saved]);
      window.localStorage.setItem('ledgerly.counterpartiesReady', 'true');
      formElement.reset(); setMessage('保存成功。');
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : '保存失败。'); }
  }

  if (!ready) return <div className="onboarding-card">正在读取往来单位…</div>;
  if (!context) return <div className="onboarding-card"><p>没有找到企业档案。</p><Link className="primary" href="/onboarding">返回建档</Link></div>;
  return <div className="counterparty-layout"><form className="onboarding-card" onSubmit={(event) => void submit(event)}><label>类型<select name="type" defaultValue="customer"><option value="customer">客户</option><option value="supplier">供应商</option><option value="shareholder">股东</option><option value="employee">员工</option><option value="other">其他</option></select></label><label>名称<input name="name" placeholder="企业全称或个人姓名" required /></label><label>统一社会信用代码（企业选填）<input name="taxId" minLength={18} maxLength={18} placeholder="18 位字母或数字" /></label><label>联系人<input name="contactName" /></label><label>联系电话<input name="phone" inputMode="tel" /></label><label>备注<textarea name="notes" rows={3} maxLength={500} /></label><button className="primary button">保存往来单位</button>{message && <p className={message.includes('成功') ? 'form-success' : 'form-error'} role="status">{message}</p>}</form><section className="counterparty-list"><div><p className="eyebrow">已添加 {items.length} 个</p><h2>往来单位</h2></div>{items.length===0?<p className="empty">还没有往来单位，请从左侧添加。</p>:items.map((item)=><article key={item.id}><span>{typeLabels[item.type]}</span><div><strong>{item.name}</strong><small>{item.taxId ?? item.contactName ?? '未填写附加信息'}</small></div>{item.isRelatedParty&&<b>关联方</b>}</article>)}{items.length>0&&<Link className="primary finish-link" href="/dashboard">完成并返回工作台</Link>}</section></div>;
}
