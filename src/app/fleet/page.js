"use client";

/**
 * FLEET — src/app/fleet/page.js
 * Owned counts now come LIVE from skip_fleet (Settings edits them).
 * DEPLOYED is derived from uncollected invoices. Realtime: updates as
 * invoices/skip_fleet change.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  Truck, Loader2, RefreshCw, AlertTriangle, Container,
  Warehouse, Gauge, CircleDot, XCircle, Radio,
} from "lucide-react";

/* fallback — used only if skip_fleet is empty */
const FALLBACK_FLEET = [
  { size: "2m³", label: "Mini", owned: 12 },
  { size: "3m³", label: "Midi", owned: 14 },
  { size: "6m³", label: "Builders", owned: 22 },
  { size: "9m³", label: "Maxi", owned: 10 },
];
const STANDARD_RENTAL_DAYS = 7;
const DAY = 86_400_000;

const T = {
  dark: {
    panel: "bg-white/[0.035] border border-white/[0.07] backdrop-blur-xl",
    sub: "text-zinc-400", faint: "text-zinc-500", hairline: "border-white/[0.07]",
    divide: "divide-white/[0.05]", chip: "bg-white/[0.05] border border-white/[0.08]",
    button: "bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-zinc-300",
    cellIdle: "rgba(255,255,255,0.06)",
  },
  light: {
    panel: "bg-white border border-zinc-200 shadow-sm",
    sub: "text-zinc-500", faint: "text-zinc-400", hairline: "border-zinc-200",
    divide: "divide-zinc-100", chip: "bg-zinc-100 border border-zinc-200",
    button: "bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600",
    cellIdle: "rgba(0,0,0,0.07)",
  },
};

function parseItems(items) {
  if (!items) return [];
  const out = [];
  const re = /(\d+)\s*[x×]\s*(\d(?:\.\d)?)m³/gi;
  let m;
  while ((m = re.exec(items)) !== null) out.push({ size: `${m[2]}m³`, qty: Number(m[1]) });
  if (out.length === 0) {
    const single = items.match(/(\d(?:\.\d)?)m³/);
    if (single) out.push({ size: `${single[1]}m³`, qty: 1 });
  }
  return out;
}

