import Link from 'next/link';
import { AccountingManager } from './accounting-manager';

export default function AccountingPage(){return <main className="events-shell"><header className="topbar"><div className="brand"><span>账</span>账税通</div><nav className="top-actions"><Link className="setup-action" href="/reports">财务报表</Link><Link className="setup-action" href="/documents">单据档案</Link><Link className="back" href="/events">返回业务记录</Link></nav></header><section className="events-heading"><div><p className="eyebrow">确定性账务引擎</p><h1>凭证、账簿与期间管理</h1><p>从已确认事实生成平衡草稿，复核后正式入账；错误凭证通过相反分录冲销，锁账后禁止普通修改。</p></div></section><AccountingManager/></main>}
