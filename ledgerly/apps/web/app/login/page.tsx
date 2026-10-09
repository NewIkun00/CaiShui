import { LoginPanel } from './login-panel';
import { Suspense } from 'react';

export default function LoginPage() {
  return <main className="auth-page"><Suspense fallback={<section className="auth-card"><h1>正在准备安全登录…</h1></section>}><LoginPanel /></Suspense></main>;
}
