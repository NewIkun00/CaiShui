'use client';

import { apiFetch } from '@/app/lib/api-fetch';
import {
  tenantInvitationInputSchema,
  tenantInvitationResponseSchema,
  tenantMemberListResponseSchema,
  type TenantMemberResponse,
} from '@ledgerly/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

const api = () => process.env.NEXT_PUBLIC_API_URL ?? '/api';
const developmentUserId = '10000000-0000-4000-8000-000000000001';
const roleNames = { tenant_owner: '企业所有者', tenant_admin: '管理员', bookkeeper: '记账人员', member: '只读成员' } as const;

interface WorkspaceContext { readonly tenantId: string; readonly companyId: string }

function workspace(): WorkspaceContext | null {
  try {
    const value = JSON.parse(window.localStorage.getItem('ledgerly.context') ?? 'null') as Partial<WorkspaceContext> | null;
    return value?.tenantId && value.companyId ? { tenantId: value.tenantId, companyId: value.companyId } : null;
  } catch { return null; }
}

export function MemberManager() {
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [members, setMembers] = useState<readonly TenantMemberResponse[]>([]);
  const [message, setMessage] = useState('正在读取成员与权限…');
  const [pending, setPending] = useState(false);

  const load = useCallback(async (current: WorkspaceContext) => {
    const response = await apiFetch(`${api()}/v1/tenants/${current.tenantId}/members`, {
      headers: { 'x-user-id': developmentUserId, 'x-tenant-id': current.tenantId },
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(response.status === 403 ? '只有企业所有者或管理员可以管理成员。' : '成员列表读取失败。');
    const result = tenantMemberListResponseSchema.parse(payload);
    setMembers(result.items);
    setMessage(result.items.length ? '' : '当前还没有活动成员。');
  }, []);

  useEffect(() => {
    const current = workspace();
    setContext(current);
    if (!current) { setMessage('请先完成企业建档，再管理团队成员。'); return; }
    void load(current).catch((error: unknown) => setMessage(error instanceof Error ? error.message : '成员列表读取失败。'));
  }, [load]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context) return;
    const form = new FormData(event.currentTarget);
    const candidate = tenantInvitationInputSchema.safeParse({
      identifier: form.get('identifier'), roles: [form.get('role')], companyIds: [context.companyId], expiresInHours: 48,
    });
    if (!candidate.success) { setMessage('请填写有效邮箱或手机号并选择角色。'); return; }
    setPending(true);
    try {
      const response = await apiFetch(`${api()}/v1/tenants/${context.tenantId}/invitations`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': developmentUserId, 'x-tenant-id': context.tenantId },
        body: JSON.stringify(candidate.data),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('邀请创建失败，请检查管理员权限和成员范围。');
      const result = tenantInvitationResponseSchema.parse(payload);
      const developmentLink = result.developmentToken ? `${window.location.origin}/invite?token=${encodeURIComponent(result.developmentToken)}` : null;
      setMessage(developmentLink ? `开发环境邀请链接：${developmentLink}` : `邀请已创建，将发送至 ${result.identifierHint}。`);
      event.currentTarget.reset();
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : '邀请创建失败。'); }
    finally { setPending(false); }
  }

  async function deactivate(member: TenantMemberResponse) {
    if (!context || !window.confirm(`确认停用成员“${member.displayName}”吗？`)) return;
    setPending(true);
    try {
      const response = await apiFetch(`${api()}/v1/tenants/${context.tenantId}/members/${member.userId}/deactivate`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': developmentUserId, 'x-tenant-id': context.tenantId },
        body: JSON.stringify({ expectedVersion: member.version, reason: '管理员通过成员管理页面停用账号' }),
      });
      if (!response.ok) throw new Error('停用失败；不能停用自己或最后一位企业所有者。');
      await load(context);
      setMessage('成员已停用，原有会话将不再获得企业访问权限。');
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : '停用失败。'); }
    finally { setPending(false); }
  }

  return <>
    <section className="members-intro"><div><span className="section-kicker">IDENTITY & ACCESS</span><h2>团队成员与权限</h2><p>成员只能通过邀请加入，并被限制在指定企业范围内。用户端角色与平台运营角色互不混用。</p></div></section>
    <div className="members-grid">
      <section className="panel members-list"><header><div><span className="section-kicker">活动成员</span><h3>当前企业团队</h3></div><span className="panel-chip">{members.filter(item => item.status === 'active').length} 人</span></header>
        <div className="member-rows">{members.map(member => <article key={member.userId}><span className="member-avatar">{member.displayName.slice(0, 1)}</span><div><strong>{member.displayName}</strong><p>{member.roles.map(role => roleNames[role]).join('、')} · {member.companyIds.length} 个企业范围</p></div><em data-status={member.status}>{member.status === 'active' ? '正常' : '已停用'}</em>{member.status === 'active' && <button disabled={pending} onClick={() => void deactivate(member)}>停用</button>}</article>)}</div>
      </section>
      <form className="panel invite-card" onSubmit={(event) => void invite(event)}><span className="section-kicker">邀请成员</span><h3>授予最小必要权限</h3><label>邮箱或手机号<input name="identifier" required placeholder="member@example.com" /></label><label>成员角色<select name="role" defaultValue="member"><option value="member">只读成员</option><option value="bookkeeper">记账人员</option><option value="tenant_admin">管理员</option></select></label><p>邀请有效期为 48 小时，仅授权当前企业。企业所有者角色不能通过普通邀请授予。</p><button disabled={pending || !context}>{pending ? '正在处理…' : '创建安全邀请'}</button></form>
    </div>
    {message && <div className="members-message" role="status">{message}</div>}
  </>;
}
