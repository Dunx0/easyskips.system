"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DAILY RUN SHEET — apps/dispatch/src/app/runsheet/page.js
 *
 *  The page the yard actually uses each morning:
 *    DELIVERIES  = scheduled orders with delivery_date = today (or overdue)
 *    COLLECTIONS = invoices past the 7-day standard hire, not yet collected
 *  Sorted by suburb so the route roughly plans itself. One print button →
 *  a clean monochrome A4 sheet for the driver's clipboard.
 *
 *  Add to AppShell NAV:  { href: "/runsheet", label: "Run Sheet", icon: ClipboardList }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  ClipboardList, Truck, Undo2, Printer, RefreshCw, Loader2,
  Phone, MapPin, CheckCircle2, XCircle,
} from "lucide-react";

const STANDARD_RENTAL_DAYS = 7;
const DAY = 86_400_000;
const todayISO = () => new Date().toISOString().slice(0, 10);
const longToday = () =>
  new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const T = {
  dark: {
    panel: "bg-white/[0.035] border border-white/[0.07] backdrop-blur-xl",
    sub: "text-zinc-400", faint: "text-zinc-500", hairline: "border-white/[0.07]",
    divide: "divide-white/[0.05]", chip: "bg-white/[0.05] border border-white/[0.08]",
    button: "bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-zinc-300",
  },
  light: {
    panel: "bg-white border border-zinc-200 shadow-sm",
    sub: "text-zinc-500", faint: "text-zinc-400", hairline: "border-zinc-200",
    divide: "divide-zinc-100", chip: "bg-zinc-100 border border-zinc-200",
    button: "bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600",
  },
};

