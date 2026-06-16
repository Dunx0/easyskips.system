"use client";

/**
 * DASHBOARD — src/app/page.js  (the "/" route, your live dashboard)
 * Live Supabase data. Revenue Engine chart + projection via RevenueProjection.
 * Requires: src/components/RevenueProjection.js
 */

import RevenueProjection from "@/components/RevenueProjection";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  Truck, Wallet, Clock4, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Layers, CalendarDays, Radio, MapPin,
} from "lucide-react";

const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
const ACCENT = { mrr: "#22d3ee", adhoc: "#f59e0b", ok: "#34d399", danger: "#fb7185" };

const T = {
  dark: {
    page: "text-zinc-100",
    panel: "bg-white/[0.035] border border-white/[0.07] backdrop-blur-xl",
    cardCritical: "!border-amber-500/50 shadow-[0_0_40px_-12px_rgba(245,158,11,0.45)]",
    sub: "text-zinc-400", faint: "text-zinc-500", hairline: "border-white/[0.07]",
    chip: "bg-white/[0.05] border border-white/[0.08]",
    iconBox: "bg-white/[0.06] text-zinc-300",
    track: "bg-white/[0.06]",
  },
  light: {
    page: "text-zinc-800",
    panel: "bg-white border border-zinc-200/80 shadow-sm",
    cardCritical: "!border-amber-500/60 shadow-[0_2px_24px_-8px_rgba(245,158,11,0.4)]",
    sub: "text-zinc-600", faint: "text-zinc-400", hairline: "border-zinc-200/80",
    chip: "bg-zinc-100 border border-zinc-200",
    iconBox: "bg-zinc-100 text-zinc-600",
    track: "bg-zinc-200/70",
  },
};

const DEMO_FLEET = [
  { size: "2m³", label: "Mini", owned: 12, deployed: 9 },
  { size: "3m³", label: "Midi", owned: 14, deployed: 13 },
  { size: "6m³", label: "Builders", owned: 22, deployed: 20 },
  { size: "9m³", label: "Maxi", owned: 10, deployed: 9 },
];

function parseQty(items) {
  if (!items) return [];
  const out = []; const re = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)m³/gi; let m;
  while ((m = re.exec(items)) !== null) out.push({ size: `${m[2]}m³`, qty: +m[1] });
  if (!out.length) { const sm = items.match(/(\d+(?:\.\d+)?)m³/); if (sm) out.push({ size: `${sm[1]}m³`, qty: 1 }); }
  return out;
}

