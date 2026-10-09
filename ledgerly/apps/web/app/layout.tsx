import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './styles.css';
import './app-shell.css';
import './auth.css';
import { AppShell } from './ui/app-shell';

export const metadata: Metadata = {
  title: '账税通 · 一人公司财务工作台',
  description: '面向一人有限责任公司的记账与报税协作平台',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
