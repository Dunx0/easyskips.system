"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  INVOICES WORKROOM — src/app/invoices/page.js   (v2)
 *
 *  New in v2:
 *   · Full EDIT modal on every invoice (client, date, items, amount, hire,
 *     payment, driver, vehicle, location) — every change is written to the
 *     audit log by the DB trigger, so editing is safe because it's traceable
 *   · Location column
 *   · "Contract extra" badge on invoices linked to a contract
 *  Plus everything from v1: search, filters, collected/banked toggles,
 *  printable A4 tax invoice.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  Receipt, Search, Loader2, CheckCircle2, XCircle, Printer, RefreshCw,
  Pencil, X, MapPin, Save,
} from "lucide-react";

const BUSINESS = {
  name: "SkipCommand Waste Solutions",
  tagline: "Skip hire · Rustenburg & surrounds",
  regNo: "2025/000000/07",
  vatNo: "",
  phone: "082 123 4567",
  email: "accounts@yourdomain.co.za",
  address: "Unit 4, Industrial Park, Waterval East, Rustenburg, 0299",
  bank: { name: "FNB", account: "62000000000", branch: "250655", ref: "Use invoice number as reference" },
};

const HIRE_TYPES = ["Daily", "Weekly", "Monthly"];
const PAYMENT_METHODS = ["EFT", "Card", "Cash", "Account"];
const VEHICLES = ["HZN 442 GP — Hino 500", "JKL 918 GP — Isuzu FTR", "DLM 207 GP — UD Croner"];
const DRIVERS = ["Sipho M.", "Johan v.d. Berg", "Thabo K.", "Pieter S."];

const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 });
const zarShort = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

const T = {
  dark: {
    panel: "bg-white/[0.035] border border-white/[0.07] backdrop-blur-xl",
    sub: "text-zinc-400", faint: "text-zinc-500", hairline: "border-white/[0.07]",
    rowHover: "hover:bg-white/[0.03]", divide: "divide-white/[0.05]",
    input: "bg-white/[0.04] border border-white/[0.09] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/15",
    select: "bg-[#16161c] border border-white/[0.09] text-zinc-100 focus:border-amber-400/60",
    chipOff: "bg-white/[0.05] border border-white/[0.08] text-zinc-400 hover:text-zinc-100",
    button: "bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-zinc-300",
    modal: "bg-[#15151b] border border-white/[0.1]",
  },
  light: {
    panel: "bg-white border border-zinc-200 shadow-sm",
    sub: "text-zinc-500", faint: "text-zinc-400", hairline: "border-zinc-200",
    rowHover: "hover:bg-zinc-50", divide: "divide-zinc-100",
    input: "bg-white border border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15",
    select: "bg-white border border-zinc-300 text-zinc-900 focus:border-amber-500",
    chipOff: "bg-zinc-100 border border-zinc-200 text-zinc-500 hover:text-zinc-900",
    button: "bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600",
    modal: "bg-white border border-zinc-200",
  },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "uncollected", label: "Skip out" },
  { key: "unbanked", label: "Unbanked" },
  { key: "contract", label: "Contract extras" },
  { key: "settled", label: "Settled" },
];

