import Link from 'next/link';
import { ProfileForm } from './profile-form';

export default function ProfilePage() {
  return (
    <main className="form-shell profile-shell">
      <Link className="back" href="/onboarding">← 返回企业身份</Link>
      <div className="form-heading">
        <p className="eyebrow">企业建档 · 第 2 步</p>
        <h1>确认平台是否适合你</h1>
        <p>请按当前税务登记和实际经营情况回答。系统只根据明确规则分流，不使用 AI 猜测税务身份。</p>
      </div>
      <ProfileForm />
    </main>
  );
}
