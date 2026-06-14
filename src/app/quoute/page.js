"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  QUOTES — src/app/quoutes/page.js   (v2 · auto-quoting)
 *  (folder spelled "quoutes" to match your current structure — if you rename
 *   it to "quotes", update the NAV href to match)
 *
 *  Automatic quoting from LIVE business settings:
 *      quote = rates(size, hire)  +  zones(range band).surcharge
 *  Pick size, hire length, and the customer's distance zone — the price
 *  composes itself with a visible breakdown, still editable for negotiated
 *  deals. The printed quotation shows hire and transport as separate line
 *  items. Lifecycle unchanged: sent → accepted/declined → converted.
 *
 *  Requires: business-config.sql (rates + zones tables)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  FileText, Printer, Loader2, CheckCircle2, XCircle, ArrowRight,
  ThumbsUp, ThumbsDown, Plus, User, Container, Banknote, X, RefreshCw,
  MapPin, Calculator,
} from "lucide-react";

const BUSINESS = {
  name: "SkipCommand Waste Solutions",
  tagline: "Skip hire · Rustenburg & surrounds",
  phone: "082 123 4567",
  email: "quotes@yourdomain.co.za",
};

const HIRES = ["Daily", "Weekly", "Monthly"];
const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 });
const zarShort = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
const genQuoteId = () => `QTE-${String(Date.now()).slice(-6)}`;
const genInvoiceId = () => `INV-${String(Date.now()).slice(-6)}`;
const plusDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const T = {
  dark: {
    panel: "bg-white/[0.035] border border-white/[0.07] backdrop-blur-xl",
    sub: "text-zinc-400", faint: "text-zinc-500", hairline: "border-white/[0.07]",
    input: "bg-white/[0.04] border border-white/[0.09] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/15",
    select: "bg-[#16161c] border border-white/[0.09] text-zinc-100 focus:border-amber-400/60",
    button: "bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-zinc-300",
    chip: "bg-white/[0.05] border border-white/[0.08]",
    divide: "divide-white/[0.05]", rowHover: "hover:bg-white/[0.03]",
  },
  light: {
    panel: "bg-white border border-zinc-200/80 shadow-sm",
    sub: "text-zinc-500", faint: "text-zinc-400", hairline: "border-zinc-200",
    input: "bg-white border border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15",
    select: "bg-white border border-zinc-300 text-zinc-900 focus:border-amber-500",
    button: "bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600",
    chip: "bg-zinc-100 border border-zinc-200",
    divide: "divide-zinc-100", rowHover: "hover:bg-zinc-50",
  },
};

const STATUS_BADGE = {
  sent: "bg-cyan-500/12 text-cyan-400 ring-1 ring-cyan-500/25",
  accepted: "bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-500/25",
  declined: "bg-zinc-500/12 text-zinc-400 ring-1 ring-zinc-500/25",
  converted: "bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/25",
};

