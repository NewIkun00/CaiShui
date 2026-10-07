import Link from 'next/link';
import { FinancialAccountForm } from './financial-account-form';

export default function FinancialAccountPage() {
  return <main className="form-shell"><Link className="back" href="/dashboard">← 返回初始化工作台</Link><div className="form-heading"><p className="eyebrow">账套初始化 · 第 1 项</p><h1>设置主要资金账户</h1><p>先添加一个主要账户和启用前余额。当前试点只保存银行账号后四位，完整流水将在导入阶段单独处理。</p></div><FinancialAccountForm /></main>;
}
