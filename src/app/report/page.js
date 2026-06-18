"use client";

/**
 * MONTHLY REPORT — src/app/report/page.js  (OWNER)
 * Live monthly summary, month chosen from a dropdown. Print / Save-as-PDF.
 * All figures from the invoice ledger + contracts + skip_fleet.
 */

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Printer, Loader2, ArrowLeft, ArrowUpRight, ArrowDownRight, FileText } from "lucide-react";
import Link from "next/link";

const SIZE_ORDER = ["2m³", "3m³", "6m³", "9m³"];
const DAY = 86_400_000;
const zar = (n) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n || 0);
const monthKey = (d) => d.slice(0, 7);
const monthLabel = (key) => new Date(key + "-01").toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
const monthShort = (key) => new Date(key + "-01").toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });

function parseItems(items) {
  if (!items) return [];
  const out = []; const re = /(\d+)\s*[x×]\s*(\d(?:\.\d)?m³)/gi; let m;
  while ((m = re.exec(items)) !== null) out.push({ size: m[2], qty: +m[1] });
  if (!out.length) { const sm = items.match(/(\d(?:\.\d)?m³)/); if (sm) out.push({ size: sm[1], qty: 1 }); }
  return out;
}

export default function ReportPage() {
  const { dark } = useTheme();
  const [invoices, setInvoices] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [month, setMonth] = useState(null);

  useEffect(() => {
    (async () => {
      const [inv, ctr, sf] = await Promise.all([
        supabase.from("invoices").select("client,date,items,amount,banked,collected")
          .eq("voided", false).order("date").range(0, 19999),
        supabase.from("contracts").select("mrr, since"),
        supabase.from("skip_fleet").select("size, owned"),
      ]);
      setInvoices(inv.data ?? []);
      setContracts(ctr.data ?? []);
      setFleet(sf.data ?? []);
    })();
  }, []);

  const months = useMemo(() => {
    if (!invoices) return [];
    const set = new Set(invoices.filter((i) => i.date).map((i) => monthKey(i.date)));
    return [...set].sort().reverse();
  }, [invoices]);

  useEffect(() => { if (months.length && !month) setMonth(months[0]); }, [months, month]);

  const mrrInForce = (key) => {
    const end = new Date(+key.split("-")[0], +key.split("-")[1], 0);
    return contracts.reduce((s, c) => s + (!c.since || new Date(c.since) <= end ? Number(c.mrr || 0) : 0), 0);
  };

  const r = useMemo(() => {
    if (!invoices || !month) return null;
    const inMonth = (key) => invoices.filter((i) => i.date && monthKey(i.date) === key);

    const adhocFor = (key) => inMonth(key).reduce((s, i) => s + Number(i.amount || 0), 0);
    const prevKey = (() => { const d = new Date(month + "-01"); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();

    const adhoc = adhocFor(month), adhocPrev = adhocFor(prevKey);
    const mrr = mrrInForce(month), mrrPrev = mrrInForce(prevKey);
    const total = adhoc + mrr, totalPrev = adhocPrev + mrrPrev;

    const monthInv = inMonth(month);
    const collected = monthInv.filter((i) => i.banked).reduce((s, i) => s + Number(i.amount || 0), 0);
    const invoicedTotal = monthInv.reduce((s, i) => s + Number(i.amount || 0), 0);
    const owedMonth = invoicedTotal - collected;
    const collectedPct = invoicedTotal > 0 ? (collected / invoicedTotal) * 100 : 0;
    const collectedPrev = inMonth(prevKey).filter((i) => i.banked).reduce((s, i) => s + Number(i.amount || 0), 0);

    const delta = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : 0);

    // 6-month trend
    const trend = months.slice(0, 6).reverse().map((k) => ({
      m: monthShort(k), mrr: mrrInForce(k), adhoc: adhocFor(k),
    }));

    // demand by size (this month)
    const demand = {}; for (const i of monthInv) for (const { size, qty } of parseItems(i.items)) demand[size] = (demand[size] ?? 0) + qty;
    const demandMax = Math.max(1, ...Object.values(demand));
    const demandRows = SIZE_ORDER.map((sz) => ({ size: sz, qty: demand[sz] ?? 0 }));

    // top clients (this month)
    const byClient = {}; for (const i of monthInv) { const n = (i.client || "Unknown").trim(); byClient[n] = (byClient[n] ?? 0) + Number(i.amount || 0); }
    const clients = Object.entries(byClient).map(([name, rev]) => ({ name, rev, share: invoicedTotal > 0 ? rev / invoicedTotal : 0 }))
      .sort((a, b) => b.rev - a.rev).slice(0, 5);
    const clientMax = Math.max(1, ...clients.map((c) => c.rev));

    // fleet utilisation (current point-in-time)
    const deployed = {}; for (const i of invoices.filter((x) => !x.collected)) for (const { size, qty } of parseItems(i.items)) deployed[size] = (deployed[size] ?? 0) + qty;
    const owned = fleet.reduce((s, f) => s + Number(f.owned || 0), 0);
    const onSite = Math.min(owned, fleet.reduce((s, f) => s + Math.min(Number(f.owned || 0), deployed[f.size] ?? 0), 0));
    const util = owned > 0 ? (onSite / owned) * 100 : 0;

    // outstanding debtors (all unbanked, current AR)
    const debtors = invoices.filter((i) => !i.banked).map((i) => ({
      client: i.client, amount: Number(i.amount || 0),
      days: Math.max(0, Math.floor((Date.now() - new Date(i.date).getTime()) / DAY)),
    })).sort((a, b) => b.days - a.days);
    const totalOwed = debtors.reduce((s, d) => s + d.amount, 0);

    return {
      total, mrr, adhoc, collected, owedMonth, collectedPct,
      dTotal: delta(total, totalPrev), dMrr: delta(mrr, mrrPrev), dAdhoc: delta(adhoc, adhocPrev), dCollected: delta(collected, collectedPrev),
      trend, demandRows, demandMax, clients, clientMax,
      util, onSite, owned, jobs: monthInv.length,
      debtors: debtors.slice(0, 5), totalOwed, debtorCount: debtors.length,
    };
  }, [invoices, contracts, fleet, month, months]);

  if (!invoices) return <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-amber-500" /></div>;

  const card = "rounded-xl border border-white/[0.07] bg-white/[0.025] p-4";
  const Delta = ({ v }) => (
    <span className={`flex items-center gap-0.5 text-xs font-bold tabular-nums ${v >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
      {v >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(v).toFixed(1)}%
    </span>
  );

  return (
    <div className="min-h-screen bg-[#0F0F13] px-4 py-6 text-zinc-100 sm:px-8" style={{ fontFeatureSettings: '"tnum" 1' }}>
      {/* toolbar (screen only) */}
      <div className="mx-auto mb-4 flex max-w-[900px] items-center justify-between print:hidden">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft size={15} /> Dashboard</Link>
        <div className="flex items-center gap-2">
          <select value={month ?? ""} onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl border border-white/[0.09] bg-[#16161c] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400/60">
            {months.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
          </select>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 px-4 py-2 text-sm font-bold text-[#0F0F13] hover:brightness-105">
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>
      </div>

      {!r ? (
        <div className="mx-auto max-w-[900px] rounded-2xl border border-white/[0.07] p-10 text-center text-sm text-zinc-400">No data for this month.</div>
      ) : (
        <div id="report" className="mx-auto max-w-[900px] rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 print:border-0">
          {/* header */}
          <div className="flex items-start justify-between border-b border-white/[0.08] pb-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-[#0F0F13]"><FileText size={18} /></div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">Easy Skips</h1>
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Skip hire · Waste containers</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Monthly Report</p>
              <p className="text-2xl font-extrabold">{monthLabel(month)}</p>
              <p className="mt-0.5 text-[11px] tabular-nums text-zinc-500">Generated {new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}</p>
            </div>
          </div>

          {/* revenue summary */}
          <p className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Revenue Summary</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className={card}>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total revenue</span><Delta v={r.dTotal} /></div>
              <p className="mt-2 text-2xl font-extrabold tabular-nums text-amber-400">{zar(r.total)}</p>
              <p className="mt-1 text-[11px] text-zinc-500">MRR + ad-hoc combined</p>
            </div>
            <div className={card}>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Contract MRR</span><Delta v={r.dMrr} /></div>
              <p className="mt-2 text-2xl font-extrabold tabular-nums text-cyan-400">{zar(r.mrr)}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Guaranteed recurring base</p>
            </div>
            <div className={card}>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Ad-hoc invoiced</span><Delta v={r.dAdhoc} /></div>
              <p className="mt-2 text-2xl font-extrabold tabular-nums">{zar(r.adhoc)}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Invoiced this month</p>
            </div>
            <div className={card}>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Collected</span><Delta v={r.dCollected} /></div>
              <p className="mt-2 text-2xl font-extrabold tabular-nums">{zar(r.collected)}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${r.collectedPct}%` }} /></div>
              <p className="mt-1 text-[11px] tabular-nums text-zinc-500">{r.collectedPct.toFixed(0)}% banked · {zar(r.owedMonth)} owed</p>
            </div>
          </div>

          {/* revenue trend */}
          <p className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Revenue Trend · Last 6 Months</p>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={r.trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rMrr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0.05} /></linearGradient>
                    <linearGradient id="rAd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="m" stroke="#71717a" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} dy={6} />
                  <YAxis stroke="#71717a" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} width={48} />
                  <Tooltip contentStyle={{ background: "rgba(18,18,24,0.94)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, color: "#fafafa", fontSize: 12 }} formatter={(v, n) => [zar(v), n === "mrr" ? "Contract MRR" : "Ad-hoc"]} />
                  <Area type="monotone" dataKey="mrr" stackId="1" stroke="#22d3ee" strokeWidth={2} fill="url(#rMrr)" />
                  <Area type="monotone" dataKey="adhoc" stackId="1" stroke="#f59e0b" strokeWidth={2} fill="url(#rAd)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex gap-4 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: "#22d3ee" }} />Contract MRR</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: "#f59e0b" }} />Ad-hoc</span>
            </div>
          </div>

          {/* operations snapshot */}
          <p className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Operations Snapshot</p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className={card}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Fleet use (now)</p>
              <p className="mt-2 text-3xl font-extrabold tabular-nums text-amber-400">{r.util.toFixed(0)}%</p>
              <p className="mt-1 text-[11px] text-zinc-500">{r.onSite} of {r.owned} skips on site</p>
            </div>
            <div className={card}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Invoices raised</p>
              <p className="mt-2 text-3xl font-extrabold tabular-nums">{r.jobs}</p>
              <p className="mt-1 text-[11px] text-zinc-500">in {monthLabel(month)}</p>
            </div>
            <div className={card}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Demand by skip size</p>
              <div className="space-y-1.5">
                {r.demandRows.map((d) => (
                  <div key={d.size} className="flex items-center gap-2">
                    <span className="w-9 text-[11px] tabular-nums text-zinc-400">{d.size}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${(d.qty / r.demandMax) * 100}%` }} /></div>
                    <span className="w-7 text-right text-[11px] tabular-nums text-zinc-300">{d.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* top clients */}
          <p className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Top Clients · {new Date(month + "-01").toLocaleDateString("en-ZA", { month: "long" })}</p>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
            {r.clients.map((c, i) => (
              <div key={c.name} className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-4 text-xs tabular-nums text-zinc-500">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.name}</span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">{zar(c.rev)} <span className="text-xs font-normal text-zinc-500">{(c.share * 100).toFixed(1)}%</span></span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${(c.rev / r.clientMax) * 100}%` }} /></div>
                </div>
              </div>
            ))}
            {r.clients.length === 0 && <p className="px-3 py-6 text-center text-sm text-zinc-500">No invoices this month.</p>}
          </div>

          {/* outstanding debtors */}
          <p className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Outstanding Debtors</p>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              <span>Client · unbanked invoice</span><div className="flex gap-8"><span>Amount</span><span>Days out</span></div>
            </div>
            {r.debtors.map((d, i) => (
              <div key={i} className="flex items-center justify-between border-b border-white/[0.04] py-2.5 text-sm">
                <span className="font-medium">{d.client}</span>
                <div className="flex items-center gap-6">
                  <span className="tabular-nums">{zar(d.amount)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                    d.days > 30 ? "bg-rose-500/15 text-rose-400" : d.days > 14 ? "bg-amber-500/15 text-amber-400" : "bg-white/[0.06] text-zinc-400"}`}>{d.days} days</span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 text-sm font-bold">
              <span className="uppercase tracking-wider text-zinc-400">Total owed{r.debtorCount > 5 ? ` (${r.debtorCount} invoices)` : ""}</span>
              <span className="text-lg tabular-nums text-amber-400">{zar(r.totalOwed)}</span>
            </div>
          </div>

          {/* footer */}
          <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-4 text-[11px] text-zinc-500">
            <span>Easy Skips · Rustenburg</span><span>Figures drawn from the live invoice ledger</span>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          nav, aside, header { display: none !important; }
          body { background: #0F0F13 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}