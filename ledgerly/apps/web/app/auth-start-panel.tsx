'use client';

import { apiFetch } from '@/app/lib/api-fetch';
import { safeAuthReturnTo } from '@/app/lib/auth-start-routing';
import { authLoginResponseSchema } from '@ledgerly/contracts';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

const api = () => process.env.NEXT_PUBLIC_API_URL ?? '/api';

interface AuthStartPanelProps {
  readonly mode: 'login' | 'register';
}

export function AuthStartPanel({ mode }: AuthStartPanelProps) {
  const query = useSearchParams();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const registering = mode === 'register';
  const oidcEnabled = process.env.NEXT_PUBLIC_AUTH_MODE === 'oidc';

  async function start() {
    setPending(true);
    setMessage(null);
    try {
      const returnTo = safeAuthReturnTo(
        query.get('returnTo'),
        registering ? '/onboarding' : '/dashboard',
      );
      if (!oidcEnabled) {
        window.location.assign(returnTo);
        return;
      }
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

  return <div className="auth-layout">
    <aside className="auth-brand-panel">
      <Link className="auth-brand" href="/login"><span>账</span><strong>账税通</strong><small>ACCOUNTS &amp; TAX</small></Link>
      <div className="auth-brand-copy">
        <p>CONTROLLED FINANCE WORKFLOW</p>
        <h2>{registering ? <>从第一笔业务开始，<br />建立可信账簿。</> : <>公司账税，<br />每一步都清楚。</>}</h2>
        <span>把流水、发票与申报任务放进同一个可追溯的工作流，关键判断由你确认。</span>
        <ul><li>系统生成草稿与校验线索，关键判断由你确认</li><li>原始证据、业务事实、凭证与报表互相引用</li><li>高风险事项显式阻断，不生成伪精确的税额</li></ul>
      </div>
      <small className="auth-environment">受控试点环境 · 演示数据不构成财税专业意见</small>
    </aside>
    <section className="auth-card">
    <div className="auth-mark">账</div>
    <p className="eyebrow">{oidcEnabled ? '安全身份验证' : '本地演示模式'}</p>
    <h1>{registering ? (oidcEnabled ? '创建账税通账号' : '开始本地演示') : '进入财务工作台'}</h1>
    <p>{!oidcEnabled
      ? '当前是本地内存演示模式，不会连接外部身份服务。你可以直接建立测试企业档案，API 重启后演示数据会清空。'
      : registering
      ? '先通过企业身份服务创建并验证个人账号，再建立你的第一个企业档案。后续成员通过企业邀请加入。'
      : '使用企业身份服务完成登录。账税通不会接触或保存你的密码、短信验证码、OTP 种子或 WebAuthn 私钥。'}</p>
    <ul>{!oidcEnabled
      ? <><li>固定测试身份，仅限非生产内存模式</li><li>不保存密码、验证码或生产数据</li><li>正式环境仍强制 OIDC 和多因素认证</li></>
      : registering
      ? <><li>个人身份与企业档案分离</li><li>首位用户建立企业并成为所有者</li><li>其他成员必须通过受控邀请加入</li></>
      : <><li>Authorization Code + PKCE</li><li>HttpOnly 会话 Cookie</li><li>租户与公司权限隔离</li></>}</ul>
    <button type="button" onClick={() => void start()} disabled={pending}>
      {pending
        ? (oidcEnabled ? '正在连接身份服务…' : '正在进入演示…')
        : !oidcEnabled
          ? (registering ? '开始建立企业档案' : '进入本地演示')
          : registering ? '创建并验证账号' : '使用企业身份登录'}
    </button>
    {message && <div className="auth-message" role="alert">{message}</div>}
    <p className="auth-switch">{registering ? '已经有账号？' : '第一次使用账税通？'}{' '}
      <Link href={registering ? '/login' : '/register'}>{registering ? '返回登录' : '创建账号'}</Link>
    </p>
    <small>{oidcEnabled
      ? '密码和多因素认证由身份 Provider 安全处理，不进入账税通业务数据库。'
      : '本地演示入口不会在生产或 PostgreSQL 模式启用。'}</small>
    </section>
  </div>;
}
