"use client";

/**
 * ANALYTICS — src/app/analytics/page.js  (OWNER)
 * Live from the invoice ledger: revenue forecast (exp. smoothing + 95% PI),
 * demand mix, capex ranking, client concentration.
 * Fixes: lifts Supabase 1000-row cap (.range), realtime refresh, live skip_fleet.
 */

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  ResponsiveContainer, ComposedChart, Area, Line, Bar, BarChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import {
  BarChart3, TrendingUp, Container, Users, Loader2, AlertTriangle, Sigma,
} from "lucide-react";

/* fallback fleet — used only if the skip_fleet table is empty */
const DEMO_FLEET = [
  { size: "2m³", owned: 12, deployed: 9 },
  { size: "3m³", owned: 14, deployed: 13 },
  { size: "6m³", owned: 22, deployed: 20 },
  { size: "9m³", owned: 10, deployed: 9 },
];
const SIZE_COLORS = { "2m³": "#34d399", "3m³": "#22d3ee", "6m³": "#f59e0b", "9m³": "#fb7185" };

const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

const T = {
  dark: {
    panel: "bg-white/[0.035] border border-white/[0.07] backdrop-blur-xl",
    sub: "text-zinc-400", faint: "text-zinc-500",
    hairline: "border-white/[0.07]", chip: "bg-white/[0.05] border border-white/[0.08]",
    grid: "rgba(255,255,255,0.05)", axis: "#71717a",
  },
  light: {
    panel: "bg-white border border-zinc-200 shadow-sm",
    sub: "text-zinc-500", faint: "text-zinc-400",
    hairline: "border-zinc-200", chip: "bg-zinc-100 border border-zinc-200",
    grid: "rgba(0,0,0,0.06)", axis: "#a1a1aa",
  },
};

function parseItems(items) {
  if (!items) return [];
  const out = [];
  const re = /(\d+)\s*[x×]\s*(\d)m³/gi;
  let m;
  while ((m = re.exec(items)) !== null) out.push({ size: `${m[2]}m³`, qty: Number(m[1]) });
  if (out.length === 0) {
    const single = items.match(/(\d)m³/);
    if (single) out.push({ size: `${single[1]}m³`, qty: 1 });
  }
  return out;
}

const monthKey = (d) => d.slice(0, 7);
const monthLabel = (key) =>
  new Date(key + "-01").toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });

function sesForecast(series, alpha = 0.5, horizon = 2) {
  if (series.length < 3) return { fitted: [], forecasts: [], sigma: 0 };
  let level = series[0];
  const fitted = [level];
  const residuals = [];
  for (let i = 1; i < series.length; i++) {
    residuals.push(series[i] - level);
    level = alpha * series[i] + (1 - alpha) * level;
    fitted.push(level);
  }
  const sigma = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, residuals.length - 1));
  const forecasts = Array.from({ length: horizon }, () => level);
  return { fitted, forecasts, sigma };
}

function nextMonthKey(key, plus = 1) {
  const d = new Date(key + "-01");
  d.setMonth(d.getMonth() + plus);
  return d.toISOString().slice(0, 7);
}