function KpiCard({ t, icon: Icon, label, value, delta, deltaUp, footnote, critical }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 transition-colors ${t.panel} ${critical ? t.cardCritical : ""}`}>
      {critical && <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/[0.1] to-transparent" />}
      <div className="relative flex items-start justify-between">
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${critical ? "text-amber-500" : t.sub}`}>{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${critical ? "bg-amber-500/15 text-amber-500" : t.iconBox}`}><Icon size={20} /></div>
      </div>
      <div className="relative mt-3 flex items-center gap-2 text-xs">
        {critical ? (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-500">
            <AlertTriangle size={12} /> CAPACITY CRITICAL — order/repair stock
          </span>
        ) : (
          <>
            <span className={`flex items-center gap-0.5 font-semibold tabular-nums ${deltaUp ? "text-emerald-500" : "text-rose-500"}`}>
              {deltaUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{delta}
            </span>
            <span className={t.faint}>{footnote}</span>
          </>
        )}
      </div>
    </div>
  );
}

function CapacityBar({ t, fleet }) {
  const ratio = fleet.owned > 0 ? fleet.deployed / fleet.owned : 0;
  const free = fleet.owned - fleet.deployed;
  const hot = ratio >= 0.9;
  const pct = Math.min(100, ratio * 100);
  return (
    <div className="py-2.5">
      <div className="mb-1.5 flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tabular-nums">{fleet.size}</span>
          <span className={`text-xs ${t.faint}`}>{fleet.label}</span>
          {hot && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500">At capacity</span>}
        </div>
        <span className={`text-xs tabular-nums ${t.sub}`}>
          <span className="font-bold" style={{ color: hot ? ACCENT.adhoc : ACCENT.mrr }}>{fleet.deployed}</span>
          <span className={t.faint}>/{fleet.owned} out · </span>
          <span className={free === 0 ? "font-bold text-rose-500" : ""}>{free} free</span>
        </span>
      </div>
      <div className={`h-2.5 w-full overflow-hidden rounded-full ${t.track}`}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: hot ? "linear-gradient(90deg,#fbbf24,#ea580c)" : "linear-gradient(90deg,#22d3ee,#0891b2)" }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { dark } = useTheme();
  const t = T[dark ? "dark" : "light"];

  const [invoices, setInvoices] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [skipFleet, setSkipFleet] = useState([]);

  useEffect(() => {
    (async () => {
      const [inv, ctr, sf] = await Promise.all([
        supabase.from("invoices").select("client,date,items,amount,banked,collected").eq("voided",false),
        supabase.from("contracts").select("client,site,skips,size,mrr"),
        supabase.from("skip_fleet").select("size,label,owned").order("size"),
      ]);
      setInvoices(inv.data ?? []);
      setContracts(ctr.data ?? []);
      setSkipFleet(sf.data ?? []);
    })();
  }, []);

  const ops = useMemo(() => {
    const inv = invoices ?? [];
    const deployedBySize = {};
    for (const r of inv.filter((x) => !x.collected))
      for (const { size, qty } of parseQty(r.items))
        deployedBySize[size] = (deployedBySize[size] ?? 0) + qty;

    const fleet = (skipFleet.length ? skipFleet : DEMO_FLEET).map((f) => ({
      size: f.size, label: f.label, owned: f.owned,
      deployed: Math.min(f.deployed ?? deployedBySize[f.size] ?? 0, f.owned),
    }));

    const totalOwned = fleet.reduce((s, f) => s + f.owned, 0) || 1;
    const totalDeployed = fleet.reduce((s, f) => s + f.deployed, 0);
    const utilization = (totalDeployed / totalOwned) * 100;

    const mrr = contracts.reduce((s, c) => s + Number(c.mrr || 0), 0);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const adhocMTD = inv
      .filter((i) => i.date && new Date(i.date) >= startOfMonth)
      .reduce((s, i) => s + Number(i.amount || 0), 0);

    const debtors = inv.filter((i) => !i.banked);
    const outstanding = debtors.reduce((s, i) => s + Number(i.amount || 0), 0);

    return { fleet, totalOwned, totalDeployed, utilization, mrr, adhocMTD, totalRevenue: mrr + adhocMTD, outstanding, debtors };
  }, [invoices, contracts, skipFleet]);

  const critical = ops.utilization > 85;
  const donut = [
    { name: "On-site", value: ops.totalDeployed },
    { name: "In-yard", value: Math.max(0, ops.totalOwned - ops.totalDeployed) },
  ];

  return (
    <div className={`px-4 py-6 sm:px-8 ${t.page}`} style={{ fontFeatureSettings: '"tnum" 1' }}>
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">
                SkipCommand <span className={`ml-1.5 text-[10px] font-bold uppercase tracking-[0.2em] ${t.faint}`}>Ops Console · PTA</span>
              </h1>
              <p className={`flex items-center gap-1.5 text-xs ${t.sub}`}>
                <CalendarDays size={12} /> {new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
                <span className={`mx-1 ${t.faint}`}>·</span>
                <Radio size={12} className="text-emerald-500" /><span className="text-emerald-500">Dispatch live</span>
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4">
            <KpiCard t={t} icon={Truck} label="Active Fleet Utilization" value={`${ops.utilization.toFixed(1)}%`} critical={critical} delta="live" deltaUp footnote="on-site / owned" />
          </div>
          <div className="col-span-12 md:col-span-4">
            <KpiCard t={t} icon={Wallet} label="Total Revenue · MRR + Ad-hoc" value={zar.format(ops.totalRevenue)} delta="MTD" deltaUp footnote={`${zar.format(ops.mrr)} contracted base-load`} />
          </div>
          <div className="col-span-12 md:col-span-4">
            <KpiCard t={t} icon={Clock4} label="Outstanding Debtors" value={zar.format(ops.outstanding)} delta={`${ops.debtors.length} invoices`} deltaUp={false} footnote="uncollected / unbanked" />
          </div>

          <section className={`col-span-12 rounded-2xl p-5 lg:col-span-8 ${t.panel}`}>
            <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Revenue Engine</h2>
                <p className={`text-xs ${t.sub}`}>Predictable contract base-load vs stochastic ad-hoc hire · monthly, ZAR</p>
              </div>
              <div className={`flex items-center gap-4 rounded-lg px-3 py-1.5 text-xs ${t.chip}`}>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: ACCENT.mrr }} />Contract MRR</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: ACCENT.adhoc }} />Ad-hoc invoiced</span>
              </div>
            </div>

            <RevenueProjection />

            <div className={`mt-2 grid grid-cols-1 gap-2 border-t pt-4 sm:grid-cols-3 lg:grid-cols-5 ${t.hairline}`}>
              {contracts.slice(0, 5).map((c, i) => (
                <div key={i} className={`rounded-xl px-3 py-2.5 ${t.chip}`}>
                  <p className="truncate text-xs font-semibold">{c.client}</p>
                  <p className={`mt-0.5 flex items-center gap-1 text-[11px] ${t.faint}`}><MapPin size={10} /> {c.site} · {c.skips}× {c.size}</p>
                  <p className="mt-1 text-sm font-bold tabular-nums" style={{ color: ACCENT.mrr }}>{zar.format(c.mrr)}<span className={`text-[10px] font-medium ${t.faint}`}>/mo</span></p>
                </div>
              ))}
            </div>
          </section>

          <section className={`col-span-12 rounded-2xl p-5 lg:col-span-4 ${t.panel}`}>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Skip Capacity</h2>
                <p className={`text-xs ${t.sub}`}>On-site vs available, per size</p>
              </div>
              <Layers size={18} className={t.faint} />
            </div>

            <div className="relative mx-auto h-[150px] w-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    <linearGradient id="gDonutDash" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#ea580c" />
                    </linearGradient>
                  </defs>
                  <Pie data={donut} dataKey="value" innerRadius={52} outerRadius={70} startAngle={90} endAngle={-270} paddingAngle={3} stroke="none">
                    <Cell fill="url(#gDonutDash)" />
                    <Cell fill={dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="text-2xl font-extrabold tabular-nums tracking-tight">{ops.totalDeployed}<span className={`text-sm font-semibold ${t.faint}`}>/{ops.totalOwned}</span></p>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${t.sub}`}>Deployed</p>
                </div>
              </div>
            </div>

            <div className={`mt-3 divide-y ${dark ? "divide-white/[0.06]" : "divide-zinc-100"}`}>
              {ops.fleet.map((f) => <CapacityBar key={f.size} t={t} fleet={f} />)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}