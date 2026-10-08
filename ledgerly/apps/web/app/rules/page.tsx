import Link from 'next/link';
import { FixtureWorkbench } from './fixture-workbench';

export default function RulesPage() {
  return <main className="events-shell">
    <header className="topbar"><div className="brand"><span>账</span>账税通</div><nav className="top-actions"><Link className="setup-action" href="/reports">财务报表</Link><Link className="back" href="/dashboard">返回工作台</Link></nav></header>
    <section className="events-heading rule-heading"><div><p className="eyebrow">规则治理与专业签审</p><h1>黄金样本工作台</h1><p>财税专业人员在这里录入脱敏期望、固化签审证据，并用同一组样本对比新旧规则。</p></div></section>
    <FixtureWorkbench />
  </main>;
}
