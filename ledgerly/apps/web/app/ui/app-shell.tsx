'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode, type SVGProps } from 'react';
import { apiFetch } from '../lib/api-fetch';
import { authCurrentResponseSchema } from '@ledgerly/contracts';

const navigation = [
  { label: '总览', items: [
    { href: '/', label: '工作台', icon: 'grid' },
    { href: '/dashboard', label: '账套初始化', icon: 'checklist' },
  ] },
  { label: '业务与单据', items: [
    { href: '/events', label: '业务记录', icon: 'document' },
    { href: '/imports/bank', label: '银行流水', icon: 'swap' },
    { href: '/invoices', label: '发票管理', icon: 'invoice' },
    { href: '/documents', label: '单据档案', icon: 'folder' },
  ] },
  { label: '账务处理', items: [
    { href: '/accounting', label: '凭证与账簿', icon: 'book' },
    { href: '/reports', label: '财务报表', icon: 'chart' },
    { href: '/reconciliation', label: '勾稽检查', icon: 'shield' },
  ] },
  { label: '运营复核', items: [
    { href: '/reviews', label: '人工复核中心', icon: 'review' },
  ] },
  { label: '税务管理', items: [
    { href: '/filings', label: '申报待办', icon: 'calendar' },
    { href: '/calculations', label: '试算准备', icon: 'sliders' },
    { href: '/rules', label: '规则样本', icon: 'flask' },
    { href: '/rules/governance', label: '政策治理', icon: 'scale' },
  ] },
  { label: '系统设置', items: [
    { href: '/settings/members', label: '成员与权限', icon: 'users' },
  ] },
  { label: '平台管理', operationsOnly: true, items: [
    { href: '/operations/roles', label: '运营角色', icon: 'key' },
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

function NavIcon({ name, ...props }: Readonly<{ name: string } & SVGProps<SVGSVGElement>>) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Readonly<Record<string, ReactNode>> = {
    grid: <><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="12" y="3" width="5" height="5" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/><rect x="12" y="12" width="5" height="5" rx="1"/></>,
    checklist: <><path d="m4 6 1.5 1.5L8 4.8M11 6h5M4 13l1.5 1.5L8 11.8M11 13h5"/></>,
    document: <><path d="M5 2.8h7l3 3V17H5z"/><path d="M12 2.8V6h3M8 10h4M8 13h4"/></>,
    swap: <><path d="M4 6h12l-3-3M16 14H4l3 3"/></>,
    invoice: <><rect x="4" y="2.8" width="12" height="14.4" rx="1.5"/><path d="M7 7h6M7 10h6M7 13h3"/></>,
    folder: <path d="M2.8 6.5h14.4v9.3H2.8zM2.8 6.5V4.2h5l1.5 2.3"/>,
    book: <><path d="M4 3.5h5.5A2.5 2.5 0 0 1 12 6v11H6.5A2.5 2.5 0 0 0 4 19.5z"/><path d="M16 3.5h-4A2.5 2.5 0 0 0 9.5 6v11H14a2 2 0 0 1 2 2z"/></>,
    chart: <><path d="M3 17h14M5.5 14V9M10 14V4M14.5 14V7"/></>,
    shield: <path d="M10 2.5 16 5v4.5c0 3.7-2.4 6.3-6 8-3.6-1.7-6-4.3-6-8V5zM7.5 10l1.6 1.6 3.5-3.5"/>,
    review: <><rect x="3" y="4" width="14" height="11" rx="2"/><path d="M6 8h8M6 11h5M7 17h6"/></>,
    calendar: <><rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M6.5 2.5v4M13.5 2.5v4M3 8.5h14"/></>,
    sliders: <><path d="M3 6h14M3 14h14"/><circle cx="8" cy="6" r="2"/><circle cx="13" cy="14" r="2"/></>,
    flask: <><path d="M7 2.8h6M8.5 3v5l-4 7a1.5 1.5 0 0 0 1.3 2.2h8.4a1.5 1.5 0 0 0 1.3-2.2l-4-7V3"/><path d="M7 13h6"/></>,
    scale: <><path d="M10 3v14M5 5h10M4.5 6 2.8 11h3.4zM15.5 6l-1.7 5h3.4zM6 17h8"/></>,
    users: <><circle cx="8" cy="7" r="3"/><path d="M2.8 17c.4-3.2 2.1-5 5.2-5s4.8 1.8 5.2 5M13 5.2a2.7 2.7 0 0 1 0 5.2M14.5 12c1.8.6 2.7 2.2 2.9 4"/></>,
    key: <><circle cx="7" cy="10" r="4"/><path d="M11 10h6M14 10v3M16 10v2"/></>,
  };
  return <svg viewBox="0 0 20 20" aria-hidden="true" {...common} {...props}>{paths[name] ?? paths.grid}</svg>;
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const [canManageOperations, setCanManageOperations] = useState(false);
  const [displayName, setDisplayName] = useState('当前用户');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_MODE !== 'oidc' || pathname === '/login' || pathname === '/register' || pathname.startsWith('/auth/')) return;
    void apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? '/api'}/v1/auth/me`).then(async (response) => {
      if (!response.ok) return;
      const current = authCurrentResponseSchema.parse(await response.json() as unknown);
      setCanManageOperations(current.operationsRoles.includes('platform_admin'));
      setDisplayName(current.user.displayName);
    }).catch(() => undefined);
  }, [pathname]);
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setHelpOpen(false);
      }
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  if (pathname === '/login' || pathname === '/register' || pathname === '/invite' || pathname.startsWith('/auth/')) return children;
  const [title, description] = titles[pathname] ?? ['账税通', '一人公司财务工作台'];
  const visibleGroups = navigation.filter(group => !('operationsOnly' in group) || canManageOperations);
  const searchResults = visibleGroups.flatMap(group => group.items.map(item => ({ ...item, group: group.label })))
    .filter(item => !searchQuery.trim() || `${item.label}${item.group}`.includes(searchQuery.trim()));

  return <div className="app-frame">
    <aside className="app-sidebar">
      <Link className="app-logo" href="/" aria-label="账税通工作概览">
        <span>账</span><strong>账税通</strong><small>ACCOUNTS &amp; TAX</small>
      </Link>
      <div className="workspace-switcher" aria-label="当前企业">
        <span>企</span><strong>当前企业</strong><i aria-hidden="true">⌄</i>
      </div>
      <nav className="app-navigation" aria-label="主要功能">
        {visibleGroups.map(group=><section key={group.label}>
          <p>{group.label}</p>
          {group.items.map(item=><Link key={item.href} href={item.href} className={active(pathname,item.href)?'active':''}>
            <i aria-hidden="true"><NavIcon name={item.icon} /></i><span>{item.label}</span>
          </Link>)}
        </section>)}
      </nav>
      <div className="sidebar-foot">
        <span className="sidebar-avatar">{displayName.slice(0, 1)}</span>
        <div><strong>{displayName}</strong><small>企业成员</small></div>
      </div>
    </aside>
    <div className="app-stage">
      <header className="app-header">
        <div><p>{description}</p><h1>{title}</h1></div>
        <div className="header-tools">
          <label className={`global-search${searchOpen?' open':''}`}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.7" cy="8.7" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m12.7 12.7 4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg><input ref={searchRef} aria-label="全局搜索" placeholder="搜索功能或输入指令…" value={searchQuery} onFocus={()=>{setSearchOpen(true);setHelpOpen(false);}} onChange={event=>{setSearchQuery(event.target.value);setSearchOpen(true);}} />
            <kbd>⌘ K</kbd>
            {searchOpen&&<div className="search-results" role="navigation" aria-label="功能搜索结果">
              <header><span>快速前往</span><small>{searchQuery.trim()?'搜索结果':'常用功能'}</small></header>
              {searchResults.length?<>{searchResults.slice(0,8).map(item=><Link href={item.href} key={item.href} onClick={()=>{setSearchOpen(false);setSearchQuery('');}}><NavIcon name={item.icon}/><span><strong>{item.label}</strong><small>{item.group}</small></span><b>↗</b></Link>)}</>:<p>没有匹配的功能</p>}
              <footer><span>输入功能名称即可筛选</span><kbd>ESC</kbd><span>关闭</span></footer>
            </div>}
          </label>
          <span className="global-status"><i />受控试点环境</span>
          <button className="help-trigger" type="button" aria-label="帮助与快捷键" aria-expanded={helpOpen} onClick={()=>{setHelpOpen(value=>!value);setSearchOpen(false);}}>?</button>
          <Link className="user-avatar" href="/login" title="身份与会话">{displayName.slice(0, 1)}</Link>
        </div>
      </header>
      {searchOpen&&<button className="command-scrim" type="button" aria-label="关闭搜索" onClick={()=>setSearchOpen(false)} />}
      {helpOpen&&<aside className="help-popover" aria-label="帮助与快捷键">
        <header><div><small>HELP CENTER</small><strong>在账税通中工作</strong></div><button type="button" aria-label="关闭帮助" onClick={()=>setHelpOpen(false)}>×</button></header>
        <section><h2>快捷操作</h2><div><span>搜索并跳转到任意功能</span><kbd>⌘ K</kbd></div><div><span>关闭当前浮层</span><kbd>ESC</kbd></div></section>
        <section><h2>产品边界</h2><p>系统提供草稿、校验与证据链；关键判断仍由你确认，高风险事项会显式进入人工复核。</p></section>
        <Link href="/reviews" onClick={()=>setHelpOpen(false)}>前往人工复核中心 <span>→</span></Link>
      </aside>}
      <div className="app-content">{children}</div>
    </div>
  </div>;
}