/* ── printable quote with hire + transport line items ────────────────────── */
function PrintQuote({ quote, onClose }) {
  if (!quote) return null;
  /* breakdown is stored in notes as "base=X;zone=LABEL;surcharge=Y" — parse it */
  const meta = Object.fromEntries((quote.notes ?? "").split(";").map((kv) => kv.split("=")));
  const base = Number(meta.base) || quote.amount;
  const surcharge = Number(meta.surcharge) || 0;
  const zoneLabel = meta.zone || null;
  const extra = quote.amount - base - surcharge; // manual adjustment, if any

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/70 print:hidden" onClick={onClose} />
      <div className="absolute inset-x-0 top-6 bottom-6 mx-auto flex max-w-[820px] flex-col print:static print:max-w-none">
        <div className="mb-3 flex justify-end gap-2 px-4 print:hidden">
          <button onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 px-4 py-2.5 text-sm font-bold text-[#0F0F13] hover:brightness-105">
            <Printer size={15} /> Print / Save as PDF
          </button>
          <button onClick={onClose} className="rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white hover:bg-white/20"><X size={15} /></button>
        </div>
        <div id="print-doc" className="overflow-y-auto rounded-xl bg-white p-10 text-zinc-900 shadow-2xl print:overflow-visible print:rounded-none print:p-0 print:shadow-none">
          <div className="flex items-start justify-between border-b-2 border-zinc-900 pb-5">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">{BUSINESS.name}</h1>
              <p className="text-xs text-zinc-500">{BUSINESS.tagline}</p>
              <p className="mt-2 text-[11px] text-zinc-600">{BUSINESS.phone} · {BUSINESS.email}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-extrabold uppercase tracking-widest">Quotation</p>
              <p className="mt-1 font-mono text-sm font-bold">{quote.id}</p>
              <p className="text-[11px] tabular-nums text-zinc-500">Valid until: {quote.valid_until}</p>
            </div>
          </div>
          <div className="mt-6 text-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Prepared for</p>
            <p className="mt-1 font-bold">{quote.client}</p>
          </div>
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                <th className="pb-2">Description</th><th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100">
                <td className="py-3">{quote.items}{quote.hire ? ` — ${quote.hire} hire` : ""}</td>
                <td className="py-3 text-right font-semibold tabular-nums">{zar.format(base)}</td>
              </tr>
              {surcharge > 0 && (
                <tr className="border-b border-zinc-100">
                  <td className="py-3">Delivery &amp; collection{zoneLabel ? ` — ${zoneLabel}` : ""}</td>
                  <td className="py-3 text-right font-semibold tabular-nums">{zar.format(surcharge)}</td>
                </tr>
              )}
              {Math.abs(extra) >= 0.01 && (
                <tr className="border-b border-zinc-100">
                  <td className="py-3">{extra > 0 ? "Additional charges" : "Negotiated discount"}</td>
                  <td className="py-3 text-right font-semibold tabular-nums">{zar.format(extra)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="text-base font-extrabold">
                <td className="pt-3 text-right">Quoted total</td>
                <td className="pt-3 text-right tabular-nums">{zar.format(quote.amount)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-8 text-[10px] leading-relaxed text-zinc-400">
            Quote valid until the date shown. Price may be revised for restricted access, long carries, or special
            waste types. To accept, reply to this quote or phone us — we&apos;ll schedule delivery the same day.
          </p>
        </div>
      </div>
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-doc, #print-doc * { visibility: visible; }
          #print-doc { position: absolute; inset: 0; width: 100%; }
          @page { size: A4; margin: 18mm; }
        }
      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════════════ */

export default function QuotesPage() {
  const { dark } = useTheme();
  const s = T[dark ? "dark" : "light"];

  const [rates, setRates] = useState([]);
  const [zonesList, setZonesList] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ client: "", size: "6m³", hire: "Weekly", zone_id: "", amount: "", valid_until: plusDays(14) });
  const [overridden, setOverridden] = useState(false); // admin typed a manual price
  const [busy, setBusy] = useState(false);
  const [busyRow, setBusyRow] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, z, q, c] = await Promise.all([
      supabase.from("rates").select("*").order("size"),
      supabase.from("zones").select("*").order("sort"),
      supabase.from("quotes").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("clients").select("name").order("name"),
    ]);
    if (r.error || z.error) setToast({ type: "error", msg: "Rates/zones missing — run business-config.sql" });
    setRates(r.data ?? []);
    setZonesList(z.data ?? []);
    if ((z.data ?? []).length && !form.zone_id) setForm((p) => ({ ...p, zone_id: z.data[0].id }));
    setQuotes(q.data ?? []);
    setClients((c.data ?? []).map((x) => x.name));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  /* ── THE AUTO-QUOTE ENGINE ────────────────────────────────────────────── */
  const breakdown = useMemo(() => {
    const rate = rates.find((r) => r.size === form.size);
    const zone = zonesList.find((z) => z.id === form.zone_id);
    const base = rate ? Number(rate[form.hire.toLowerCase()]) || 0 : 0;
    const surcharge = zone ? Number(zone.surcharge) || 0 : 0;
    return { base, surcharge, zone, auto: base + surcharge };
  }, [rates, zonesList, form.size, form.hire, form.zone_id]);

  /* keep amount synced to the auto price unless the admin overrode it */
  useEffect(() => {
    if (!overridden) setForm((p) => ({ ...p, amount: breakdown.auto }));
  }, [breakdown.auto, overridden]);

  const setField = (k) => (e) => {
    const v = e.target?.value ?? e;
    if (k === "amount") setOverridden(true);
    if (k === "size" || k === "hire" || k === "zone_id") setOverridden(false); // re-arm auto pricing
    setForm((p) => ({ ...p, [k]: v }));
  };

  async function createQuote(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const name = form.client.trim();
      const row = {
        id: genQuoteId(),
        client: name,
        items: `1× ${form.size} Skip`,
        size: form.size,
        hire: form.hire,
        amount: Number(form.amount) || 0,
        valid_until: form.valid_until,
        status: "sent",
        // machine-readable breakdown for the printed document
        notes: `base=${breakdown.base};zone=${breakdown.zone?.label ?? ""};surcharge=${breakdown.surcharge}`,
      };
      const { data, error } = await supabase.from("quotes").insert([row]).select().single();
      if (error) throw new Error(error.message);
      await supabase.from("clients").upsert({ name }, { onConflict: "name", ignoreDuplicates: true });
      setQuotes((prev) => [data, ...prev]);
      if (!clients.includes(name)) setClients((prev) => [...prev, name].sort());
      setToast({ type: "success", msg: `${row.id} — ${name}, ${zarShort.format(row.amount)}` });
      setForm((p) => ({ ...p, client: "", amount: breakdown.auto, valid_until: plusDays(14) }));
      setOverridden(false);
      setPrinting(data);
    } catch (err) {
      setToast({ type: "error", msg: `Quote failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(q, status) {
    setBusyRow(q.id);
    const { error } = await supabase.from("quotes").update({ status }).eq("id", q.id);
    setBusyRow(null);
    if (error) return setToast({ type: "error", msg: error.message });
    setQuotes((prev) => prev.map((x) => (x.id === q.id ? { ...x, status } : x)));
  }

  async function convert(q) {
    setBusyRow(q.id);
    try {
      const invoice = {
        id: genInvoiceId(), client: q.client,
        date: new Date().toISOString().slice(0, 10),
        items: q.items, amount: q.amount,
        banked: false, collected: false,
        hire: q.hire, payment: "Account", vehicle: null, driver: null,
      };
      const { error: invErr } = await supabase.from("invoices").insert([invoice]);
      if (invErr) throw new Error(invErr.message);
      const { error: updErr } = await supabase.from("quotes").update({ status: "converted" }).eq("id", q.id);
      if (updErr) throw new Error(updErr.message);
      setQuotes((prev) => prev.map((x) => (x.id === q.id ? { ...x, status: "converted" } : x)));
      setToast({ type: "success", msg: `${q.id} → ${invoice.id} (${zarShort.format(q.amount)})` });
    } catch (err) {
      setToast({ type: "error", msg: `Conversion failed: ${err.message}` });
    } finally {
      setBusyRow(null);
    }
  }

  const input = `w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all tabular-nums ${s.input}`;
  const select = `w-full rounded-xl px-3.5 py-2.5 text-sm outline-none ${s.select}`;
  const label = `mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${s.sub}`;

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
              <FileText size={20} className="text-amber-400" /> Quotes
            </h1>
            <p className={`mt-1 text-xs ${s.sub}`}>Auto-priced from the live rate card + delivery zone — edit rates in Settings</p>
          </div>
          <button onClick={load} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${s.button}`}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ── NEW QUOTE ────────────────────────────────────────────────── */}
          <form onSubmit={createQuote} className={`h-fit space-y-4 rounded-2xl p-5 lg:sticky lg:top-6 ${s.panel}`}>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]">
              <Plus size={15} className="text-amber-400" /> New quote
            </h2>

            <label className="block">
              <span className={label}><User size={12} /> Client</span>
              <input required list="client-names" value={form.client} onChange={setField("client")}
                placeholder="Start typing — existing clients suggest" className={input} />
              <datalist id="client-names">{clients.map((c) => <option key={c} value={c} />)}</datalist>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={label}><Container size={12} /> Size</span>
                <select value={form.size} onChange={setField("size")} className={select}>
                  {rates.map((r) => <option key={r.size} value={r.size}>{r.size} {r.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={label}>Hire</span>
                <select value={form.hire} onChange={setField("hire")} className={select}>
                  {HIRES.map((h) => <option key={h}>{h}</option>)}
                </select>
              </label>
            </div>

            <label className="block">
              <span className={label}><MapPin size={12} /> Distance zone</span>
              <select value={form.zone_id} onChange={setField("zone_id")} className={select}>
                {zonesList.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label} (≤{z.max_km}km{Number(z.surcharge) > 0 ? `, +${zarShort.format(z.surcharge)}` : ""})
                  </option>
                ))}
              </select>
            </label>

            {/* live breakdown */}
            <div className={`rounded-xl px-4 py-3 text-xs ${s.chip}`}>
              <p className={`flex items-center gap-1.5 font-semibold uppercase tracking-[0.12em] ${s.faint}`}>
                <Calculator size={11} /> Auto-quote breakdown
              </p>
              <div className={`mt-1.5 space-y-1 tabular-nums ${s.sub}`}>
                <p className="flex justify-between"><span>{form.size} · {form.hire} hire</span><span>{zarShort.format(breakdown.base)}</span></p>
                <p className="flex justify-between"><span>Delivery — {breakdown.zone?.label ?? "—"}</span><span>{zarShort.format(breakdown.surcharge)}</span></p>
                <p className={`flex justify-between border-t pt-1 font-bold ${s.hairline}`}>
                  <span>Auto total</span>
                  <span className="text-amber-400">{zarShort.format(breakdown.auto)}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={label}><Banknote size={12} /> Final price (R)</span>
                <input required type="number" min="0" step="50" value={form.amount} onChange={setField("amount")} className={input} />
                {overridden && <span className="mt-1 block text-[10px] font-semibold text-amber-400">Manual override — auto re-arms when size/hire/zone change</span>}
              </label>
              <label className="block">
                <span className={label}>Valid until</span>
                <input required type="date" value={form.valid_until} onChange={setField("valid_until")} className={input} />
              </label>
            </div>

            <button type="submit" disabled={busy}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold tracking-wide transition-all ${
                busy ? "cursor-not-allowed bg-amber-500/40 text-[#0F0F13]/60"
                     : "bg-gradient-to-br from-amber-400 to-orange-500 text-[#0F0F13] shadow-[0_4px_24px_-6px_rgba(245,158,11,0.55)] hover:brightness-105"
              }`}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              {busy ? "Creating…" : "Create & print quote"}
            </button>
          </form>

          {/* ── QUOTE BOOK ───────────────────────────────────────────────── */}
          <section className={`rounded-2xl p-5 lg:col-span-2 ${s.panel}`}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.14em]">Quote book</h2>
            {loading && quotes.length === 0 ? (
              <div className="grid place-items-center py-12"><Loader2 size={20} className="animate-spin text-amber-400" /></div>
            ) : quotes.length === 0 ? (
              <p className={`py-10 text-center text-sm ${s.faint}`}>No quotes yet — the first one you create appears here.</p>
            ) : (
              <div className={`divide-y ${s.divide}`}>
                {quotes.map((q) => (
                  <div key={q.id} className={`flex flex-wrap items-center gap-3 py-3 ${s.rowHover}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{q.client}</p>
                      <p className={`text-xs ${s.sub}`}>
                        <span className="font-mono">{q.id}</span> · {q.items} · {q.hire} ·{" "}
                        <span className="tabular-nums">valid {q.valid_until}</span>
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{zarShort.format(q.amount)}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[q.status]}`}>{q.status}</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setPrinting(q)} title="Print" className={`rounded-lg p-2 ${s.button}`}><Printer size={13} /></button>
                      {q.status === "sent" && (
                        <>
                          <button onClick={() => setStatus(q, "accepted")} disabled={busyRow === q.id} title="Mark accepted"
                            className="rounded-lg bg-emerald-500/12 p-2 text-emerald-400 ring-1 ring-emerald-500/25 hover:bg-emerald-500/20"><ThumbsUp size={13} /></button>
                          <button onClick={() => setStatus(q, "declined")} disabled={busyRow === q.id} title="Mark declined"
                            className={`rounded-lg p-2 ${s.button}`}><ThumbsDown size={13} /></button>
                        </>
                      )}
                      {q.status === "accepted" && (
                        <button onClick={() => convert(q)} disabled={busyRow === q.id}
                          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 px-2.5 py-2 text-[11px] font-bold text-[#0F0F13] hover:brightness-105">
                          {busyRow === q.id ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />} Invoice
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <PrintQuote quote={printing} onClose={() => setPrinting(null)} />

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