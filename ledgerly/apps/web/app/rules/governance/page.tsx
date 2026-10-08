import Link from 'next/link';
import { GovernanceConsole } from './governance-console';
import './governance.css';

export default function RuleGovernancePage() {
  return <main className="events-shell"><header className="topbar"><div className="brand"><span>账</span>账税通</div><nav className="top-actions"><Link className="setup-action" href="/rules">黄金样本</Link><Link className="back" href="/dashboard">返回工作台</Link></nav></header><section className="events-heading governance-heading"><div><p className="eyebrow">可追溯规则治理</p><h1>从官方政策到签审版本</h1><p>先固化官方来源，再创建规则草稿；编辑人、工程复核人和财税复核人必须彼此独立。</p></div></section><GovernanceConsole /></main>;
}
