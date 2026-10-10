'use client';

import { apiFetch } from '@/app/lib/api-fetch';
import {
  operationsRoleAssignmentInputSchema,
  operationsRoleAssignmentListResponseSchema,
  operationsRoleAssignmentResponseSchema,
  type OperationsRoleAssignmentResponse,
} from '@ledgerly/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

const api = () => process.env.NEXT_PUBLIC_API_URL ?? '/api';
const devUserId = '10000000-0000-4000-8000-000000000001';
const labels = {
  support_readonly: '只读支持', accounting_reviewer: '会计复核', tax_reviewer: '税务复核',
  rule_editor: '规则编辑', rule_approver: '规则审批', security_auditor: '安全审计', platform_admin: '平台管理员',
} as const;

export function OperationsRoleManager() {
  const [items, setItems] = useState<readonly OperationsRoleAssignmentResponse[]>([]);
  const [message, setMessage] = useState('正在读取平台角色…');
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const response = await apiFetch(`${api()}/v1/operations/role-assignments`, { headers: { 'x-user-id': devUserId } });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error('只有平台管理员可以查看和维护运营角色。');
    const result = operationsRoleAssignmentListResponseSchema.parse(payload);
    setItems(result.items);
    setMessage(result.items.length ? '' : '当前没有已登记的平台角色。首次管理员须通过受控部署种子建立。');
  }, []);

  useEffect(() => { void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : '平台角色读取失败。')); }, [load]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = operationsRoleAssignmentInputSchema.safeParse({ userId: form.get('userId'), role: form.get('role') });
    if (!parsed.success) { setMessage('请输入有效用户 UUID 并选择运营角色。'); return; }
    setPending(true);
    try {
      const response = await apiFetch(`${api()}/v1/operations/role-assignments`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': devUserId }, body: JSON.stringify(parsed.data),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('角色分配失败；不能为自己授权，目标必须是活动用户。');
      const assignment = operationsRoleAssignmentResponseSchema.parse(payload);
      await load();
      setMessage(`已为 ${assignment.displayName} 分配“${labels[assignment.role]}”。该角色不会授予任何企业数据访问权。`);
      event.currentTarget.reset();
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : '角色分配失败。'); }
    finally { setPending(false); }
  }

  async function revoke(item: OperationsRoleAssignmentResponse) {
    if (!window.confirm(`确认撤销 ${item.displayName} 的“${labels[item.role]}”角色吗？`)) return;
    setPending(true);
    try {
      const response = await apiFetch(`${api()}/v1/operations/role-assignments/${item.userId}/${item.role}/revoke`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': devUserId },
        body: JSON.stringify({ expectedVersion: item.version, reason: '平台管理员通过角色治理页面撤销权限' }),
      });
      if (!response.ok) throw new Error('撤销失败；不能撤销自己的角色或最后一名平台管理员。');
      await load();
      setMessage('平台角色已撤销，下一次请求将立即失去对应权限。');
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : '角色撤销失败。'); }
    finally { setPending(false); }
  }

  return <>
    <section className="roles-hero"><span className="section-kicker">OPERATIONS SECURITY</span><h2>平台运营角色治理</h2><p>运营权限与企业成员权限严格分离。所有授权和撤销均要求平台管理员、MFA、新鲜会话、职责分离、审计记录和 Outbox 事件。</p></section>
    <div className="roles-grid"><section className="panel roles-list"><header><div><span className="section-kicker">角色登记</span><h3>当前平台权限</h3></div><span className="panel-chip">{items.filter(item => item.status === 'active').length} 项活动授权</span></header><div>{items.map(item => <article key={`${item.userId}:${item.role}`}><div><strong>{item.displayName}</strong><p>{item.userId}</p></div><span>{labels[item.role]}</span><em>{item.status === 'active' ? '有效' : '已撤销'}</em>{item.status === 'active' && <button disabled={pending} onClick={() => void revoke(item)}>撤销</button>}</article>)}</div></section>
      <form className="panel role-form" onSubmit={(event) => void assign(event)}><span className="section-kicker">最小授权</span><h3>分配运营角色</h3><label>目标用户 UUID<input name="userId" required placeholder="00000000-0000-4000-8000-000000000000" /></label><label>运营角色<select name="role" defaultValue="support_readonly">{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><p>不能给自己授权。平台角色不会绕过企业成员关系或公司范围校验。</p><button disabled={pending}>{pending ? '正在处理…' : '经二次认证后分配'}</button></form></div>
    {message && <div className="roles-message" role="status">{message}</div>}
  </>;
}
