"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ADMIN ORDERS INBOX — apps/dispatch/src/app/orders/page.js
 *
 *  Public orders land here. Admin reviews, adjusts the price (the customer's
 *  quoted_price is indicative ONLY — never trust a number from a public
 *  browser), assigns driver + vehicle, and converts to an invoice in one
 *  click. Conversion = INSERT into invoices + UPDATE orders.status.
 *
 *  Add to AppShell NAV:  { href: "/orders", label: "Orders", icon: Inbox }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  Inbox,
  Phone,
  MapPin,
  CalendarDays,
  Container,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
  ArrowRight,
  NotebookPen,
  X,
} from "lucide-react";

const VEHICLES = ["HZN 442 GP — Hino 500", "JKL 918 GP — Isuzu FTR", "DLM 207 GP — UD Croner"];
const DRIVERS = ["Sipho M.", "Johan v.d. Berg", "Thabo K.", "Pieter S."];

/* Authoritative rate card — server-side truth lives here, not in the browser
   that placed the order */
const RATES = {
  "2m³": { Daily: 450,  Weekly: 1150, Monthly: 3600 },
  "3m³": { Daily: 620,  Weekly: 1680, Monthly: 5200 },
  "6m³": { Daily: 980,  Weekly: 2850, Monthly: 8400 },
  "9m³": { Daily: 1450, Weekly: 4100, Monthly: 11800 },
};

const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
const genInvoiceId = () => `INV-${String(Date.now()).slice(-6)}`;

const T = {
  dark: {
    panel: "bg-white/[0.035] border border-white/[0.07] backdrop-blur-xl",
    sub: "text-zinc-400",
    faint: "text-zinc-500",
    hairline: "border-white/[0.07]",
    chip: "bg-white/[0.05] border border-white/[0.08]",
    input: "bg-white/[0.04] border border-white/[0.09] text-zinc-100 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/15",
    select: "bg-[#16161c] border border-white/[0.09] text-zinc-100 focus:border-amber-400/60",
    button: "bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-zinc-300",
  },
  light: {
    panel: "bg-white border border-zinc-200 shadow-sm",
    sub: "text-zinc-500",
    faint: "text-zinc-400",
    hairline: "border-zinc-200",
    chip: "bg-zinc-100 border border-zinc-200",
    input: "bg-white border border-zinc-300 text-zinc-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15",
    select: "bg-white border border-zinc-300 text-zinc-900 focus:border-amber-500",
    button: "bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600",
  },
};

/* ════════════════════════════════════════════════════════════════════════════
   ORDER CARD
   ════════════════════════════════════════════════════════════════════════════ */