export default function AnalyticsPage() {
  const { dark } = useTheme();
  const s = T[dark ? "dark" : "light"];

  const [invoices, setInvoices] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [fleet, setFleet] = useState(DEMO_FLEET);

  useEffect(() => {
    const fetchAll = async () => {
      const [inv, ctr, sf] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, client, date, items, amount")
          .eq("voided", false) // This will now work perfectly for ALL historical data
          .order("date")
          .range(0, 49999),
        supabase.from("contracts").select("client, mrr"),
        supabase.from("skip_fleet").select("size, owned, deployed").order("size"),
      ]);
      setInvoices(inv.data ?? []);
      setContracts(ctr.data ?? []);
      if (sf.data && sf.data.length) setFleet(sf.data);
    };
    fetchAll();

    const channel = supabase
      .channel("analytics-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const model = useMemo(() => {
    if (!invoices || invoices.length === 0) return null;

    /* monthly revenue + forecast */
    const byMonth = new Map();
    for (const r of invoices) {
      if (!r.date) continue;
      const k = monthKey(r.date);
      byMonth.set(k, (byMonth.get(k) ?? 0) + Number(r.amount || 0));
    }
    const months = [...byMonth.keys()].sort();
    const values = months.map((k) => byMonth.get(k));
    const mrr = contracts.reduce((sum, c) => sum + Number(c.mrr || 0), 0);

    const { forecasts, sigma } = sesForecast(values);
    const chart = months.map((k, i) => ({
      m: monthLabel(k), actual: Math.round(values[i]), forecast: null, pi: null,
    }));
    const lastKey = months[months.length - 1];
    if (chart.length && forecasts.length) {
      chart[chart.length - 1].forecast = chart[chart.length - 1].actual;
      chart[chart.length - 1].pi = [chart[chart.length - 1].actual, chart[chart.length - 1].actual];
    }
    forecasts.forEach((f, h) => {
      const k = nextMonthKey(lastKey, h + 1);
      const halfWidth = 1.96 * sigma * Math.sqrt(h + 1);
      chart.push({
        m: monthLabel(k), actual: null,
        forecast: Math.round(f),
        pi: [Math.max(0, Math.round(f - halfWidth)), Math.round(f + halfWidth)],
      });
    });

    /* demand mix by size per month */
    const mixMap = new Map();
    const totalQty = { "2m³": 0, "3m³": 0, "6m³": 0, "9m³": 0 };
    for (const r of invoices) {
      if (!r.date) continue;
      const k = monthKey(r.date);
      if (!mixMap.has(k)) mixMap.set(k, { m: monthLabel(k) });
      for (const { size, qty } of parseItems(r.items)) {
        mixMap.get(k)[size] = (mixMap.get(k)[size] ?? 0) + qty;
        if (size in totalQty) totalQty[size] += qty;
      }
    }
    const mix = [...mixMap.keys()].sort().map((k) => mixMap.get(k));
    const grandQty = Object.values(totalQty).reduce((a, b) => a + b, 0) || 1;

    /* capex ranking: utilization × demand share (live fleet) */
    const capex = fleet.map((f) => {
      const owned = Number(f.owned || 0) || 1;
      const deployed = Number(f.deployed || 0);
      const util = deployed / owned;
      const share = (totalQty[f.size] ?? 0) / grandQty;
      return { size: f.size, owned, deployed, util, share, score: util * share };
    }).sort((a, b) => b.score - a.score);

    /* client concentration */
    const byClient = new Map();
    for (const r of invoices) {
      const name = (r.client || "Unknown").trim();
      byClient.set(name, (byClient.get(name) ?? 0) + Number(r.amount || 0));
    }
    const totalAdhoc = [...byClient.values()].reduce((a, b) => a + b, 0) || 1;
    const clients = [...byClient.entries()]
      .map(([name, rev]) => ({ name, rev, share: rev / totalAdhoc }))
      .sort((a, b) => b.rev - a.rev);
    const top5Share = clients.slice(0, 5).reduce((sum, c) => sum + c.share, 0);
    const hhi = Math.round(clients.reduce((sum, c) => sum + (c.share * 100) ** 2, 0));

    return {
      chart, sigma, mrr, mix, capex, clients: clients.slice(0, 6), top5Share, hhi,
      nMonths: months.length, nInvoices: invoices.length,
    };
  }, [invoices, contracts, fleet]);

  if (invoices === null) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 size={24} className="animate-spin text-amber-400" />
      </div>
    );
  }
  if (!model) {
    return (
      <div className="px-4 py-6 sm:px-8">
        <div className={`mx-auto max-w-[700px] rounded-2xl p-10 text-center ${s.panel}`}>
          <BarChart3 size={26} className="mx-auto text-amber-400" />
          <p className="mt-3 text-sm font-semibold">No invoice data yet</p>
          <p className={`mt-1 text-xs ${s.sub}`}>
            Analytics builds itself from the live ledger — once the dispatch console has logged
            a few weeks of invoices, forecasts and demand analysis will appear here.
          </p>
        </div>
      </div>
    );
  }

  const tooltipStyle = {
    background: dark ? "rgba(18,18,24,0.92)" : "rgba(255,255,255,0.96)",
    border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}`,
    borderRadius: 12, color: dark ? "#fafafa" : "#18181b", fontSize: 12,
  };

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6">
          <h1 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
            <Sigma size={20} className="text-amber-400" /> Analytics
          </h1>
          <p className={`mt-1 text-xs ${s.sub}`}>
            Computed live from {model.nInvoices} invoices across {model.nMonths} months · methods noted per panel
          </p>
        </header>

        <div className="grid grid-cols-12 gap-4">
          {/* 1 · REVENUE FORECAST */}
          <section className={`col-span-12 rounded-2xl p-5 lg:col-span-8 ${s.panel}`}>
            <div className="mb-1 flex items-start justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]">
                  <TrendingUp size={15} className="text-amber-400" /> Ad-hoc revenue forecast
                </h2>
                <p className={`text-xs ${s.sub}`}>
                  Exponential smoothing (α=0.5) · shaded band = 95% prediction interval · contract MRR of{" "}
                  <span className="font-semibold tabular-nums text-cyan-400">{zar.format(model.mrr)}/mo</span> sits on top of this
                </p>
              </div>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={model.chart} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={s.grid} vertical={false} />
                  <XAxis dataKey="m" stroke={s.axis} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} dy={6} />
                  <YAxis stroke={s.axis} tickLine={false} axisLine={false} tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} width={50} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, name) =>
                    Array.isArray(v) ? [`${zar.format(v[0])} – ${zar.format(v[1])}`, "95% PI"] : [zar.format(v), name]
                  } />
                  <Area dataKey="pi" name="95% PI" stroke="none" fill="#f59e0b" fillOpacity={0.12} connectNulls />
                  <Area type="monotone" dataKey="actual" name="Actual" stroke="#f59e0b" strokeWidth={2.5}
                    fill="url(#gActual)" dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }} connectNulls={false} />
                  <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#22d3ee" strokeWidth={2.5}
                    strokeDasharray="6 4" dot={{ r: 4, fill: "#22d3ee", strokeWidth: 0 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className={`mt-1 text-[11px] ${s.faint}`}>
              σ of one-step residuals: {zar.format(Math.round(model.sigma))}. With {model.nMonths} months of history the
              interval is wide by construction — it narrows as the ledger grows. Treat the point forecast as a planning
              figure, not a promise.
            </p>
          </section>

          {/* 2 · CAPEX RANKING */}
          <section className={`col-span-12 rounded-2xl p-5 lg:col-span-4 ${s.panel}`}>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]">
              <Container size={15} className="text-amber-400" /> Buy next
            </h2>
            <p className={`mb-3 text-xs ${s.sub}`}>Capex priority = class utilization × demand share</p>
            <div className="space-y-3">
              {model.capex.map((f, rank) => (
                <div key={f.size} className={`rounded-xl px-3.5 py-3 ${s.chip} ${rank === 0 ? "ring-1 ring-amber-400/40" : ""}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold tabular-nums">
                      {rank + 1}. {f.size}
                      {rank === 0 && (
                        <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                          Priority
                        </span>
                      )}
                    </span>
                    <span className={`text-xs tabular-nums ${s.sub}`}>score {(f.score * 100).toFixed(1)}</span>
                  </div>
                  <div className={`mt-1.5 flex justify-between text-[11px] tabular-nums ${s.faint}`}>
                    <span>util {pct(f.util)}</span>
                    <span>demand share {pct(f.share)}</span>
                    <span>{f.deployed}/{f.owned} out</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, f.util * 100)}%`,
                      background: f.util >= 0.9 ? "linear-gradient(90deg,#fbbf24,#ea580c)" : "linear-gradient(90deg,#22d3ee,#0891b2)",
                    }} />
                  </div>
                </div>
              ))}
            </div>
            <p className={`mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed ${s.faint}`}>
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400" />
              Blind spot: fulfilled demand only. Phone-quotes turned away for lack of stock aren&apos;t in the ledger —
              log declined orders to sharpen this ranking.
            </p>
          </section>

          {/* 3 · DEMAND MIX */}
          <section className={`col-span-12 rounded-2xl p-5 lg:col-span-7 ${s.panel}`}>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Demand mix by skip size</h2>
            <p className={`mb-2 text-xs ${s.sub}`}>Skips hired per month, parsed from invoice line items</p>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={model.mix} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={s.grid} vertical={false} />
                  <XAxis dataKey="m" stroke={s.axis} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} dy={6} />
                  <YAxis stroke={s.axis} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {Object.keys(SIZE_COLORS).map((size) => (
                    <Bar key={size} dataKey={size} stackId="mix" fill={SIZE_COLORS[size]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* 4 · CLIENT CONCENTRATION */}
          <section className={`col-span-12 rounded-2xl p-5 lg:col-span-5 ${s.panel}`}>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]">
              <Users size={15} className="text-amber-400" /> Client concentration
            </h2>
            <p className={`mb-3 text-xs ${s.sub}`}>
              Top-5 clients = <span className="font-bold tabular-nums">{pct(model.top5Share)}</span> of ad-hoc revenue ·
              HHI <span className="font-bold tabular-nums">{model.hhi}</span>{" "}
              ({model.hhi < 1500 ? "diversified" : model.hhi < 2500 ? "moderately concentrated" : "concentrated — key-client risk"})
            </p>
            <div className="space-y-2">
              {model.clients.map((c) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="w-36 truncate text-xs font-medium">{c.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                      style={{ width: `${Math.max(2, c.share * 100)}%` }} />
                  </div>
                  <span className={`w-20 text-right text-xs tabular-nums ${s.sub}`}>{zar.format(c.rev)}</span>
                  <span className={`w-12 text-right text-[11px] tabular-nums ${s.faint}`}>{pct(c.share)}</span>
                </div>
              ))}
            </div>
            <p className={`mt-3 text-[11px] leading-relaxed ${s.faint}`}>
              HHI = Σ(shareᵢ×100)². Above 2500, losing one client materially dents the month — the standard hedge is
              converting top ad-hoc clients to contracts, which moves them into guaranteed MRR.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}  