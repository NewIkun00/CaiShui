'use client';

import { apiFetch } from '@/app/lib/api-fetch';
import { tenantMemberResponseSchema } from '@ledgerly/contracts';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function InvitationAcceptance() {
  const token = useSearchParams().get('token');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(token ? '登录身份确认后，可加入受邀企业。' : '邀请链接缺少安全令牌。');

  async function accept() {
    if (!token) return;
    setPending(true);
    try {
      const response = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/v1/tenant-invitations/accept`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': '10000000-0000-4000-8000-000000000001' },
        body: JSON.stringify({ token }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('邀请无效、已过期或已经被使用。');
      const member = tenantMemberResponseSchema.parse(payload);
      const companyId = member.companyIds[0];
      if (companyId) window.localStorage.setItem('ledgerly.context', JSON.stringify({ tenantId: member.tenantId, companyId }));
      setMessage('邀请已接受，你现在可以进入企业工作台。');
    } catch (error: unknown) { setMessage(error instanceof Error ? error.message : '无法接受邀请。'); }
    finally { setPending(false); }
  }

  return <section className="auth-card"><div className="auth-mark">邀</div><p className="eyebrow">TENANT INVITATION</p><h1>加入企业团队</h1><p role="status">{message}</p><button type="button" disabled={!token || pending} onClick={() => void accept()}>{pending ? '正在验证邀请…' : '接受邀请'}</button><Link href="/dashboard">返回工作台</Link></section>;
}
