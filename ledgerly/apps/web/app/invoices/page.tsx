import Link from 'next/link';
import { InvoiceManager } from './invoice-manager';

export default function InvoicesPage() {
  return <main className="events-shell"><header className="topbar"><div className="brand"><span>账</span>账税通</div><nav className="top-actions"><Link className="setup-action" href="/imports/bank">银行流水</Link><Link className="back" href="/events">返回业务记录</Link></nav></header><section className="events-heading"><div><p className="eyebrow">发票事实层</p><h1>先识别，再由人确认</h1><p>当前版本支持人工录入和确定性模拟识别。模拟结果只填充草稿，不会自动确认或直接生成税务数据。</p></div></section><InvoiceManager /></main>;
}
