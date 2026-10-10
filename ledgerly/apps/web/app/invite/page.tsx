import { Suspense } from 'react';
import { InvitationAcceptance } from './invitation-acceptance';

export default function InvitationPage() {
  return <main className="auth-page"><Suspense fallback={<section className="auth-card"><h1>正在读取邀请…</h1></section>}><InvitationAcceptance /></Suspense></main>;
}
