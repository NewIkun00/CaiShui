import Link from 'next/link';
import { CalculationReadiness } from './calculation-readiness';
import '../rules/rules-extra.css';

export default function CalculationsPage(){return <main className="events-shell"><header className="topbar"><div className="brand"><span>账</span>账税通</div><nav className="top-actions"><Link className="setup-action" href="/rules/governance">政策规则</Link><Link className="setup-action" href="/rules">黄金样本</Link><Link className="back" href="/dashboard">返回工作台</Link></nav></header><section className="events-heading"><div><p className="eyebrow">确定性税务计算</p><h1>税务试算准备检查</h1><p>只冻结事实并检查画像、规则和实现是否就绪；任何前置条件缺失都返回阻断，不生成默认税额。</p></div></section><CalculationReadiness/></main>}
