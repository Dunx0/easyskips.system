"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  REVENUE PROJECTION — src/components/RevenueProjection.js
 *
 *  Real revenue from Supabase, aggregated by month, with a genuine
 *  least-squares projection + PREDICTION INTERVAL. Subscribes to realtime
 *  so logging an invoice on the dispatch page reshapes this chart live.
 *
 *  THE STATS (honest version):
 *   · MRR is deterministic — contracts recur — so it's the known floor and
 *     is forward-filled flat. We do NOT put an uncertainty band on it.
 *   · Ad-hoc revenue is the stochastic part. We fit ordinary least squares
 *     (OLS) to the monthly ad-hoc history, then build a PREDICTION INTERVAL
 *     for a future month x₀:
 *         ŷ₀ ± t(α/2, n−2) · s · √( 1 + 1/n + (x₀−x̄)² / Sxx )
 *     - s  = residual standard error = √(SSE/(n−2))
 *     - the √(…) leverage term WIDENS the cone the further you extrapolate
 *       (that's the statistically correct flare, not a cosmetic choice)
 *     - t(α/2, n−2) uses the Student-t distribution (correct for small n),
 *       not the normal z — see T_TABLE below.
 *   · Projected total = forward MRR + ad-hoc trend; band = same ± the PI.
 *
 *  Requires: supabase invoices(date, amount, collected), contracts(mrr, since).
 *  Realtime must be enabled on those tables in Supabase (see notes in chat).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

/* ══════════════════════════════════════════════════════════════════════════
   TUNABLE PARAMETERS  — change these to reshape the projection
   ══════════════════════════════════════════════════════════════════════════ */
const CONFIDENCE     = 80;     // 80 | 90 | 95  → coverage of the band (higher = wider)
const HORIZON_MONTHS = 3;      // how many months to project forward
const MIN_HISTORY    = 3;      // months of real data required before a projection shows
const CLAMP_FLOOR    = true;   // don't let the ad-hoc band dip below R0 (revenue can't be negative)

/* ── Student-t two-sided critical values, t(α/2, df). df 1..30, then z. ──────
   Columns map to CONFIDENCE: 80% → α/2=.10, 90% → .05, 95% → .025          */
const T_TABLE = {
  80: [3.078,1.886,1.638,1.533,1.476,1.440,1.415,1.397,1.383,1.372,1.363,1.356,1.350,1.345,1.341,1.337,1.333,1.330,1.328,1.325,1.323,1.321,1.319,1.318,1.316,1.315,1.314,1.313,1.311,1.310],
  90: [6.314,2.920,2.353,2.132,2.015,1.943,1.895,1.860,1.833,1.812,1.796,1.782,1.771,1.761,1.753,1.746,1.740,1.734,1.729,1.725,1.721,1.717,1.714,1.711,1.708,1.706,1.703,1.701,1.699,1.697],
  95: [12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.160,2.145,2.131,2.120,2.110,2.101,2.093,2.086,2.080,2.074,2.069,2.064,2.060,2.056,2.052,2.048,2.045,2.042],
};
const Z = { 80: 1.282, 90: 1.645, 95: 1.960 };
const tCrit = (df) => (df >= 1 && df <= 30 ? T_TABLE[CONFIDENCE][df - 1] : Z[CONFIDENCE]);

const ACCENT = { mrr: "#22d3ee", total: "#f59e0b", proj: "#2e196e" };
const zar = (n) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n || 0);
const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (key) => {
  const [y, m] = key.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });
};

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */
export default function RevenueProjection() {
  const { dark } = useTheme();
  const [invoices, setInvoices] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [ready, setReady] = useState(false);
  const [pulse, setPulse] = useState(false); // brief flash when realtime updates

  const fetchAll = useCallback(async () => {
    const [inv, ctr] = await Promise.all([
      supabase.from("invoices").select("date, amount, collected"),
      supabase.from("contracts").select("mrr, since"),
    ]);
    setInvoices(inv.data ?? []);
    setContracts(ctr.data ?? []);
    setReady(true);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* realtime: any change to invoices/contracts re-aggregates the chart */
  useEffect(() => {
    const channel = supabase
      .channel("revenue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        fetchAll(); setPulse(true); setTimeout(() => setPulse(false), 1200);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  /* ── aggregate + project ─────────────────────────────────────────────── */
  const model = useMemo(() => {
    if (!ready) return null;

    // ad-hoc revenue per month (real invoice amounts)
    const adhocByMonth = {};
    for (const i of invoices) {
      if (!i.date) continue;
      adhocByMonth[monthKey(i.date)] = (adhocByMonth[monthKey(i.date)] ?? 0) + Number(i.amount || 0);
    }
    const months = Object.keys(adhocByMonth).sort();
    if (months.length === 0) return { rows: [], n: 0 };

    // MRR in force for a given month = contracts started on/before that month
    const mrrInForce = (key) => {
      const end = new Date(+key.split("-")[0], +key.split("-")[1], 0); // last day of month
      return contracts.reduce((s, c) =>
        s + (!c.since || new Date(c.since) <= end ? Number(c.mrr || 0) : 0), 0);
    };
    const currentMRR = contracts.reduce((s, c) => s + Number(c.mrr || 0), 0);

    // historical rows
    const hist = months.map((key, i) => {
      const adhoc = adhocByMonth[key];
      const mrr = mrrInForce(key);
      return { key, label: monthLabel(key), x: i, mrr, adhoc, total: mrr + adhoc, projected: false };
    });

    const n = hist.length;
    if (n < MIN_HISTORY) return { rows: hist, n, tooFew: true };

    // OLS on ad-hoc: y = a + b·x
    const xs = hist.map((r) => r.x), ys = hist.map((r) => r.adhoc);
    const xBar = xs.reduce((s, v) => s + v, 0) / n;
    const yBar = ys.reduce((s, v) => s + v, 0) / n;
    let Sxy = 0, Sxx = 0;
    for (let i = 0; i < n; i++) { Sxy += (xs[i] - xBar) * (ys[i] - yBar); Sxx += (xs[i] - xBar) ** 2; }
    const b = Sxy / Sxx, a = yBar - b * xBar;
    const SSE = ys.reduce((s, y, i) => s + (y - (a + b * xs[i])) ** 2, 0);
    const s = Math.sqrt(SSE / (n - 2));        // residual standard error
    const t = tCrit(n - 2);

    // bridge: last historical point also seeds the projection series
    const bridge = hist[n - 1];
    const rows = hist.map((r) => ({ ...r, projTotal: null, band: null }));
    rows[n - 1] = { ...bridge, projTotal: bridge.total, band: [bridge.total, bridge.total] };

    // projection
    const lastKey = months[n - 1];
    for (let h = 1; h <= HORIZON_MONTHS; h++) {
      const x0 = (n - 1) + h;
      const yHat = a + b * x0;                                   // ad-hoc point forecast
      const sePred = s * Math.sqrt(1 + 1 / n + (x0 - xBar) ** 2 / Sxx); // prediction SE
      const half = t * sePred;
      let loAd = yHat - half, hiAd = yHat + half, midAd = yHat;
      if (CLAMP_FLOOR) { loAd = Math.max(0, loAd); midAd = Math.max(0, midAd); }

      const d = new Date(+lastKey.split("-")[0], +lastKey.split("-")[1] - 1 + h, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      rows.push({
        key, label: monthLabel(key), x: x0,
        mrr: currentMRR, adhoc: null, total: null, projected: true,
        projTotal: currentMRR + midAd,
        band: [currentMRR + loAd, currentMRR + hiAd],
        midAdhoc: midAd,
      });
    }

    return { rows, n, a, b, s, t, slope: b, lastActualLabel: bridge.label, currentMRR };
  }, [invoices, contracts, ready]);

  const T = dark
    ? { grid: "rgba(255,255,255,0.06)", axis: "#71717a", tipBg: "rgba(18,18,24,0.94)", tipBorder: "rgba(255,255,255,0.12)", tipText: "#fafafa", dot: "#0F0F13" }
    : { grid: "rgba(0,0,0,0.07)", axis: "#a1a1aa", tipBg: "rgba(255,255,255,0.97)", tipBorder: "rgba(0,0,0,0.08)", tipText: "#18181b", dot: "#fff" };

  if (!model) return <div className="grid h-[340px] place-items-center text-xs text-zinc-500">Loading revenue…</div>;
  if (model.tooFew)
    return (
      <div className="grid h-[340px] place-items-center text-center text-xs text-zinc-500">
        <div>
          <p>Need at least {MIN_HISTORY} months of invoices to project.</p>
          <p className="mt-1 opacity-70">{model.n} month{model.n !== 1 ? "s" : ""} of data so far.</p>
        </div>
      </div>
    );

  const Tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload; if (!d) return null;
    const adhoc = d.projected ? d.midAdhoc ?? 0 : d.adhoc ?? 0;
    const [lo, hi] = d.band ?? [null, null];
    return (
      <div className="rounded-xl px-4 py-3 text-sm" style={{ background: T.tipBg, border: `1px solid ${T.tipBorder}`, color: T.tipText }}>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest opacity-60">
          {label}{d.projected && <span className="rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: ACCENT.proj + "33", color: ACCENT.proj }}>forecast</span>}
        </p>
        <div className="flex justify-between gap-8 tabular-nums"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: ACCENT.mrr }} />MRR</span><span className="font-semibold">{zar(d.mrr)}</span></div>
        <div className="mt-1 flex justify-between gap-8 tabular-nums"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: ACCENT.total }} />{d.projected ? "Ad-hoc (trend)" : "Ad-hoc"}</span><span className="font-semibold">{zar(adhoc)}</span></div>
        <div className="mt-2 flex justify-between gap-8 border-t pt-2 tabular-nums" style={{ borderColor: T.tipBorder }}><span className="text-xs uppercase opacity-60">Total</span><span className="font-bold">{zar(d.mrr + adhoc)}</span></div>
        {d.projected && lo != null && (
          <p className="mt-1.5 text-[11px] opacity-70">{CONFIDENCE}% interval: {zar(lo)} – {zar(hi)}</p>
        )}
      </div>
    );
  };

  const trendWord = model.slope > 0 ? "rising" : model.slope < 0 ? "declining" : "flat";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="text-zinc-500">
          OLS trend · ad-hoc {trendWord} {zar(Math.abs(model.slope))}/mo · {CONFIDENCE}% prediction band
        </span>
        <span className={`flex items-center gap-1.5 transition-opacity ${pulse ? "opacity-100" : "opacity-50"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${pulse ? "bg-emerald-400" : "bg-zinc-500"}`} />
          <span className="text-zinc-500">live</span>
        </span>
      </div>
      <div className="h-[316px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={model.rows} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT.total} stopOpacity={dark ? 0.45 : 0.3} />
                <stop offset="100%" stopColor={ACCENT.total} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gMrr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT.mrr} stopOpacity={dark ? 0.35 : 0.28} />
                <stop offset="100%" stopColor={ACCENT.mrr} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT.proj} stopOpacity={0.22} />
                <stop offset="100%" stopColor={ACCENT.proj} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={T.grid} vertical={false} />
            <XAxis dataKey="label" stroke={T.axis} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} dy={6} />
            <YAxis stroke={T.axis} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} width={52} />
            <Tooltip cursor={{ stroke: T.axis, strokeDasharray: "3 3" }} content={<Tip />} />
            <ReferenceLine x={model.lastActualLabel} stroke={ACCENT.proj} strokeDasharray="4 4" strokeOpacity={0.5}
              label={{ value: "FORECAST →", position: "insideTopRight", fill: ACCENT.proj, fontSize: 9, fontWeight: 700 }} />

            {/* prediction band (projection months only) */}
            <Area type="monotone" dataKey="band" stroke="none" fill="url(#gBand)" connectNulls isAnimationActive={false} activeDot={false} />
            {/* MRR floor (guaranteed) */}
            <Area type="monotone" dataKey="mrr" stroke={ACCENT.mrr} strokeWidth={1.5} fill="url(#gMrr)" dot={false} isAnimationActive={false} />
            {/* total actual */}
            <Area type="monotone" dataKey="total" stroke={ACCENT.total} strokeWidth={2.5} fill="url(#gTotal)"
              dot={{ r: 2.5, fill: ACCENT.total, strokeWidth: 0 }} activeDot={{ r: 5, fill: ACCENT.total, stroke: T.dot, strokeWidth: 2 }} isAnimationActive={false} />
            {/* projected total (dashed) */}
            <Line type="monotone" dataKey="projTotal" stroke={ACCENT.proj} strokeWidth={2} strokeDasharray="5 4"
              dot={false} activeDot={{ r: 4, fill: ACCENT.proj, stroke: T.dot, strokeWidth: 2 }} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}