import Link from 'next/link';
import { DocumentManager } from './document-manager';

export default function DocumentsPage() {
  return <main className="events-shell"><header className="topbar"><div className="brand"><span>账</span>账税通</div><nav className="top-actions"><Link className="setup-action" href="/invoices">发票管理</Link><Link className="back" href="/events">返回业务记录</Link></nav></header><section className="events-heading"><div><p className="eyebrow">原始证据层</p><h1>每个版本都有出处</h1><p>文件先经过类型、大小、哈希和安全扫描，再进入私有档案。相同文件不会重复保存，历史版本不会被覆盖。</p></div></section><DocumentManager /></main>;
}
