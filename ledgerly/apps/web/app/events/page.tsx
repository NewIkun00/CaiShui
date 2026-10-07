import Link from 'next/link';
import { BusinessEventManager } from './business-event-manager';

export default function EventsPage() {
  return <main className="events-shell"><header className="topbar"><div className="brand"><span>账</span>账税通</div><nav className="top-actions"><Link className="setup-action" href="/reconciliation">往来核销</Link><Link className="setup-action" href="/accounting">记账草稿</Link><Link className="setup-action" href="/documents">单据档案</Link><Link className="setup-action" href="/invoices">发票管理</Link><Link className="setup-action" href="/imports/bank">导入银行流水</Link><Link className="back" href="/dashboard">返回工作台</Link></nav></header><section className="events-heading"><div><p className="eyebrow">业务事实层</p><h1>记录真实发生的事</h1><p>先保存草稿，核对日期、金额和往来方后再确认。已确认事件不允许直接覆盖。</p></div></section><BusinessEventManager /></main>;
}
