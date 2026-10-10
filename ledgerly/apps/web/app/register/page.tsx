import { AuthStartPanel } from '../auth-start-panel';
import { Suspense } from 'react';

export default function RegisterPage() {
  return <main className="auth-page"><Suspense fallback={<section className="auth-card"><h1>正在准备账号注册…</h1></section>}><AuthStartPanel mode="register" /></Suspense></main>;
}
