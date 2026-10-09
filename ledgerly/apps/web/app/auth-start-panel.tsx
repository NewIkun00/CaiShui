'use client';

import { apiFetch } from '@/app/lib/api-fetch';
import { authLoginResponseSchema } from '@ledgerly/contracts';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

const api = () => process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface AuthStartPanelProps {
  readonly mode: 'login' | 'register';
}

function safeReturnTo(value: string | null, fallback: string): string {
  return value && /^\/(?!\/)/.test(value) && value.length <= 500 ? value : fallback;
}

export function AuthStartPanel({ mode }: AuthStartPanelProps) {
  const query = useSearchParams();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const registering = mode === 'register';

  async function start() {
    setPending(true);
    setMessage(null);
    try {
      const returnTo = safeReturnTo(query.get('returnTo'), registering ? '/onboarding' : '/dashboard');
      const response = await apiFetch(`${api()}/v1/auth/${mode}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnTo }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('身份服务当前不可用，请稍后重试。');
      const result = authLoginResponseSchema.parse(payload);
      window.location.assign(result.authorizationUrl);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '无法连接身份服务。');
      setPending(false);
    }
  }

  return <section className="auth-card">
    <div className="auth-mark">账</div>
    <p className="eyebrow">LEDGERLY IDENTITY</p>
    <h1>{registering ? '创建账税通账号' : '安全进入财务工作台'}</h1>
    <p>{registering
      ? '先通过企业身份服务创建并验证个人账号，再建立你的第一个企业档案。后续成员通过企业邀请加入。'
      : '使用企业身份服务完成登录。账税通不会接触或保存你的密码、短信验证码、OTP 种子或 WebAuthn 私钥。'}</p>
    <ul>{registering
      ? <><li>个人身份与企业档案分离</li><li>首位用户建立企业并成为所有者</li><li>其他成员必须通过受控邀请加入</li></>
      : <><li>Authorization Code + PKCE</li><li>HttpOnly 会话 Cookie</li><li>租户与公司权限隔离</li></>}</ul>
    <button type="button" onClick={() => void start()} disabled={pending}>
      {pending ? '正在连接身份服务…' : registering ? '创建并验证账号' : '使用企业身份登录'}
    </button>
    {message && <div className="auth-message" role="alert">{message}</div>}
    <p className="auth-switch">{registering ? '已经有账号？' : '第一次使用账税通？'}{' '}
      <Link href={registering ? '/login' : '/register'}>{registering ? '返回登录' : '创建账号'}</Link>
    </p>
    <small>密码和多因素认证由身份 Provider 安全处理，不进入账税通业务数据库。</small>
  </section>;
}
