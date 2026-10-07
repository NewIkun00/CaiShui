import Link from 'next/link';
import { OnboardingForm } from './form';

export default function OnboardingPage() {
  return (
    <main className="form-shell">
      <Link className="back" href="/">← 返回首页</Link>
      <div className="form-heading">
        <p className="eyebrow">企业建档 · 第 1 步</p>
        <h1>先确认企业身份</h1>
        <p>当前 V1 仅面向江苏省内、使用统一社会信用代码的一人有限责任公司试点。</p>
      </div>
      <OnboardingForm />
    </main>
  );
}