export default function FleetPage() {
  const { dark } = useTheme();
  const s = T[dark ? "dark" : "light"];

  const [open, setOpen] = useState([]);     // uncollected invoices = skips on site
  const [fleet, setFleet] = useState(FALLBACK_FLEET);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [pulse, setPulse] = useState(false);

  const load = useCallback(async () => {
    const [inv, sf] = await Promise.all([
      supabase.from("invoices").select("id, client, date, items")
        .eq("collected", false).eq("voided", false).order("date").range(0, 19999),
      supabase.from("skip_fleet").select("size, label, owned").order("size"),
    ]);
    if (inv.error) setToast({ type: "error", msg: inv.error.message });
    if (sf.data && sf.data.length) setFleet(sf.data);
    setOpen(
      (inv.data ?? []).map((r) => ({
        ...r,
        days: Math.max(0, Math.floor((Date.now() - new Date(r.date).getTime()) / DAY)),
        parsed: parseItems(r.items),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* realtime: re-pull when invoices or fleet change */
  useEffect(() => {
    const flash = () => { setPulse(true); setTimeout(() => setPulse(false), 1200); };
    const channel = supabase
      .channel("fleet-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => { load(); flash(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "skip_fleet" }, () => { load(); flash(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const model = useMemo(() => {
    const deployed = {};
    for (const r of open) for (const { size, qty } of r.parsed) {
      deployed[size] = (deployed[size] ?? 0) + qty;
    }
    const sizes = fleet.map((f) => {
      const owned = Number(f.owned || 0);
      const dep = deployed[f.size] ?? 0;
      const out = Math.min(dep, owned);
      const over = dep > owned;
      return { size: f.size, label: f.label || f.size, owned, out, inYard: owned - out, ratio: owned > 0 ? out / owned : 0, over };
    });
    const totalOwned = sizes.reduce((sum, f) => sum + f.owned, 0) || 1;
    const totalOut = sizes.reduce((sum, f) => sum + f.out, 0);
    const overdue = open.filter((r) => r.days > STANDARD_RENTAL_DAYS).length;
    return { sizes, totalOwned, totalOut, util: totalOut / totalOwned, overdue, anyOver: sizes.some((f) => f.over) };
  }, [open, fleet]);

  const critical = model.util > 0.85;

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
              <Truck size={20} className="text-amber-400" /> Fleet
            </h1>
            <p className={`mt-1 flex items-center gap-1.5 text-xs ${s.sub}`}>
              Deployment derived live from the ledger — an uncollected invoice is a skip on a site
              <span className={`ml-1 flex items-center gap-1 transition-opacity ${pulse ? "opacity-100" : "opacity-60"}`}>
                <Radio size={11} className={pulse ? "text-emerald-400" : "text-zinc-500"} />
                <span className={pulse ? "text-emerald-400" : "text-zinc-500"}>live</span>
              </span>
            </p>
          </div>
          <button onClick={load} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${s.button}`}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className={`relative overflow-hidden rounded-2xl p-4 ${s.panel} ${critical ? "!border-amber-500/40" : ""}`}>
            {critical && <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/[0.12] to-transparent" />}
            <p className={`relative flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] ${critical ? "text-amber-400" : s.sub}`}>
              Utilization <Gauge size={15} className="text-amber-400" />
            </p>
            <p className="relative mt-1.5 text-2xl font-bold tabular-nums">{(model.util * 100).toFixed(1)}%</p>
            {critical && (
              <p className="relative mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                <AlertTriangle size={11} /> Capacity critical
              </p>
            )}
          </div>
          <div className={`rounded-2xl p-4 ${s.panel}`}>
            <p className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] ${s.sub}`}>
              On site <Container size={15} className="text-amber-400" />
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums">{model.totalOut}<span className={`text-sm font-semibold ${s.faint}`}>/{model.totalOwned}</span></p>
            <p className={`mt-0.5 text-xs ${s.faint}`}>earning right now</p>
          </div>
          <div className={`rounded-2xl p-4 ${s.panel}`}>
            <p className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] ${s.sub}`}>
              In yard <Warehouse size={15} className="text-amber-400" />
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums">{model.totalOwned - model.totalOut}</p>
            <p className={`mt-0.5 text-xs ${s.faint}`}>available to dispatch</p>
          </div>
          <div className={`rounded-2xl p-4 ${s.panel}`}>
            <p className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] ${s.sub}`}>
              Past {STANDARD_RENTAL_DAYS}-day window <AlertTriangle size={15} className={model.overdue ? "text-rose-400" : "text-amber-400"} />
            </p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${model.overdue ? "text-rose-400" : ""}`}>{model.overdue}</p>
            <p className={`mt-0.5 text-xs ${s.faint}`}>on the run sheet for collection</p>
          </div>
        </div>

        {model.anyOver && (
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-500/[0.1] px-3.5 py-2.5 text-xs font-medium text-rose-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            The ledger shows more skips deployed than owned for at least one size — either an old invoice was never
            marked collected, or the owned counts in Settings are stale. Worth a 2-minute reconciliation.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <section className={`rounded-2xl p-5 lg:col-span-3 ${s.panel}`}>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Dispatch board</h2>
            <p className={`mb-2 text-xs ${s.sub}`}>One cell = one physical skip</p>
            <div className={`divide-y ${s.divide}`}>
              {model.sizes.map((f) => {
                const hot = f.ratio >= 0.9;
                return (
                  <div key={f.size} className="py-3.5 first:pt-1 last:pb-1">
                    <div className="mb-2 flex items-baseline justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-bold tabular-nums">{f.size}</span>
                        <span className={`text-xs ${s.faint}`}>{f.label}</span>
                        {hot && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                            At capacity
                          </span>
                        )}
                      </div>
                      <span className={`text-xs tabular-nums ${s.sub}`}>
                        <span className="font-semibold" style={{ color: hot ? "#f59e0b" : "#22d3ee" }}>{f.out}</span> on-site · {f.inYard} in-yard
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: f.owned }).map((_, i) => {
                        const isOut = i < f.out;
                        return (
                          <div key={i} title={isOut ? "On-site" : "In-yard"}
                            className="h-5 flex-1 rounded-[3px] transition-all duration-300"
                            style={{
                              background: isOut
                                ? hot ? "linear-gradient(180deg,#fbbf24,#d97706)" : "linear-gradient(180deg,#22d3ee,#0891b2)"
                                : s.cellIdle,
                            }} />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={`mt-3 flex items-center gap-4 border-t pt-3 text-[11px] ${s.hairline} ${s.faint}`}>
              <span className="flex items-center gap-1.5"><CircleDot size={11} style={{ color: "#22d3ee" }} /> On-site, earning</span>
              <span className="flex items-center gap-1.5"><CircleDot size={11} style={{ color: "#f59e0b" }} /> ≥90% class capacity</span>
            </div>
          </section>

          <section className={`rounded-2xl p-5 lg:col-span-2 ${s.panel}`}>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Deployment register</h2>
            <p className={`mb-3 text-xs ${s.sub}`}>Whose site every open skip is on</p>
            {loading && open.length === 0 ? (
              <div className="grid place-items-center py-12"><Loader2 size={20} className="animate-spin text-amber-400" /></div>
            ) : open.length === 0 ? (
              <p className={`py-8 text-center text-sm ${s.faint}`}>Whole fleet is in the yard.</p>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {open.map((r) => (
                  <div key={r.id} className={`rounded-xl px-3.5 py-2.5 text-xs ${s.chip}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-semibold">{r.client}</p>
                      <span className={`shrink-0 font-bold tabular-nums ${
                        r.days > STANDARD_RENTAL_DAYS + 5 ? "text-rose-400"
                        : r.days > STANDARD_RENTAL_DAYS ? "text-amber-400" : s.faint
                      }`}>{r.days}d</span>
                    </div>
                    <p className={`mt-0.5 truncate ${s.sub}`}>
                      {r.parsed.map((p) => `${p.qty}× ${p.size}`).join(", ") || r.items} · since {r.date}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/[0.12] px-4 py-3 text-sm font-medium text-rose-300 shadow-2xl backdrop-blur-xl">
            <XCircle size={18} /><span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}