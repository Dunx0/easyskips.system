"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  src/components/AppShell.jsx — CLIENT SHELL
 *
 *  Owns: global Dark/Light theme (Context), collapsible desktop sidebar,
 *  mobile hamburger drawer, active-route glow, ROLE-FILTERED nav, and sign-out.
 *
 *  Any page can read the theme via:
 *      import { useTheme } from "@/components/AppShell";
 *      const { dark, setDark } = useTheme();
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { LogoBadge } from "@/components/Logo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Truck,
  Receipt,
  Hourglass,
  BarChart3,
  Users,
  Container,
  Sun,
  Moon,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  Radio,
  Send,
  Inbox,
  ClipboardList,
  Settings,
  LogOut,
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════════════════
   THEME CONTEXT — single source of truth for dark/light across all routes
   ════════════════════════════════════════════════════════════════════════════ */

const ThemeContext = createContext({ dark: true, setDark: () => {} });
export const useTheme = () => useContext(ThemeContext);

/* ════════════════════════════════════════════════════════════════════════════
   NAVIGATION MODEL  (roles control who SEES each tab; middleware enforces access)
   ════════════════════════════════════════════════════════════════════════════ */

const NAV = [
  { href: "/",          label: "Dashboard", icon: LayoutDashboard, roles: ["owner"] },
  { href: "/report", label: "Report", icon: FileText, roles: ["owner"] },
  { href: "/analytics", label: "Analytics", icon: BarChart3,       roles: ["owner"] },
  { href: "/debtors",   label: "Debtors",   icon: Hourglass,       roles: ["owner"] },
  { href: "/clients",   label: "Clients",   icon: Users,           roles: ["owner"] },
  { href: "/fleet",     label: "Fleet",     icon: Truck,           roles: ["owner"] },
  { href: "/dispatch",  label: "Dispatch",  icon: Send,            roles: ["owner","admin"] },
  { href: "/quoute",    label: "Quotes",    icon: FileText,        roles: ["admin"] }, // matches your folder spelling
  { href: "/orders",    label: "Orders",    icon: Inbox,           roles: ["admin"] },
  { href: "/invoices",  label: "Invoices",  icon: Receipt,         roles: ["owner", "admin"] },
  { href: "/runsheet",  label: "Run Sheet", icon: ClipboardList,   roles: ["owner", "admin"] },
  { href: "/settings",  label: "Settings",  icon: Settings,        roles: ["owner", "admin"] },
];

/* ════════════════════════════════════════════════════════════════════════════
   THEME TOKENS (shell-level)
   ════════════════════════════════════════════════════════════════════════════ */

const SHELL = {
  dark: {
    page: "bg-[#0F0F13] text-zinc-100",
    rail: "bg-[#121218]/90 border-white/[0.07] backdrop-blur-xl",
    hairline: "border-white/[0.07]",
    sub: "text-zinc-400",
    faint: "text-zinc-500",
    item: "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]",
    itemActive: "text-amber-300 bg-amber-500/[0.09]",
    button: "bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-zinc-300",
    overlay: "bg-black/60",
    topbar: "bg-[#0F0F13]/80 border-white/[0.07] backdrop-blur-xl",
  },
  light: {
    page: "bg-[#F4F4F1] text-zinc-800",
    rail: "bg-[#FAFAF8]/90 border-zinc-200/80 backdrop-blur-xl",
    hairline: "border-zinc-200/80",
    sub: "text-zinc-600",
    faint: "text-zinc-400",
    item: "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-900/[0.04]",
    itemActive: "text-amber-700 bg-amber-500/[0.12]",
    button: "bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 shadow-sm",
    overlay: "bg-zinc-900/30",
    topbar: "bg-[#F4F4F1]/85 border-zinc-200/80 backdrop-blur-xl",
  },
};

/* ════════════════════════════════════════════════════════════════════════════
   NAV ITEM — glowing amber left-rail on the active route
   ════════════════════════════════════════════════════════════════════════════ */

