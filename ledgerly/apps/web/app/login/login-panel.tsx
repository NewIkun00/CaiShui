'use client';

import { apiFetch } from '@/app/lib/api-fetch';

import { authLoginResponseSchema } from '@ledgerly/contracts';
import { useState } from 'react';

const api = () => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function LoginPanel() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function login() {
    setPending(true);
    setMessage(null);
    try {
      const response = await apiFetch(`${api()}/v1/auth/login`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnTo: '/dashboard' }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error('身份服务当前不可用，请稍后重试。');
      const result = authLoginResponseSchema.parse(payload);
      window.location.assign(result.authorizationUrl);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '无法开始登录。');
      setPending(false);
    }
  }

  return <section className="auth-card">
    <div className="auth-mark">账</div>
    <p className="eyebrow">LEDGERLY IDENTITY</p>
    <h1>安全进入财务工作台</h1>
    <p>使用企业身份服务完成登录。账税通不会接触或保存你的密码、短信验证码、OTP 种子或 WebAuthn 私钥。</p>
    <ul><li>Authorization Code + PKCE</li><li>HttpOnly 会话 Cookie</li><li>租户与公司权限隔离</li></ul>
    <button type="button" onClick={() => void login()} disabled={pending}>{pending ? '正在连接身份服务…' : '使用企业身份登录'}</button>
    {message && <div className="auth-message" role="alert">{message}</div>}
    <small>本地开发请求头模式不会模拟正式登录；请配置 OIDC 后验证本页面。</small>
  </section>;
}
