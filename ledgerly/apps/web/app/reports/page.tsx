import Link from 'next/link';
import { ReportsView } from './reports-view';

export default function ReportsPage() {
  return <main className="events-shell">
    <header className="topbar">
      <div className="brand"><span>账</span>账税通</div>
      <nav className="top-actions">
        <Link className="setup-action" href="/accounting">凭证与账簿</Link>
        <Link className="back" href="/dashboard">返回工作台</Link>
      </nav>
    </header>
    <section className="events-heading report-heading">
      <div><p className="eyebrow">确定性管理报表</p><h1>利润表与资产负债表</h1><p>只读取期初复式分录和已确认凭证；草稿不会进入报表，任一数字都可回到账簿核对。</p></div>
    </section>
    <ReportsView />
  </main>;
}
