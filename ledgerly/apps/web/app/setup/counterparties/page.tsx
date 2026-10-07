import Link from 'next/link';
import { CounterpartyManager } from './counterparty-manager';

export default function CounterpartiesPage() {
  return <main className="form-shell profile-shell"><Link className="back" href="/dashboard">← 返回初始化工作台</Link><div className="form-heading"><p className="eyebrow">账套初始化 · 第 2 项</p><h1>添加常用往来单位</h1><p>先添加近期会发生收付款的客户、供应商、股东或员工。股东会自动标记为关联方，后续每笔往来需要选择业务性质。</p></div><CounterpartyManager /></main>;
}