function OrderCard({ s, order, onConverted, onCancelled, setToast }) {
  const suggested = RATES[order.size]?.[order.hire] ?? 0;
  const [price, setPrice] = useState(suggested);
  const [driver, setDriver] = useState(DRIVERS[0]);
  const [vehicle, setVehicle] = useState(VEHICLES[0]);
  const [busy, setBusy] = useState(false);

  const priceMismatch = Number(order.quoted_price) !== suggested;

  async function convert() {
    if (busy) return;
    setBusy(true);
    try {
      // 1 ▸ create the invoice
      const invoice = {
        id: genInvoiceId(),
        client: order.name,
        date: order.delivery_date,
        items: `1× ${order.size} Skip — ${order.suburb}`,
        amount: Number(price) || 0,
        banked: false,
        collected: false,
        hire: order.hire,
        payment: "Account", // confirmed/changed on delivery
        vehicle,
        driver,
      };
      const { error: invErr } = await supabase.from("invoices").insert([invoice]);
      if (invErr) throw new Error(`invoice: ${invErr.message}`);

      // 2 ▸ mark the order scheduled
      const { error: updErr } = await supabase
        .from("orders")
        .update({ status: "scheduled" })
        .eq("id", order.id);
      if (updErr) throw new Error(`order update: ${updErr.message}`);

      setToast({ type: "success", msg: `${invoice.id} created — ${order.name}, ${zar.format(invoice.amount)}, ${driver}` });
      onConverted(order.id);
    } catch (err) {
      setToast({ type: "error", msg: `Conversion failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    setBusy(false);
    if (error) return setToast({ type: "error", msg: `Cancel failed: ${error.message}` });
    setToast({ type: "success", msg: `Order from ${order.name} cancelled` });
    onCancelled(order.id);
  }

  const placedAgo = Math.max(0, Math.round((Date.now() - new Date(order.created_at)) / 36e5));

  return (
    <article className={`rounded-2xl p-5 ${s.panel}`}>
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">{order.name}</h3>
          <p className={`mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${s.sub}`}>
            <a href={`tel:${order.phone}`} className="flex items-center gap-1 font-medium text-amber-400 hover:underline">
              <Phone size={11} /> {order.phone}
            </a>
            <span className="flex items-center gap-1"><MapPin size={11} /> {order.address}, {order.suburb}</span>
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
          placedAgo < 2 ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
        }`}>
          {placedAgo < 1 ? "Just now" : `${placedAgo}h ago`}
        </span>
      </div>

      {/* order facts */}
      <div className={`mt-3 grid grid-cols-3 gap-2 rounded-xl px-3.5 py-2.5 text-xs ${s.chip}`}>
        <span className="flex items-center gap-1.5"><Container size={12} className="text-amber-400" /> {order.size} · {order.hire}</span>
        <span className="flex items-center gap-1.5 tabular-nums"><CalendarDays size={12} className="text-amber-400" /> {order.delivery_date}</span>
        <span className={`flex items-center gap-1.5 tabular-nums ${priceMismatch ? "font-bold text-rose-400" : ""}`}>
          quoted {zar.format(order.quoted_price ?? 0)}
          {priceMismatch && " ⚠"}
        </span>
      </div>
      {order.notes && (
        <p className={`mt-2 flex items-start gap-1.5 text-xs ${s.sub}`}>
          <NotebookPen size={12} className="mt-0.5 shrink-0" /> {order.notes}
        </p>
      )}
      {priceMismatch && (
        <p className="mt-2 text-[11px] font-medium text-rose-400">
          Customer-quoted price doesn&apos;t match the rate card — browser data was tampered with or rates changed. Rate-card price loaded below.
        </p>
      )}

      {/* dispatch controls */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className={`mb-1 block text-[10px] font-semibold uppercase tracking-wider ${s.faint}`}>Price (ZAR)</span>
          <input type="number" min="0" step="50" value={price} onChange={(e) => setPrice(e.target.value)}
            className={`w-full rounded-lg px-3 py-2 text-sm tabular-nums outline-none ${s.input}`} />
        </label>
        <label className="block">
          <span className={`mb-1 block text-[10px] font-semibold uppercase tracking-wider ${s.faint}`}>Driver</span>
          <select value={driver} onChange={(e) => setDriver(e.target.value)} className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${s.select}`}>
            {DRIVERS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={`mb-1 block text-[10px] font-semibold uppercase tracking-wider ${s.faint}`}>Vehicle</span>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${s.select}`}>
            {VEHICLES.map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={convert}
          disabled={busy}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            busy
              ? "cursor-not-allowed bg-amber-500/40 text-[#0F0F13]/60"
              : "bg-gradient-to-br from-amber-400 to-orange-500 text-[#0F0F13] hover:brightness-105"
          }`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          Schedule &amp; invoice
        </button>
        <button
          onClick={cancel}
          disabled={busy}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${s.button}`}
        >
          <Ban size={14} /> Cancel
        </button>
      </div>
    </article>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════════════ */

export default function OrdersInbox() {
  const { dark } = useTheme();
  const s = T[dark ? "dark" : "light"];

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "new")
      .order("created_at", { ascending: false });
    if (error) setToast({ type: "error", msg: `Couldn't load orders: ${error.message}` });
    setOrders(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* live inbox: new public orders appear without a refresh */
  useEffect(() => {
    const channel = supabase
      .channel("orders-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" },
        (payload) => setOrders((prev) => [payload.new, ...prev]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  const remove = (id) => setOrders((prev) => prev.filter((o) => o.id !== id));

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[900px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
              <Inbox size={20} className="text-amber-400" />
              Orders Inbox
              {orders.length > 0 && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-sm font-bold tabular-nums text-amber-400">
                  {orders.length}
                </span>
              )}
            </h1>
            <p className={`mt-1 text-xs ${s.sub}`}>
              Customer orders from the public site — confirm by phone, then schedule &amp; invoice
            </p>
          </div>
          <button onClick={load} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${s.button}`}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </header>

        {loading && orders.length === 0 ? (
          <div className={`grid place-items-center rounded-2xl py-16 ${s.panel}`}>
            <Loader2 size={22} className="animate-spin text-amber-400" />
          </div>
        ) : orders.length === 0 ? (
          <div className={`rounded-2xl py-16 text-center ${s.panel}`}>
            <CheckCircle2 size={26} className="mx-auto text-emerald-400" />
            <p className="mt-3 text-sm font-semibold">Inbox zero</p>
            <p className={`mt-1 text-xs ${s.sub}`}>New public orders will appear here automatically.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <OrderCard key={o.id} s={s} order={o} setToast={setToast} onConverted={remove} onCancelled={remove} />
            ))}
          </div>
        )}
      </div>

      {/* toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div
            role="status"
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-xl ${
              toast.type === "success"
                ? "border-emerald-400/30 bg-emerald-500/[0.12] text-emerald-300"
                : "border-rose-400/30 bg-rose-500/[0.12] text-rose-300"
            }`}
          >
            {toast.type === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>{toast.msg}</span>
            <button onClick={() => setToast(null)} aria-label="Dismiss" className="ml-1 opacity-60 hover:opacity-100">
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}