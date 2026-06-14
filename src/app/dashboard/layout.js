'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import Clock from '@/components/Clock';
import { invoices } from '@/lib/data';

const navItems = [
  { href: '/dashboard',         label: 'Dashboard', icon: '◈' },
  { href: '/dashboard/debtors', label: 'Debtors',   icon: '⚠' },
  { href: '/dashboard/clients', label: 'Clients',   icon: '◎' },
  { href: '/dashboard/drivers', label: 'Drivers',   icon: '⚙' },
];

const tabs = [
  { href: '/dashboard',           label: 'Summary',   icon: '⚡' },
  { href: '/dashboard/overview',  label: 'Overview',  icon: '◈' },
  { href: '/dashboard/revenue',   label: 'Revenue',   icon: '↗' },
  { href: '/dashboard/margin',    label: 'Margin',    icon: '◉' },
  { href: '/dashboard/inventory', label: 'Inventory', icon: '⬡' },
  { href: '/dashboard/fleet',     label: 'Fleet',     icon: '⊡' },
  { href: '/dashboard/drivers',   label: 'Drivers',   icon: '⚙' },
  { href: '/dashboard/debtors',   label: 'Debtors',   icon: '⚠' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: '⋯' },
];

const pageTitle = {
  '/dashboard':            'Business Summary',
  '/dashboard/overview':   'Performance Overview',
  '/dashboard/debtors':    'Debtor Management',
  '/dashboard/revenue':    'Revenue Analytics',
  '/dashboard/margin':     'Margin Analysis',
  '/dashboard/clients':    'Client Registry',
  '/dashboard/inventory':  'Skip Inventory',
  '/dashboard/fleet':      'Fleet Performance',
  '/dashboard/drivers':    'Driver Performance',
  '/dashboard/analytics':  'Advanced Analytics',
};

function isTabActive(tabHref, pathname) {
  if (tabHref === '/dashboard') return pathname === '/dashboard';
  return pathname.startsWith(tabHref);
}

function isNavActive(navHref, pathname) {
  if (navHref === '/dashboard') {
    const nonDashTabs = ['/dashboard/debtors', '/dashboard/clients', '/dashboard/drivers'];
    return !nonDashTabs.some(t => pathname.startsWith(t));
  }
  return pathname.startsWith(navHref);
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const debtorCount = invoices.filter(i => i.banked < i.amount).length;

  return (
    <div className="min-h-screen">
      {/* ═══ TOP NAV BAR ═══ */}
      <header className="bg-[var(--bg1)] border-b border-[var(--line)] px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 bg-[var(--accent)] rounded-lg flex items-center justify-center font-bold text-sm text-[var(--logo-fg)] tracking-tight">
            ES
          </div>
          <span className="font-semibold text-[17px] tracking-tight">
            easy<span className="text-[var(--accent)]">skips</span>
          </span>
        </Link>

        {/* Center nav pills */}
        <nav className="flex items-center bg-[var(--bg2)] rounded-2xl p-1 gap-1">
          {navItems.map(item => {
            const active = isNavActive(item.href, pathname);
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200
                  ${active
                    ? 'bg-[var(--bg1)] text-[var(--ink)] shadow-sm'
                    : 'text-[var(--ink3)] hover:text-[var(--ink2)] hover:bg-[var(--bg3)]'}`}
              >
                <span className="text-xs">{item.icon}</span>
                <span>{item.label}</span>
                {item.label === 'Debtors' && debtorCount > 0 && (
                  <span className="text-[10px] bg-[#F87171] text-white px-1.5 py-0.5 rounded-full font-mono leading-none">
                    {debtorCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <Clock />
          <ThemeSwitcher />
          <div className="w-9 h-9 rounded-full bg-[var(--accent-dim)] border border-[var(--accent)]/30 flex items-center justify-center text-[11px] font-mono text-[var(--accent2)]">
            OP
          </div>
        </div>
      </header>

      {/* ═══ PAGE HEADER ═══ */}
      <div className="px-8 pt-8 pb-0">
        <h1 className="text-[32px] font-semibold tracking-tight mb-6">
          {pageTitle[pathname] || 'Dashboard'}
        </h1>

        {/* ═══ SUB TABS ═══ */}
        <div className="flex items-end justify-between border-b border-[var(--line)]">
          <div className="flex items-center gap-1 -mb-px">
            {tabs.map(tab => {
              const active = isTabActive(tab.href, pathname);
              return (
                <Link key={tab.href} href={tab.href}
                  className={`group flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-xl border border-b-0 transition-all duration-200
                    ${active
                      ? 'bg-[var(--bg1)] border-[var(--line)] text-[var(--ink)] translate-y-px'
                      : 'border-transparent text-[var(--ink3)] hover:text-[var(--ink2)] hover:bg-[var(--bg2)] hover:border-[var(--line)]'}`}
                >
                  <span className={`text-xs transition-transform duration-200 group-hover:scale-110 ${active ? 'text-[var(--accent)]' : ''}`}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <main className="px-8 py-6">
        {children}
      </main>
    </div>
  );
}
