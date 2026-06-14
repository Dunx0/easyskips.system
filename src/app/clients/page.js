"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CLIENTS — src/app/clients/page.js
 *
 *  The client book, computed live by joining the clients table with the
 *  invoice ledger: lifetime revenue, job count, outstanding balance, recency.
 *  Toggle account-client status (account = invoiced monthly vs cash).
 *  If the clients table is empty, names are derived from invoices so the
 *  page still works before the phase-3 SQL backfill has run.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  Users, Search, Loader2, CheckCircle2, XCircle, RefreshCw,
  Crown, Wallet, BadgeCheck, Phone,
} from "lucide-react";

const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
const DAY = 86_400_000;

const T = {
  dark: {
    panel: "bg-white/[0.035] border border-white/[0.07] backdrop-blur-xl",
    sub: "text-zinc-400", faint: "text-zinc-500", hairline: "border-white/[0.07]",
    divide: "divide-white/[0.05]", rowHover: "hover:bg-white/[0.03]",
    chip: "bg-white/[0.05] border border-white/[0.08]",
    input: "bg-white/[0.04] border border-white/[0.09] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/15",
    button: "bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-zinc-300",
  },
  light: {
    panel: "bg-white border border-zinc-200 shadow-sm",
    sub: "text-zinc-500", faint: "text-zinc-400", hairline: "border-zinc-200",
    divide: "divide-zinc-100", rowHover: "hover:bg-zinc-50",
    chip: "bg-zinc-100 border border-zinc-200",
    input: "bg-white border border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15",
    button: "bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600",
  },
};

