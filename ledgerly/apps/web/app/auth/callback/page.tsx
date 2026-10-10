import { Suspense } from 'react';
import { CallbackPanel } from './callback-panel';

export default function AuthCallbackPage() {
  return <main className="auth-page"><Suspense fallback={<section className="auth-card"><h1>正在准备安全登录…</h1></section>}><CallbackPanel /></Suspense></main>;
}
