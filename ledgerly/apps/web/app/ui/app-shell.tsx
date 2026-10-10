'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../lib/api-fetch';
import { authCurrentResponseSchema } from '@ledgerly/contracts';

const navigation = [
  { label: '总览', items: [
    { href: '/', label: '工作概览', mark: '⌂' },
    { href: '/dashboard', label: '账套初始化', mark: '◇' },
  ] },
  { label: '业务与单据', items: [
    { href: '/events', label: '业务记录', mark: '◎' },
    { href: '/imports/bank', label: '银行流水', mark: '↕' },
    { href: '/invoices', label: '发票管理', mark: '▤' },
    { href: '/documents', label: '单据档案', mark: '□' },
  ] },
  { label: '账务管理', items: [
    { href: '/accounting', label: '凭证与账簿', mark: '≡' },
    { href: '/reports', label: '财务报表', mark: '▥' },
    { href: '/reconciliation', label: '勾稽检查', mark: '✓' },
  ] },
  { label: '运营复核', items: [
    { href: '/reviews', label: '人工复核中心', mark: '◉' },
  ] },
  { label: '系统设置', items: [
    { href: '/settings/members', label: '成员与权限', mark: '♙' },
  ] },
  { label: '平台管理', operationsOnly: true, items: [
    { href: '/operations/roles', label: '运营角色', mark: '♜' },
  ] },
  { label: '税务治理', items: [
    { href: '/filings', label: '申报待办', mark: '◷' },
    { href: '/calculations', label: '试算准备', mark: '∑' },
    { href: '/rules', label: '规则样本', mark: '⌘' },
    { href: '/rules/governance', label: '政策治理', mark: '◆' },
  ] },
] as const;

const titles: Readonly<Record<string, readonly [string, string]>> = {
  '/': ['工作概览', '查看账套状态与本期待办'],
  '/dashboard': ['账套初始化', '完成企业基础资料和首期设置'],
  '/events': ['业务记录', '管理企业真实发生的业务事实'],
  '/imports/bank': ['银行流水', '导入、核验并确认银行对账单'],
  '/invoices': ['发票管理', '录入并确认进销项发票'],
  '/documents': ['单据档案', '管理原始凭证和不可变版本'],
  '/accounting': ['凭证与账簿', '生成凭证、查询账簿并管理期间'],
  '/reports': ['财务报表', '查看利润表和资产负债表'],
  '/reconciliation': ['勾稽检查', '定位申报前的数据差异'],
  '/reviews': ['人工复核中心', '处理风险案件、补件和专业复核证据'],
  '/filings': ['申报准备', '管理版本化征期、待办、SOP 与不可变申报包'],
  '/calculations': ['试算准备', '检查税务计算所需事实和规则'],
  '/rules': ['规则样本', '管理黄金样本和执行证据'],
  '/rules/governance': ['政策治理', '管理政策来源和规则版本'],
  '/onboarding': ['建立企业档案', '录入企业和税务基础信息'],
  '/onboarding/profile': ['适用性筛查', '确认企业是否进入 V1 服务范围'],
  '/setup/financial-account': ['资金与首期', '设置资金账户和会计期间'],
  '/setup/counterparties': ['往来单位', '建立客户、供应商和关联方档案'],
  '/login': ['安全登录', '通过企业身份服务进入账税通'],
  '/register': ['创建账号', '验证个人身份并建立首个企业档案'],
  '/settings/members': ['成员与权限', '邀请、查看和停用企业成员'],
  '/invite': ['加入企业', '验证并接受企业成员邀请'],
  '/operations/roles': ['运营角色', '受控分配和撤销平台权限'],
  '/auth/callback': ['正在登录', '正在验证身份并建立安全会话'],
};

function active(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/rules') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const [canManageOperations, setCanManageOperations] = useState(false);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_MODE !== 'oidc' || pathname === '/login' || pathname === '/register' || pathname.startsWith('/auth/')) return;
    void apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/v1/auth/me`).then(async (response) => {
      if (!response.ok) return;
      const current = authCurrentResponseSchema.parse(await response.json() as unknown);
      setCanManageOperations(current.operationsRoles.includes('platform_admin'));
    }).catch(() => undefined);
  }, [pathname]);
  if (pathname === '/login' || pathname === '/register' || pathname === '/invite' || pathname.startsWith('/auth/')) return children;
  const [title, description] = titles[pathname] ?? ['账税通', '一人公司财务工作台'];

  return <div className="app-frame">
    <aside className="app-sidebar">
      <Link className="app-logo" href="/" aria-label="账税通工作概览">
        <span>账</span><strong>账税通</strong><small>LEDGERLY</small>
      </Link>
      <nav className="app-navigation" aria-label="主要功能">
        {navigation.filter(group => !('operationsOnly' in group) || canManageOperations).map(group=><section key={group.label}>
          <p>{group.label}</p>
          {group.items.map(item=><Link key={item.href} href={item.href} className={active(pathname,item.href)?'active':''}>
            <i aria-hidden="true">{item.mark}</i><span>{item.label}</span>
          </Link>)}
        </section>)}
      </nav>
      <div className="sidebar-foot">
        <span className="environment-dot" />
        <div><strong>V1 受控试点</strong><small>开发环境 · 数据可追溯</small></div>
      </div>
    </aside>
    <div className="app-stage">
      <header className="app-header">
        <div><p>{description}</p><h1>{title}</h1></div>
        <div className="header-tools">
          <span className="global-status"><i />受控试点环境</span>
          <button type="button" aria-label="帮助">?</button>
          <Link className="user-avatar" href="/login" title="身份与会话">身</Link>
        </div>
      </header>
      <div className="app-content">{children}</div>
    </div>
  </div>;
}
