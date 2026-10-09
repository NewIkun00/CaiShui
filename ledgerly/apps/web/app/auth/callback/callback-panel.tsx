'use client';

import { apiFetch } from '@/app/lib/api-fetch';

import { authCurrentResponseSchema } from '@ledgerly/contracts';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const api = () => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function CallbackPanel() {
  const query = useSearchParams();
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState('正在校验登录响应和一次性安全状态…');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = query.get('code');
    const state = query.get('state');
    const providerError = query.get('error');
    if (providerError || !code || !state) {
      setMessage(providerError ? '身份服务拒绝了本次登录，请返回重试。' : '登录回调缺少必要参数，请返回重试。');
      return;
    }
    void (async () => {
      try {
        const response = await apiFetch(`${api()}/v1/auth/callback`, {
          method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error('登录事务已过期、已使用或校验失败。');
        const result = authCurrentResponseSchema.parse(payload);
        setMessage(`欢迎回来，${result.user.displayName}。正在进入工作台…`);
        router.replace(result.returnTo ?? '/dashboard');
      } catch (error: unknown) {
        setMessage(error instanceof Error ? error.message : '登录失败，请返回重试。');
      }
    })();
  }, [query, router]);

  return <section className="auth-card auth-callback">
    <div className="auth-spinner" aria-hidden="true" />
    <p className="eyebrow">IDENTITY CALLBACK</p>
    <h1>建立安全会话</h1>
    <p role="status">{message}</p>
    <a href="/login">返回登录页</a>
  </section>;
}
