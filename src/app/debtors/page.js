"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DEBTORS — src/app/debtors/page.js
 *
 *  Who owes what, for how long. Debt = invoice not yet banked.
 *  Standard receivables treatment: aging buckets (0–7 / 8–14 / 15–30 / 30+),
 *  average days outstanding, and a chase list sorted oldest-first with a
 *  one-tap "Banked" action when the money lands.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  Hourglass, Loader2, CheckCircle2, XCircle, RefreshCw,
  AlertTriangle, Banknote, CalendarClock, Scale,
} from "lucide-react";

const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
const DAY = 86_400_000;

const BUCKETS = [
  { key: "b0",  label: "0–7 days",   min: 0,  max: 7,        tone: "text-emerald-400", bar: "linear-gradient(90deg,#34d399,#059669)" },
  { key: "b1",  label: "8–14 days",  min: 8,  max: 14,       tone: "text-cyan-400",    bar: "linear-gradient(90deg,#22d3ee,#0891b2)" },
  { key: "b2",  label: "15–30 days", min: 15, max: 30,       tone: "text-amber-400",   bar: "linear-gradient(90deg,#fbbf24,#d97706)" },
  { key: "b3",  label: "30+ days",   min: 31, max: Infinity, tone: "text-rose-400",    bar: "linear-gradient(90deg,#fb7185,#e11d48)" },
];

const T = {
  dark: {
    panel: "bg-white/[0.035] border border-white/[0.07] backdrop-blur-xl",
    sub: "text-zinc-400", faint: "text-zinc-500", hairline: "border-white/[0.07]",
    divide: "divide-white/[0.05]", rowHover: "hover:bg-white/[0.03]",
    chip: "bg-white/[0.05] border border-white/[0.08]",
    button: "bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-zinc-300",
    track: "bg-white/[0.06]",
  },
  light: {
    panel: "bg-white border border-zinc-200 shadow-sm",
    sub: "text-zinc-500", faint: "text-zinc-400", hairline: "border-zinc-200",
    divide: "divide-zinc-100", rowHover: "hover:bg-zinc-50",
    chip: "bg-zinc-100 border border-zinc-200",
    button: "bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600",
    track: "bg-zinc-100",
  },
};

