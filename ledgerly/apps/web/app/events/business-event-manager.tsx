'use client';

import { apiFetch } from '@/app/lib/api-fetch';

import {
  businessEventInputSchema,
  businessEventListResponseSchema,
  businessEventResponseSchema,
  counterpartyListResponseSchema,
  type BusinessEventResponse,
  type CounterpartyResponse,
} from '@ledgerly/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

interface WorkspaceContext { tenantId: string; companyId: string }
const eventLabels = {
  service_completed: '完成服务', invoice_issued: '开具发票', money_received: '收到款项',
  expense_incurred: '发生费用', money_paid: '支付款项', capital_contribution: '股东出资',
  shareholder_advance: '股东垫付款',
} as const;
type EventType = keyof typeof eventLabels;

function context(): WorkspaceContext | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem('ledgerly.context') ?? 'null');
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Partial<WorkspaceContext>;
    return typeof value.tenantId === 'string' && typeof value.companyId === 'string' ? { tenantId: value.tenantId, companyId: value.companyId } : null;
  } catch { return null; }
}

function text(form: FormData, name: string): string {
  const value = form.get(name); return typeof value === 'string' ? value : '';
}

export function BusinessEventManager() {
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [parties, setParties] = useState<CounterpartyResponse[]>([]);
  const [events, setEvents] = useState<BusinessEventResponse[]>([]);
  const [eventType, setEventType] = useState<EventType>('service_completed');
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const current = context(); setWorkspace(current);
    if (!current) { setReady(true); return; }
    const headers = { 'x-user-id': '10000000-0000-4000-8000-000000000001', 'x-tenant-id': current.tenantId };
    void Promise.all([
      apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/v1/companies/${current.companyId}/counterparties`, { headers }).then((response) => response.json()),
      apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/v1/companies/${current.companyId}/business-events`, { headers }).then((response) => response.json()),
    ]).then(([partyPayload, eventPayload]: unknown[]) => {
      const parsedParties = counterpartyListResponseSchema.safeParse(partyPayload);
      const parsedEvents = businessEventListResponseSchema.safeParse(eventPayload);
      if (parsedParties.success) setParties(parsedParties.data.items);
      if (parsedEvents.success) setEvents(parsedEvents.data.items);
    }).catch(() => setMessage('读取业务数据失败。')).finally(() => setReady(true));
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!workspace) return;
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const parsed = businessEventInputSchema.safeParse({
      type: eventType, occurredOn: text(form, 'occurredOn'), amount: text(form, 'amount'),
      counterpartyId: text(form, 'counterpartyId'), description: text(form, 'description'),
    });
    if (!parsed.success) { setMessage('请检查日期、金额、往来单位和事项说明。'); return; }
    setMessage('正在保存草稿…');
    try {
      const response = await request(workspace, '', { method: 'POST', body: JSON.stringify(parsed.data) });
      const payload: unknown = await response.json(); if (!response.ok) throw new Error('保存业务事件失败。');
      const saved = businessEventResponseSchema.parse(payload); setEvents((current) => [saved, ...current]);
      formElement.reset(); setEventType('service_completed'); setMessage('草稿已保存，请核对后确认。');
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : '保存失败。'); }
  }

  async function confirm(eventId: string) {
    if (!workspace) return; setMessage('正在确认…');
    try {
      const response = await request(workspace, `/${eventId}/confirm`, { method: 'POST', body: '{}' });
      const payload: unknown = await response.json(); if (!response.ok) throw new Error('确认失败，请刷新后重试。');
      const saved = businessEventResponseSchema.parse(payload);
      setEvents((current) => current.map((item) => item.id === saved.id ? saved : item)); setMessage('业务事件已确认。');
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : '确认失败。'); }
  }

  function request(current: WorkspaceContext, suffix: string, init: RequestInit) {
    return apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/v1/companies/${current.companyId}/business-events${suffix}`, {
      ...init, headers: { 'content-type': 'application/json', 'x-user-id': '10000000-0000-4000-8000-000000000001', 'x-tenant-id': current.tenantId },
    });
  }

  if (!ready) return <div className="events-content"><div className="onboarding-card">正在读取业务事件…</div></div>;
  if (!workspace) return <div className="events-content"><div className="onboarding-card"><p>请先完成企业建档。</p><Link className="primary" href="/onboarding">返回建档</Link></div></div>;
  const availableParties = eventType === 'capital_contribution' || eventType === 'shareholder_advance'
    ? parties.filter((party) => party.type === 'shareholder') : parties;
  return <section className="events-content"><form className="onboarding-card event-form" onSubmit={(event) => void create(event)}><h2>新增业务事件</h2><label>发生了什么<select name="type" value={eventType} onChange={(event) => setEventType(event.target.value as EventType)}>{Object.entries(eventLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label>发生日期<input type="date" name="occurredOn" defaultValue="2026-10-07" required /></label><label>金额（元）<input name="amount" inputMode="decimal" placeholder="0.00" required /></label><label>往来单位<select name="counterpartyId" required defaultValue=""><option value="" disabled>请选择</option>{availableParties.map((party)=><option value={party.id} key={party.id}>{party.name} · {party.type==='shareholder'?'股东':'往来方'}</option>)}</select></label><label>事项说明<textarea name="description" rows={3} maxLength={500} placeholder="说明服务、费用或资金变化的真实原因" required /></label><button className="primary button">保存草稿</button>{message&&<p className={message.includes('已')?'form-success':'form-error'} role="status">{message}</p>}</form><div className="event-list"><div className="list-title"><div><p className="eyebrow">共 {events.length} 条</p><h2>业务事件</h2></div><span>草稿需确认后才能进入凭证生成</span></div>{events.length===0?<div className="empty-state">还没有业务事件。</div>:events.map((item)=><article key={item.id}><div className="event-date"><b>{item.occurredOn.slice(8)}</b><span>{item.occurredOn.slice(0,7)}</span></div><div className="event-main"><span>{eventLabels[item.type]}</span><strong>{item.description}</strong><small>¥{item.amount} · 版本 {item.version}</small></div><div className={`event-status ${item.status}`}>{item.status==='draft'?<button type="button" onClick={() => void confirm(item.id)}>确认</button>:'已确认'}</div></article>)}</div></section>;
}