/* ── status toggle ───────────────────────────────────────────────────────── */
function FlagToggle({ s, on, onLabel, offLabel, busy, onClick }) {
  return (
    <button onClick={onClick} disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
        on ? "bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-500/25" : s.chipOff
      } ${busy ? "opacity-50" : "hover:scale-[1.03] active:scale-[0.98]"}`}>
      {busy ? <Loader2 size={11} className="animate-spin" /> : on ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {on ? onLabel : offLabel}
    </button>
  );
}

/* ── EDIT MODAL ──────────────────────────────────────────────────────────── */
function EditModal({ s, invoice, onClose, onSaved, setToast }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (invoice) setForm({
      client: invoice.client ?? "", date: invoice.date ?? "",
      items: invoice.items ?? "", amount: invoice.amount ?? 0,
      hire: invoice.hire ?? "Weekly", payment: invoice.payment ?? "EFT",
      driver: invoice.driver ?? "", vehicle: invoice.vehicle ?? "",
      location: invoice.location ?? "",
    });
  }, [invoice]);

  if (!invoice || !form) return null;
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const patch = {
      client: form.client.trim(), date: form.date, items: form.items.trim(),
      amount: Number(form.amount) || 0, hire: form.hire, payment: form.payment,
      driver: form.driver || null, vehicle: form.vehicle || null,
      location: form.location.trim() || null,
    };
    const { error } = await supabase.from("invoices").update(patch).eq("id", invoice.id);
    setBusy(false);
    if (error) return setToast({ type: "error", msg: `Save failed: ${error.message}` });
    setToast({ type: "success", msg: `${invoice.id} updated — change logged to audit trail` });
    onSaved({ ...invoice, ...patch });
    onClose();
  }

  const input = `w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all tabular-nums ${s.input}`;
  const select = `w-full rounded-xl px-3.5 py-2.5 text-sm outline-none ${s.select}`;
  const label = `mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] ${s.sub}`;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center px-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <form onSubmit={save}
        className={`relative max-h-[88vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl p-6 shadow-2xl ${s.modal}`}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]">
              <Pencil size={14} className="text-amber-400" /> Edit {invoice.id}
            </h2>
            <p className={`mt-0.5 text-[11px] ${s.faint}`}>Every field change is written to the owner-visible audit log</p>
          </div>
          <button type="button" onClick={onClose} className={`rounded-lg p-1.5 ${s.button}`}><X size={15} /></button>
        </div>

        <label className="block"><span className={label}>Client</span>
          <input required value={form.client} onChange={set("client")} className={input} /></label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={label}>Date</span>
            <input required type="date" value={form.date} onChange={set("date")} className={input} /></label>
          <label className="block"><span className={label}>Amount (ZAR)</span>
            <input required type="number" min="0" step="50" value={form.amount} onChange={set("amount")} className={input} /></label>
        </div>

        <label className="block"><span className={label}>Items</span>
          <input required value={form.items} onChange={set("items")} className={input} /></label>

        <label className="block"><span className={label}>Location</span>
          <input value={form.location} onChange={set("location")} placeholder="e.g. 12 Koedoe St, Waterval East" className={input} /></label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={label}>Hire</span>
            <select value={form.hire} onChange={set("hire")} className={select}>
              {HIRE_TYPES.map((h) => <option key={h}>{h}</option>)}
            </select></label>
          <label className="block"><span className={label}>Payment</span>
            <select value={form.payment} onChange={set("payment")} className={select}>
              {PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}
            </select></label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={label}>Driver</span>
            <select value={form.driver} onChange={set("driver")} className={select}>
              <option value="">—</option>
              {DRIVERS.map((d) => <option key={d}>{d}</option>)}
            </select></label>
          <label className="block"><span className={label}>Vehicle</span>
            <select value={form.vehicle} onChange={set("vehicle")} className={select}>
              <option value="">—</option>
              {VEHICLES.map((v) => <option key={v}>{v}</option>)}
            </select></label>
        </div>

        <button type="submit" disabled={busy}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold tracking-wide transition-all ${
            busy ? "cursor-not-allowed bg-amber-500/40 text-[#0F0F13]/60"
                 : "bg-gradient-to-br from-amber-400 to-orange-500 text-[#0F0F13] hover:brightness-105"
          }`}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