function NavItem({ item, active, collapsed, s, onNavigate }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        active ? s.itemActive : s.item
      } ${collapsed ? "justify-center px-0" : ""}`}
    >
      <span
        className={`absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-300 ${
          active
            ? "bg-gradient-to-b from-amber-300 to-orange-500 opacity-100"
            : "opacity-0"
        }`}
      />
      <Icon
        size={19}
        strokeWidth={active ? 2.4 : 2}
        className="shrink-0 transition-transform duration-200 group-hover:scale-105"
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && active && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400/70" />
      )}
    </Link>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SIDEBAR BODY (shared by desktop rail + mobile drawer)
   ════════════════════════════════════════════════════════════════════════════ */

function SidebarBody({ s, collapsed, pathname, onNavigate, dark, setDark, role, onSignOut }) {
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className={`flex items-center gap-3 px-4 py-5 ${collapsed ? "justify-center px-0" : ""}`}>
        <LogoBadge size={40} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold tracking-tight">SkipCommand</p>
            <p className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${s.faint}`}>
              <Radio size={9} className="text-emerald-400" /> {role ? `${role} console` : "Ops Console"}
            </p>
          </div>
        )}
      </div>

      <div className={`mx-3 border-t ${s.hairline}`} />

      {/* Nav — filtered by the logged-in user's role */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.filter((item) => !role || item.roles.includes(role)).map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <NavItem
              key={item.href}
              item={item}
              active={active}
              collapsed={collapsed}
              s={s}
              onNavigate={onNavigate}
            />
          );
        })}
      </nav>

      {/* Footer: theme toggle + sign out */}
      <div className={`space-y-1.5 border-t px-3 py-4 ${s.hairline}`}>
        <button
          onClick={() => setDark((v) => !v)}
          aria-label="Toggle theme"
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${s.button} ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
          {!collapsed && (dark ? "Light mode" : "Dark mode")}
        </button>
        <button
          onClick={onSignOut}
          aria-label="Sign out"
          title={collapsed ? "Sign out" : undefined}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/10 ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <LogOut size={17} />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   APP SHELL
   ════════════════════════════════════════════════════════════════════════════ */

export default function AppShell({ children }) {
  const [dark, setDark] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState(null);
  const pathname = usePathname();
  const router = useRouter();
  const s = SHELL[dark ? "dark" : "light"];

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setRole(data.user?.app_metadata?.app_role ?? null);
    });
  }, [pathname]); // re-check on navigation so role is fresh after login

  async function handleSignOut() {
    await supabase.auth.signOut();
    setRole(null);
    router.replace("/login");
    router.refresh();
  }

  const current = NAV.find((n) =>
    n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
  );

  // Don't render the shell chrome on the login page
  if (pathname === "/login") {
    return (
      <ThemeContext.Provider value={{ dark, setDark }}>
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ dark, setDark }}>
      <div className={`min-h-screen transition-colors duration-300 ${s.page}`}>
        {/* ── DESKTOP SIDEBAR ────────────────────────────────────────────── */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 hidden border-r transition-[width] duration-300 lg:block ${s.rail} ${
            collapsed ? "w-[76px]" : "w-[248px]"
          }`}
        >
          <SidebarBody
            s={s}
            collapsed={collapsed}
            pathname={pathname}
            dark={dark}
            setDark={setDark}
            role={role}
            onSignOut={handleSignOut}
          />
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`absolute -right-3 top-7 grid h-6 w-6 place-items-center rounded-full text-[10px] transition-colors ${s.button}`}
          >
            {collapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
          </button>
        </aside>

        {/* ── MOBILE DRAWER ──────────────────────────────────────────────── */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className={`absolute inset-0 ${s.overlay}`}
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <aside
              className={`absolute inset-y-0 left-0 w-[268px] border-r shadow-2xl ${s.rail} animate-[slideIn_.22s_ease-out]`}
            >
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className={`absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-lg ${s.button}`}
              >
                <X size={16} />
              </button>
              <SidebarBody
                s={s}
                collapsed={false}
                pathname={pathname}
                dark={dark}
                setDark={setDark}
                role={role}
                onSignOut={handleSignOut}
                onNavigate={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        )}

        {/* ── MOBILE TOP BAR ─────────────────────────────────────────────── */}
        <header
          className={`sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 lg:hidden ${s.topbar}`}
        >
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className={`grid h-9 w-9 place-items-center rounded-lg ${s.button}`}
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 text-[#0F0F13]">
              <Container size={14} strokeWidth={2.6} />
            </div>
            <span className="text-sm font-extrabold tracking-tight">SkipCommand</span>
            {current && (
              <span className={`text-xs ${s.faint}`}>/ {current.label}</span>
            )}
          </div>
        </header>

        {/* ── MAIN CONTENT ───────────────────────────────────────────────── */}
        <main
          className={`min-h-screen transition-[padding] duration-300 ${
            collapsed ? "lg:pl-[76px]" : "lg:pl-[248px]"
          }`}
        >
          {children}
        </main>
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </ThemeContext.Provider>
  );
}