export default function RunSheetPage() {
  const { dark } = useTheme();
  const s = T[dark ? "dark" : "light"];

  const [deliveries, setDeliveries] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - STANDARD_RENTAL_DAYS * DAY).toISOString().slice(0, 10);

    const [del, col] = await Promise.all([
      // scheduled orders due today or earlier (missed yesterday's = still on the sheet)
      supabase.from("orders").select("*")
        .eq("status", "scheduled")
        .lte("delivery_date", todayISO())
        .order("suburb"),
      // skips out past standard hire, not collected
      supabase.from("invoices").select("*")
        .eq("collected", false)
        .lte("date", cutoff)
        .order("date"),
    ]);

    if (del.error || col.error) {
      setToast({ type: "error", msg: (del.error || col.error).message });
    }
    setDeliveries(del.data ?? []);
    setCollections(
      (col.data ?? []).map((r) => ({
        ...r,
        daysOut: Math.floor((Date.now() - new Date(r.date).getTime()) / DAY),
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

  /* mark a delivery done (order → delivered) */
  async function markDelivered(order) {
    const { error } = await supabase.from("orders").update({ status: "delivered" }).eq("id", order.id);
    if (error) return setToast({ type: "error", msg: error.message });
    setDeliveries((prev) => prev.filter((o) => o.id !== order.id));
    setToast({ type: "success", msg: `Delivered — ${order.name}, ${order.suburb}` });
  }

  /* mark a collection done (invoice.collected = true) */
  async function markCollected(inv) {
    const { error } = await supabase.from("invoices").update({ collected: true }).eq("id", inv.id);
    if (error) return setToast({ type: "error", msg: error.message });
    setCollections((prev) => prev.filter((r) => r.id !== inv.id));
    setToast({ type: "success", msg: `Collected — ${inv.client}` });
  }

  const totalStops = deliveries.length + collections.length;

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1000px]">
        {/* ── HEADER (screen) ─────────────────────────────────────────── */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
              <ClipboardList size={20} className="text-amber-400" /> Daily Run Sheet
            </h1>
            <p className={`mt-1 text-xs ${s.sub}`}>
              {longToday()} · {totalStops} stop{totalStops === 1 ? "" : "s"} ({deliveries.length} deliveries, {collections.length} collections)
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${s.button}`}>
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 px-3.5 py-2 text-xs font-bold text-[#0F0F13] hover:brightness-105">
              <Printer size={13} /> Print run sheet
            </button>
          </div>
        </header>

        {loading ? (
          <div className={`grid place-items-center rounded-2xl py-16 print:hidden ${s.panel}`}>
            <Loader2 size={22} className="animate-spin text-amber-400" />
          </div>
        ) : (
          /* id used by print CSS — everything inside prints, chrome doesn't */
          <div id="print-doc" className="space-y-4 print:space-y-6 print:text-zinc-900">
            {/* print-only letterhead */}
            <div className="hidden print:block">
              <h1 className="text-xl font-extrabold">Run Sheet — {longToday()}</h1>
              <p className="text-xs text-zinc-500">
                {deliveries.length} deliveries · {collections.length} collections · Driver: ______________ · Vehicle: ______________
              </p>
            </div>

            {/* ── DELIVERIES ───────────────────────────────────────────── */}
            <section className={`rounded-2xl p-5 print:rounded-none print:border-0 print:p-0 ${s.panel}`}>
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] print:text-zinc-900">
                <Truck size={15} className="text-amber-400" /> Deliveries ({deliveries.length})
              </h2>
              {deliveries.length === 0 ? (
                <p className={`mt-3 text-sm ${s.faint}`}>No deliveries scheduled for today.</p>
              ) : (
                <div className={`mt-2 divide-y ${s.divide} print:divide-zinc-200`}>
                  {deliveries.map((o, i) => (
                    <div key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className={`w-6 text-sm font-extrabold tabular-nums ${s.faint} print:text-zinc-900`}>{i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold print:text-zinc-900">
                          {o.name} — <span className="font-bold">{o.size}</span> ({o.hire})
                          {o.delivery_date < todayISO() && (
                            <span className="ml-2 rounded-full bg-rose-500/12 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-400 ring-1 ring-rose-500/25 print:ring-0">
                              carried over
                            </span>
                          )}
                        </p>
                        <p className={`flex flex-wrap items-center gap-x-3 text-xs ${s.sub} print:text-zinc-600`}>
                          <span className="flex items-center gap-1"><MapPin size={11} /> {o.address}, {o.suburb}</span>
                          <a href={`tel:${o.phone}`} className="flex items-center gap-1 text-amber-400 print:text-zinc-600"><Phone size={11} /> {o.phone}</a>
                          {o.notes && <span className="italic">「{o.notes}」</span>}
                        </p>
                      </div>
                      <button onClick={() => markDelivered(o)}
                        className="rounded-lg bg-emerald-500/12 px-3 py-1.5 text-[11px] font-bold text-emerald-400 ring-1 ring-emerald-500/25 hover:bg-emerald-500/20 print:hidden">
                        Delivered ✓
                      </button>
                      <span className="hidden h-5 w-5 rounded border border-zinc-400 print:block" />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── COLLECTIONS ──────────────────────────────────────────── */}
            <section className={`rounded-2xl p-5 print:rounded-none print:border-0 print:p-0 ${s.panel}`}>
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] print:text-zinc-900">
                <Undo2 size={15} className="text-cyan-400" /> Collections due ({collections.length})
              </h2>
              {collections.length === 0 ? (
                <p className={`mt-3 text-sm ${s.faint}`}>Nothing past the {STANDARD_RENTAL_DAYS}-day window. Yard is clean.</p>
              ) : (
                <div className={`mt-2 divide-y ${s.divide} print:divide-zinc-200`}>
                  {collections.map((r, i) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className={`w-6 text-sm font-extrabold tabular-nums ${s.faint} print:text-zinc-900`}>{i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold print:text-zinc-900">{r.client} — {r.items}</p>
                        <p className={`text-xs tabular-nums ${s.sub} print:text-zinc-600`}>
                          delivered {r.date} ·{" "}
                          <span className={r.daysOut > STANDARD_RENTAL_DAYS + 5 ? "font-bold text-rose-400 print:text-zinc-900" : "font-semibold text-amber-400 print:text-zinc-900"}>
                            {r.daysOut} days out
                          </span>
                          {r.driver && <> · delivered by {r.driver}</>}
                        </p>
                      </div>
                      <button onClick={() => markCollected(r)}
                        className="rounded-lg bg-cyan-500/12 px-3 py-1.5 text-[11px] font-bold text-cyan-400 ring-1 ring-cyan-500/25 hover:bg-cyan-500/20 print:hidden">
                        Collected ✓
                      </button>
                      <span className="hidden h-5 w-5 rounded border border-zinc-400 print:block" />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* print isolation */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-doc, #print-doc * { visibility: visible; }
          #print-doc { position: absolute; inset: 0; width: 100%; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 print:hidden">
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