/* ── PRINTABLE TAX INVOICE ───────────────────────────────────────────────── */
function PrintInvoice({ invoice, onClose }) {
  if (!invoice) return null;
  const vatRegistered = Boolean(BUSINESS.vatNo);
  const excl = vatRegistered ? invoice.amount / 1.15 : invoice.amount;
  const vat = vatRegistered ? invoice.amount - excl : 0;
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
        <div id="print-invoice" className="overflow-y-auto rounded-xl bg-white p-10 text-zinc-900 shadow-2xl print:overflow-visible print:rounded-none print:p-0 print:shadow-none">
          <div className="flex items-start justify-between border-b-2 border-zinc-900 pb-5">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">{BUSINESS.name}</h1>
              <p className="text-xs text-zinc-500">{BUSINESS.tagline}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
                {BUSINESS.address}<br />{BUSINESS.phone} · {BUSINESS.email}<br />
                Reg: {BUSINESS.regNo}{vatRegistered && <> · VAT: {BUSINESS.vatNo}</>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-extrabold uppercase tracking-widest">{vatRegistered ? "Tax Invoice" : "Invoice"}</p>
              <p className="mt-1 font-mono text-sm font-bold">{invoice.id}</p>
              <p className="text-[11px] tabular-nums text-zinc-500">Date: {invoice.date}</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-8 text-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Billed to</p>
              <p className="mt-1 font-bold">{invoice.client}</p>
              {invoice.location && <p className="text-xs text-zinc-600">{invoice.location}</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Dispatch</p>
              <p className="mt-1 text-xs text-zinc-600">
                {invoice.driver && <>Driver: {invoice.driver}<br /></>}
                {invoice.vehicle && <>Vehicle: {invoice.vehicle}<br /></>}
                {invoice.hire && <>Hire: {invoice.hire}</>}
              </p>
            </div>
          </div>
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                <th className="pb-2">Description</th><th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100">
                <td className="py-3">{invoice.items}{invoice.contract_id ? ` (additional to contract ${invoice.contract_id})` : ""}</td>
                <td className="py-3 text-right font-semibold tabular-nums">{zar.format(excl)}</td>
              </tr>
            </tbody>
            <tfoot className="text-sm">
              {vatRegistered && (
                <>
                  <tr><td className="pt-3 text-right text-zinc-500">Subtotal (excl. VAT)</td>
                      <td className="pt-3 text-right tabular-nums">{zar.format(excl)}</td></tr>
                  <tr><td className="pt-1 text-right text-zinc-500">VAT @ 15%</td>
                      <td className="pt-1 text-right tabular-nums">{zar.format(vat)}</td></tr>
                </>
              )}
              <tr className="text-base font-extrabold">
                <td className="pt-2 text-right">Total due</td>
                <td className="pt-2 text-right tabular-nums">{zar.format(invoice.amount)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-700 print:bg-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Payment — EFT</p>
            <p className="mt-1">
              {BUSINESS.bank.name} · Account {BUSINESS.bank.account} · Branch {BUSINESS.bank.branch}<br />
              {BUSINESS.bank.ref}: <span className="font-mono font-bold">{invoice.id}</span>
              {invoice.payment && <> · Method on record: {invoice.payment}</>}
            </p>
          </div>
          <p className="mt-6 text-center text-[10px] text-zinc-400">
            Thank you for your business. Skips remain the property of {BUSINESS.name}.
          </p>
        </div>
      </div>
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-invoice, #print-invoice * { visibility: visible; }
          #print-invoice { position: absolute; inset: 0; width: 100%; }
          @page { size: A4; margin: 18mm; }
        }
      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════════════ */

export default function InvoicesPage() {
  const { dark } = useTheme();
  const s = T[dark ? "dark" : "light"];

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices").select("*").order("date", { ascending: false }).limit(500);
    if (error) setToast({ type: "error", msg: error.message });
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  async function flip(row, field) {
    setBusyId(row.id + field);
    const next = !row[field];
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: next } : r)));
    const { error } = await supabase.from("invoices").update({ [field]: next }).eq("id", row.id);
    if (error) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: !next } : r)));
      setToast({ type: "error", msg: `Update failed: ${error.message}` });
    }
    setBusyId(null);
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "uncollected" && r.collected) return false;
      if (filter === "unbanked" && r.banked) return false;
      if (filter === "contract" && !r.contract_id) return false;
      if (filter === "settled" && !(r.collected && r.banked)) return false;
      if (!needle) return true;
      return [r.id, r.client, r.items, r.driver, r.vehicle, r.location, r.contract_id]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q, filter]);

  const unbankedTotal = useMemo(
    () => rows.filter((r) => !r.banked).reduce((sum, r) => sum + Number(r.amount || 0), 0),
    [rows]
  );

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
              <Receipt size={20} className="text-amber-400" /> Invoices
            </h1>
            <p className={`mt-1 text-xs ${s.sub}`}>
              Full history, fully editable — every edit is audit-logged ·{" "}
              <span className="font-semibold tabular-nums text-rose-400">{zarShort.format(unbankedTotal)}</span> not yet banked
            </p>
          </div>
          <button onClick={load} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${s.button}`}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${s.faint}`} />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search client, invoice no, location, contract…"
              className={`w-full rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none transition-all ${s.input}`} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  filter === f.key ? "bg-amber-400 text-[#0F0F13]" : s.chipOff
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <section className={`rounded-2xl p-5 ${s.panel}`}>
          {loading && rows.length === 0 ? (
            <div className="grid place-items-center py-14"><Loader2 size={22} className="animate-spin text-amber-400" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-[0.12em] ${s.hairline} ${s.faint}`}>
                    <th className="pb-2.5 pr-4">Invoice</th>
                    <th className="pb-2.5 pr-4">Client</th>
                    <th className="pb-2.5 pr-4">Location</th>
                    <th className="pb-2.5 pr-4">Date</th>
                    <th className="pb-2.5 pr-4">Items</th>
                    <th className="pb-2.5 pr-4 text-right">Amount</th>
                    <th className="pb-2.5 pr-4">Skip</th>
                    <th className="pb-2.5 pr-4">Money</th>
                    <th className="pb-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${s.divide}`}>
                  {visible.map((r) => (
                    <tr key={r.id} className={`transition-colors ${s.rowHover}`}>
                      <td className="py-3 pr-4">
                        <span className={`font-mono text-xs ${s.sub}`}>{r.id}</span>
                        {r.contract_id && (
                          <span className="ml-2 rounded-full bg-cyan-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-400 ring-1 ring-cyan-500/25"
                            title={`Extra skip billed on top of contract ${r.contract_id}`}>
                            {r.contract_id}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-medium">{r.client}</td>
                      <td className={`max-w-[160px] truncate py-3 pr-4 text-xs ${s.sub}`}>
                        {r.location ? (
                          <span className="flex items-center gap-1"><MapPin size={11} className="shrink-0 text-amber-400" /> {r.location}</span>
                        ) : "—"}
                      </td>
                      <td className={`py-3 pr-4 tabular-nums ${s.sub}`}>{r.date}</td>
                      <td className={`max-w-[180px] truncate py-3 pr-4 ${s.sub}`}>{r.items}</td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums">{zarShort.format(r.amount)}</td>
                      <td className="py-3 pr-4">
                        <FlagToggle s={s} on={r.collected} onLabel="Collected" offLabel="On site"
                          busy={busyId === r.id + "collected"} onClick={() => flip(r, "collected")} />
                      </td>
                      <td className="py-3 pr-4">
                        <FlagToggle s={s} on={r.banked} onLabel="Banked" offLabel="Owed"
                          busy={busyId === r.id + "banked"} onClick={() => flip(r, "banked")} />
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setEditing(r)} title="Edit invoice"
                            className={`rounded-lg p-2 transition-colors ${s.button}`}><Pencil size={14} /></button>
                          <button onClick={() => setPrinting(r)} title="Print invoice"
                            className={`rounded-lg p-2 transition-colors ${s.button}`}><Printer size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr><td colSpan={9} className={`py-10 text-center text-sm ${s.faint}`}>No invoices match this view.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <EditModal s={s} invoice={editing} onClose={() => setEditing(null)} setToast={setToast}
        onSaved={(updated) => setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))} />
      <PrintInvoice invoice={printing} onClose={() => setPrinting(null)} />

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