export default function DebtorsPage() {
  const { dark } = useTheme();
  const s = T[dark ? "dark" : "light"];

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("banked", false)
      .order("date");
    if (error) setToast({ type: "error", msg: error.message });
    setRows(
      (data ?? []).map((r) => ({
        ...r,
        days: Math.max(0, Math.floor((Date.now() - new Date(r.date).getTime()) / DAY)),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const model = useMemo(() => {
    const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const buckets = BUCKETS.map((b) => {
      const inB = rows.filter((r) => r.days >= b.min && r.days <= b.max);
      const amt = inB.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      return { ...b, n: inB.length, amt, share: total > 0 ? amt / total : 0 };
    });
    const avgDays = rows.length
      ? rows.reduce((sum, r) => sum + r.days * Number(r.amount || 0), 0) / (total || 1)
      : 0; // value-weighted average days outstanding
    const oldest = rows.length ? Math.max(...rows.map((r) => r.days)) : 0;
    const atRisk = buckets[3].amt; // 30+ bucket
    return { total, buckets, avgDays, oldest, atRisk };
  }, [rows]);

  async function markBanked(r) {
    setBusyId(r.id);
    const { error } = await supabase.from("invoices").update({ banked: true }).eq("id", r.id);
    setBusyId(null);
    if (error) return setToast({ type: "error", msg: error.message });
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    setToast({ type: "success", msg: `${r.id} banked — ${zar.format(r.amount)} off the book` });
  }

  const bucketOf = (days) => BUCKETS.find((b) => days >= b.min && days <= b.max);

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
              <Hourglass size={20} className="text-amber-400" /> Debtors
            </h1>
            <p className={`mt-1 text-xs ${s.sub}`}>Receivables aging — debt is any invoice not yet banked</p>
          </div>
          <button onClick={load} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${s.button}`}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </header>

        {/* KPI row */}
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className={`rounded-2xl p-4 ${s.panel}`}>
            <p className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] ${s.sub}`}>
              Total outstanding <Banknote size={15} className="text-amber-400" />
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums">{zar.format(model.total)}</p>
            <p className={`mt-0.5 text-xs ${s.faint}`}>{rows.length} open invoice{rows.length === 1 ? "" : "s"}</p>
          </div>
          <div className={`rounded-2xl p-4 ${s.panel}`}>
            <p className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] ${s.sub}`}>
              Avg days outstanding <CalendarClock size={15} className="text-amber-400" />
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums">{model.avgDays.toFixed(1)}d</p>
            <p className={`mt-0.5 text-xs ${s.faint}`}>value-weighted</p>
          </div>
          <div className={`rounded-2xl p-4 ${s.panel}`}>
            <p className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] ${s.sub}`}>
              Oldest debt <Scale size={15} className="text-amber-400" />
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums">{model.oldest}d</p>
          </div>
          <div className={`relative overflow-hidden rounded-2xl p-4 ${s.panel} ${model.atRisk > 0 ? "!border-rose-500/40" : ""}`}>
            {model.atRisk > 0 && <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-rose-500/[0.1] to-transparent" />}
            <p className={`relative flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] ${model.atRisk > 0 ? "text-rose-400" : s.sub}`}>
              At risk (30+ days) <AlertTriangle size={15} className={model.atRisk > 0 ? "text-rose-400" : "text-amber-400"} />
            </p>
            <p className="relative mt-1.5 text-2xl font-bold tabular-nums">{zar.format(model.atRisk)}</p>
            <p className={`relative mt-0.5 text-xs ${s.faint}`}>{model.buckets[3].n} invoice{model.buckets[3].n === 1 ? "" : "s"} — chase first</p>
          </div>
        </div>

        {/* aging distribution */}
        <section className={`mb-4 rounded-2xl p-5 ${s.panel}`}>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.14em]">Aging distribution</h2>
          <div className="space-y-2.5">
            {model.buckets.map((b) => (
              <div key={b.key} className="flex items-center gap-3">
                <span className={`w-24 text-xs font-semibold tabular-nums ${b.tone}`}>{b.label}</span>
                <div className={`h-3 flex-1 overflow-hidden rounded-full ${s.track}`}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(b.amt > 0 ? 2 : 0, b.share * 100)}%`, background: b.bar }} />
                </div>
                <span className={`w-24 text-right text-xs tabular-nums ${s.sub}`}>{zar.format(b.amt)}</span>
                <span className={`w-10 text-right text-[11px] tabular-nums ${s.faint}`}>{b.n}×</span>
              </div>
            ))}
          </div>
        </section>

        {/* chase list */}
        <section className={`rounded-2xl p-5 ${s.panel}`}>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.14em]">Chase list — oldest first</h2>
          {loading && rows.length === 0 ? (
            <div className="grid place-items-center py-14"><Loader2 size={22} className="animate-spin text-amber-400" /></div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 size={26} className="mx-auto text-emerald-400" />
              <p className="mt-3 text-sm font-semibold">Book is clean</p>
              <p className={`mt-1 text-xs ${s.sub}`}>Every invoice has been banked. Rare sight — enjoy it.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-[0.12em] ${s.hairline} ${s.faint}`}>
                    <th className="pb-2.5 pr-4">Invoice</th>
                    <th className="pb-2.5 pr-4">Client</th>
                    <th className="pb-2.5 pr-4">Items</th>
                    <th className="pb-2.5 pr-4">Method</th>
                    <th className="pb-2.5 pr-4 text-right">Amount</th>
                    <th className="pb-2.5 pr-4 text-right">Age</th>
                    <th className="pb-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${s.divide}`}>
                  {rows.map((r) => {
                    const b = bucketOf(r.days);
                    return (
                      <tr key={r.id} className={`transition-colors ${s.rowHover}`}>
                        <td className={`py-3 pr-4 font-mono text-xs ${s.sub}`}>{r.id}</td>
                        <td className="py-3 pr-4 font-medium">{r.client}</td>
                        <td className={`max-w-[220px] truncate py-3 pr-4 ${s.sub}`}>{r.items}</td>
                        <td className={`py-3 pr-4 text-xs ${s.faint}`}>{r.payment ?? "—"}</td>
                        <td className="py-3 pr-4 text-right font-semibold tabular-nums">{zar.format(r.amount)}</td>
                        <td className={`py-3 pr-4 text-right font-bold tabular-nums ${b.tone}`}>{r.days}d</td>
                        <td className="py-3 text-right">
                          <button onClick={() => markBanked(r)} disabled={busyId === r.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 ring-1 ring-emerald-500/25 transition-all hover:scale-[1.03] hover:bg-emerald-500/20">
                            {busyId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Banknote size={11} />}
                            Banked
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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