function Kpi({ s, icon: Icon, label, value, foot }) {
  return (
    <div className={`rounded-2xl p-4 ${s.panel}`}>
      <div className="flex items-start justify-between">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${s.sub}`}>{label}</p>
        <Icon size={16} className="text-amber-400" />
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {foot && <p className={`mt-0.5 text-xs ${s.faint}`}>{foot}</p>}
    </div>
  );
}

export default function ClientsPage() {
  const { dark } = useTheme();
  const s = T[dark ? "dark" : "light"];

  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, i] = await Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("invoices").select("client, date, amount, banked"),
    ]);
    if (c.error || i.error) setToast({ type: "error", msg: (c.error || i.error).message });
    setClients(c.data ?? []);
    setInvoices(i.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  /* join clients ⨝ ledger; fall back to invoice-derived names if table empty */
  const book = useMemo(() => {
    const agg = new Map();
    for (const r of invoices) {
      const name = (r.client || "Unknown").trim();
      if (!agg.has(name)) agg.set(name, { revenue: 0, jobs: 0, outstanding: 0, last: null });
      const a = agg.get(name);
      a.revenue += Number(r.amount || 0);
      a.jobs += 1;
      if (!r.banked) a.outstanding += Number(r.amount || 0);
      if (!a.last || r.date > a.last) a.last = r.date;
    }
    const base = clients.length
      ? clients
      : [...agg.keys()].map((name) => ({ id: name, name, phone: null, is_account: false, derived: true }));

    return base
      .map((c) => {
        const a = agg.get(c.name) ?? { revenue: 0, jobs: 0, outstanding: 0, last: null };
        const daysSince = a.last ? Math.floor((Date.now() - new Date(a.last)) / DAY) : null;
        return { ...c, ...a, daysSince };
      })
      .sort((x, y) => y.revenue - x.revenue);
  }, [clients, invoices]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return book;
    return book.filter((c) => c.name.toLowerCase().includes(needle));
  }, [book, q]);

  const totals = useMemo(() => ({
    n: book.length,
    accounts: book.filter((c) => c.is_account).length,
    revenue: book.reduce((sum, c) => sum + c.revenue, 0),
    outstanding: book.reduce((sum, c) => sum + c.outstanding, 0),
  }), [book]);

  async function toggleAccount(c) {
    if (c.derived) {
      return setToast({ type: "error", msg: "Run the phase-3 SQL first — the clients table is empty, names here are derived from invoices." });
    }
    setBusyId(c.id);
    const next = !c.is_account;
    const { error } = await supabase.from("clients").update({ is_account: next }).eq("id", c.id);
    setBusyId(null);
    if (error) return setToast({ type: "error", msg: error.message });
    setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_account: next } : x)));
  }

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
              <Users size={20} className="text-amber-400" /> Clients
            </h1>
            <p className={`mt-1 text-xs ${s.sub}`}>Lifetime value and balances, computed live from the invoice ledger</p>
          </div>
          <button onClick={load} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${s.button}`}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </header>

        {/* KPIs */}
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi s={s} icon={Users} label="Clients" value={totals.n} foot={`${totals.accounts} on account`} />
          <Kpi s={s} icon={Wallet} label="Lifetime ad-hoc revenue" value={zar.format(totals.revenue)} />
          <Kpi s={s} icon={Crown} label="Top client" value={book[0]?.name ?? "—"} foot={book[0] ? zar.format(book[0].revenue) : ""} />
          <Kpi s={s} icon={XCircle} label="Total outstanding" value={zar.format(totals.outstanding)} foot="unbanked across all clients" />
        </div>

        {/* search */}
        <div className="relative mb-4">
          <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${s.faint}`} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…"
            className={`w-full rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none transition-all ${s.input}`} />
        </div>

        {/* table */}
        <section className={`rounded-2xl p-5 ${s.panel}`}>
          {loading && book.length === 0 ? (
            <div className="grid place-items-center py-14"><Loader2 size={22} className="animate-spin text-amber-400" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-[0.12em] ${s.hairline} ${s.faint}`}>
                    <th className="pb-2.5 pr-4">Client</th>
                    <th className="pb-2.5 pr-4 text-right">Jobs</th>
                    <th className="pb-2.5 pr-4 text-right">Lifetime revenue</th>
                    <th className="pb-2.5 pr-4 text-right">Outstanding</th>
                    <th className="pb-2.5 pr-4 text-right">Last hire</th>
                    <th className="pb-2.5 text-right">Account</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${s.divide}`}>
                  {visible.map((c) => (
                    <tr key={c.id} className={`transition-colors ${s.rowHover}`}>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{c.name}</p>
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-[11px] text-amber-400 hover:underline">
                            <Phone size={10} /> {c.phone}
                          </a>
                        )}
                      </td>
                      <td className={`py-3 pr-4 text-right tabular-nums ${s.sub}`}>{c.jobs}</td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums">{zar.format(c.revenue)}</td>
                      <td className={`py-3 pr-4 text-right font-semibold tabular-nums ${c.outstanding > 0 ? "text-rose-400" : s.faint}`}>
                        {c.outstanding > 0 ? zar.format(c.outstanding) : "—"}
                      </td>
                      <td className={`py-3 pr-4 text-right text-xs tabular-nums ${s.sub}`}>
                        {c.last ? `${c.last} (${c.daysSince}d)` : "—"}
                      </td>
                      <td className="py-3 text-right">
                        <button onClick={() => toggleAccount(c)} disabled={busyId === c.id}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                            c.is_account
                              ? "bg-cyan-500/12 text-cyan-400 ring-1 ring-cyan-500/25"
                              : `${s.chip} ${s.sub} hover:scale-[1.03]`
                          }`}>
                          {busyId === c.id ? <Loader2 size={11} className="animate-spin" /> : <BadgeCheck size={11} />}
                          {c.is_account ? "Account" : "Cash"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr><td colSpan={6} className={`py-10 text-center text-sm ${s.faint}`}>No clients match.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-xl ${
            toast.type === "success" ? "border-emerald-400/30 bg-emerald-500/[0.12] text-emerald-300"
                                     : "border-rose-400/30 bg-rose-500/[0.12] text-rose-300"
          }`}>
            {toast.type === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}