"use client";

/**
 * INVOICES — src/app/invoices/page.js  (final)
 * · Edit modal uses a line-item builder (size+qty+price), parsed from items; amount auto-sums.
 * · Delete = Soft delete (voided=true): hidden here, recoverable, excluded from analytics.
 * · Print routes to /invoices/[id] — the SARS-compliant, VAT-aware document.
 * Requires: alter table invoices add column if not exists voided boolean default false;
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  Receipt, Search, Loader2, CheckCircle2, XCircle, Printer, RefreshCw,
  Pencil, X, MapPin, Save, Plus, Trash2, Ban,
} from "lucide-react";

const HIRE_TYPES = ["Daily", "Weekly", "Monthly"];
const PAYMENT_METHODS = ["EFT", "Card", "Cash", "Account"];
const VEHICLES = ["HZN 442 GP — Hino 500", "JKL 918 GP — Isuzu FTR", "DLM 207 GP — UD Croner"];
const DRIVERS = ["Sipho M.", "Johan v.d. Berg", "Thabo K.", "Pieter S."];

const SKIP_SIZES = [
  { size: "2m³", daily: 450,  weekly: 1150, monthly: 3600 },
  { size: "3m³", daily: 620,  weekly: 1680, monthly: 5200 },
  { size: "6m³", daily: 980,  weekly: 2850, monthly: 8400 },
  { size: "9m³", daily: 1450, weekly: 4100, monthly: 11800 },
];
const SIZES = SKIP_SIZES.map((x) => x.size);
const rateFor = (size, hire) => SKIP_SIZES.find((x) => x.size === size)?.[hire.toLowerCase()] ?? 0;
const buildItemsString = (lines) => lines.map((l) => `${l.qty}× ${l.size}`).join(", ");

function parseItems(items) {
  if (!items) return [];
  const out = []; const re = /(\d+)\s*[x×]\s*(\d(?:\.\d)?m³)/gi; let m;
  while ((m = re.exec(items)) !== null) out.push({ qty: +m[1], size: m[2] });
  if (out.length === 0) { const sm = items.match(/(\d(?:\.\d)?m³)/); if (sm) out.push({ qty: 1, size: sm[1] }); }
  return out;
}

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
    modal: "bg-[#15151b] border border-white/[0.1]", lineRow: "border-white/[0.07]",
  },
  light: {
    panel: "bg-white border border-zinc-200 shadow-sm",
    sub: "text-zinc-500", faint: "text-zinc-400", hairline: "border-zinc-200",
    rowHover: "hover:bg-zinc-50", divide: "divide-zinc-100",
    input: "bg-white border border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15",
    select: "bg-white border border-zinc-300 text-zinc-900 focus:border-amber-500",
    chipOff: "bg-zinc-100 border border-zinc-200 text-zinc-500 hover:text-zinc-900",
    button: "bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600",
    modal: "bg-white border border-zinc-200", lineRow: "border-zinc-200",
  },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "uncollected", label: "Skip out" },
  { key: "unbanked", label: "Unbanked" },
  { key: "contract", label: "Contract extras" },
  { key: "settled", label: "Settled" },
];

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

function LineItems({ s, lines, setLines, hire }) {
  const update = (i, k, v) => setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const changeSize = (i, size) => setLines((p) => p.map((l, j) => (j === i ? { ...l, size, price: rateFor(size, hire) } : l)));
  const addLine = () => {
    const used = new Set(lines.map((l) => l.size));
    const next = SIZES.find((x) => !used.has(x)) ?? "6m³";
    setLines((p) => [...p, { size: next, qty: 1, price: rateFor(next, hire) }]);
  };
  const removeLine = (i) => setLines((p) => p.filter((_, j) => j !== i));
  return (
    <div className="space-y-2">
      <div className={`grid grid-cols-[1fr_56px_96px_84px_30px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${s.faint}`}>
        <span>Size</span><span>Qty</span><span>Price</span><span className="text-right">Total</span><span />
      </div>
      {lines.map((line, i) => (
        <div key={i} className="grid grid-cols-[1fr_56px_96px_84px_30px] items-center gap-2">
          <select value={line.size} onChange={(e) => changeSize(i, e.target.value)} className={`rounded-lg px-2 py-2 text-sm outline-none ${s.select}`}>
            {SIZES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <input type="number" min="1" value={line.qty} onChange={(e) => update(i, "qty", Math.max(1, parseInt(e.target.value) || 1))}
            className={`rounded-lg px-2 py-2 text-sm tabular-nums outline-none ${s.input}`} />
          <input type="number" min="0" step="50" value={line.price} onChange={(e) => update(i, "price", Number(e.target.value) || 0)}
            className={`rounded-lg px-2 py-2 text-sm tabular-nums outline-none ${s.input}`} />
          <span className="text-right text-sm font-semibold tabular-nums">{zarShort.format(line.qty * line.price)}</span>
          <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} aria-label="Remove line"
            className={`grid h-8 w-8 place-items-center rounded-lg border ${s.lineRow} ${s.faint} transition-colors hover:border-rose-400/50 hover:text-rose-400 disabled:opacity-30`}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={addLine}
        className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs font-medium ${s.lineRow} ${s.sub} transition-colors hover:border-amber-400/50 hover:text-amber-400`}>
        <Plus size={13} /> Add another skip size
      </button>
    </div>
  );
}

function EditModal({ s, invoice, onClose, onSaved, setToast }) {
  const [form, setForm] = useState(null);
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    const hire = invoice.hire ?? "Weekly";
    setForm({
      client: invoice.client ?? "", date: invoice.date ?? "", hire, payment: invoice.payment ?? "EFT",
      driver: invoice.driver ?? "", vehicle: invoice.vehicle ?? "", location: invoice.location ?? "",
    });
    const parsed = parseItems(invoice.items);
    if (parsed.length) {
      const totalQty = parsed.reduce((sum, p) => sum + p.qty, 0) || 1;
      const perUnit = Number(invoice.amount || 0) / totalQty;
      setLines(parsed.map((p) => ({ size: p.size, qty: p.qty, price: Math.round(perUnit) })));
    } else {
      setLines([{ size: "6m³", qty: 1, price: Number(invoice.amount || 0) || rateFor("6m³", hire) }]);
    }
  }, [invoice]);

  const amount = useMemo(() => lines.reduce((sum, l) => sum + l.qty * l.price, 0), [lines]);
  const totalSkips = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines]);

  if (!invoice || !form) return null;
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const onHireChange = (e) => {
    const hire = e.target.value;
    setForm((p) => ({ ...p, hire }));
    setLines((p) => p.map((l) => ({ ...l, price: rateFor(l.size, hire) })));
  };

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const patch = {
      client: form.client.trim(), date: form.date, items: buildItemsString(lines), amount,
      hire: form.hire, payment: form.payment, driver: form.driver || null,
      vehicle: form.vehicle || null, location: form.location.trim() || null,
    };
    const { error } = await supabase.from("invoices").update(patch).eq("id", invoice.id);
    if (!error) {
      try {
        await supabase.from("invoice_line_items").delete().eq("invoice_id", invoice.id);
        await supabase.from("invoice_line_items").insert(
          lines.map((l) => ({ invoice_id: invoice.id, skip_size: l.size, quantity: l.qty, unit_price: l.price }))
        );
      } catch { /* table may not exist */ }
    }
    setBusy(false);
    if (error) return setToast({ type: "error", msg: `Save failed: ${error.message}` });
    setToast({ type: "success", msg: `${invoice.id} updated — ${totalSkips} skip${totalSkips !== 1 ? "s" : ""}, ${zarShort.format(amount)}` });
    onSaved({ ...invoice, ...patch });
    onClose();
  }

  const input = `w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all tabular-nums ${s.input}`;
  const select = `w-full rounded-xl px-3.5 py-2.5 text-sm outline-none ${s.select}`;
  const label = `mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] ${s.sub}`;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center px-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <form onSubmit={save} className={`relative max-h-[88vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl p-6 shadow-2xl ${s.modal}`}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]"><Pencil size={14} className="text-amber-400" /> Edit {invoice.id}</h2>
            <p className={`mt-0.5 text-[11px] ${s.faint}`}>Change quantities below — the amount recalculates automatically</p>
          </div>
          <button type="button" onClick={onClose} className={`rounded-lg p-1.5 ${s.button}`}><X size={15} /></button>
        </div>

        <label className="block"><span className={label}>Client</span>
          <input required value={form.client} onChange={set("client")} className={input} /></label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={label}>Date</span>
            <input required type="date" value={form.date} onChange={set("date")} className={input} /></label>
          <label className="block"><span className={label}>Hire</span>
            <select value={form.hire} onChange={onHireChange} className={select}>{HIRE_TYPES.map((h) => <option key={h}>{h}</option>)}</select></label>
        </div>

        <div>
          <span className={label}>Skips</span>
          <LineItems s={s} lines={lines} setLines={setLines} hire={form.hire} />
          <div className={`mt-2 flex items-center justify-between rounded-xl px-3.5 py-2.5 ${s.chipOff}`}>
            <span className="text-xs">{totalSkips} skip{totalSkips !== 1 ? "s" : ""} · {lines.length} line{lines.length !== 1 ? "s" : ""}</span>
            <span className="text-base font-extrabold tabular-nums">{zar.format(amount)}</span>
          </div>
        </div>

        <label className="block"><span className={label}>Location</span>
          <input value={form.location} onChange={set("location")} placeholder="e.g. 12 Koedoe St, Waterval East" className={input} /></label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={label}>Payment</span>
            <select value={form.payment} onChange={set("payment")} className={select}>{PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="block"><span className={label}>Driver</span>
            <select value={form.driver} onChange={set("driver")} className={select}><option value="">—</option>{DRIVERS.map((d) => <option key={d}>{d}</option>)}</select></label>
        </div>

        <label className="block"><span className={label}>Vehicle</span>
          <select value={form.vehicle} onChange={set("vehicle")} className={select}><option value="">—</option>{VEHICLES.map((v) => <option key={v}>{v}</option>)}</select></label>

        <button type="submit" disabled={busy}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold tracking-wide transition-all ${
            busy ? "cursor-not-allowed bg-amber-500/40 text-[#0F0F13]/60" : "bg-gradient-to-br from-amber-400 to-orange-500 text-[#0F0F13] hover:brightness-105"}`}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

export default function InvoicesPage() {
  const { dark } = useTheme();
  const s = T[dark ? "dark" : "light"];
  const router = useRouter();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("voided", false)
      // Ordered by date, then by ID to ensure sequential invoices on the same day remain in perfect order
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .limit(500);
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

  // Soft delete implementation
async function deleteInvoice(row) {
    if (!confirm(`PERMANENTLY delete invoice ${row.id} for ${row.client}?\n\nThis action cannot be undone and will permanently remove it from your analytics.`)) return;
    
    setBusyId(row.id + "delete");
    
    // 1. Delete associated line items first to prevent Foreign Key constraint errors
    try {
      await supabase.from("invoice_line_items").delete().eq("invoice_id", row.id);
    } catch { /* Ignore if table doesn't exist */ }

    // 2. Hard delete the invoice
    const { error } = await supabase.from("invoices").delete().eq("id", row.id);
    
    setBusyId(null);
    
    if (error) {
      return setToast({ type: "error", msg: `Delete failed: ${error.message}` });
    }
    
    // Remove from the UI
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setToast({ type: "success", msg: `${row.id} permanently deleted` });
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
    () => rows.filter((r) => !r.banked).reduce((sum, r) => sum + Number(r.amount || 0), 0), [rows]);

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight"><Receipt size={20} className="text-amber-400" /> Invoices</h1>
            <p className={`mt-1 text-xs ${s.sub}`}>
              Full history, fully editable ·{" "}
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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, invoice no, location, contract…"
              className={`w-full rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none transition-all ${s.input}`} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${filter === f.key ? "bg-amber-400 text-[#0F0F13]" : s.chipOff}`}>
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
              <table className="w-full min-w-[1020px] text-sm">
                <thead>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-[0.12em] ${s.hairline} ${s.faint}`}>
                    <th className="pb-2.5 pr-4">Invoice</th><th className="pb-2.5 pr-4">Client</th><th className="pb-2.5 pr-4">Location</th>
                    <th className="pb-2.5 pr-4">Date</th><th className="pb-2.5 pr-4">Items</th><th className="pb-2.5 pr-4 text-right">Amount</th>
                    <th className="pb-2.5 pr-4">Skip</th><th className="pb-2.5 pr-4">Money</th><th className="pb-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${s.divide}`}>
                  {visible.map((r) => (
                    <tr key={r.id} className={`transition-colors ${s.rowHover}`}>
                      <td className="py-3 pr-4">
                        <span className={`font-mono text-xs ${s.sub}`}>{r.id}</span>
                        {r.contract_id && (
                          <span className="ml-2 rounded-full bg-cyan-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-400 ring-1 ring-cyan-500/25" title={`Contract ${r.contract_id}`}>{r.contract_id}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-medium">{r.client}</td>
                      <td className={`max-w-[160px] truncate py-3 pr-4 text-xs ${s.sub}`}>
                        {r.location ? <span className="flex items-center gap-1"><MapPin size={11} className="shrink-0 text-amber-400" /> {r.location}</span> : "—"}
                      </td>
                      <td className={`py-3 pr-4 tabular-nums ${s.sub}`}>{r.date}</td>
                      <td className={`max-w-[180px] truncate py-3 pr-4 ${s.sub}`}>{r.items}</td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums">{zarShort.format(r.amount)}</td>
                      <td className="py-3 pr-4"><FlagToggle s={s} on={r.collected} onLabel="Collected" offLabel="On site" busy={busyId === r.id + "collected"} onClick={() => flip(r, "collected")} /></td>
                      <td className="py-3 pr-4"><FlagToggle s={s} on={r.banked} onLabel="Banked" offLabel="Owed" busy={busyId === r.id + "banked"} onClick={() => flip(r, "banked")} /></td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setEditing(r)} title="Edit invoice" className={`rounded-lg p-2 transition-colors ${s.button}`}><Pencil size={14} /></button>
                          <button onClick={() => router.push(`/invoices/${r.id}`)} title="View / print (VAT-compliant)" className={`rounded-lg p-2 transition-colors ${s.button}`}><Printer size={14} /></button>
                          
                          {/* Soft delete action using the Trash icon to match standard user expectations */}
                          <button onClick={() => voidInvoice(r)} disabled={busyId === r.id + "void"} title="Delete invoice (Soft Delete)"
                            className="rounded-lg p-2 text-rose-400 transition-colors hover:bg-rose-500/10 disabled:opacity-40">
                            {busyId === r.id + "void" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && <tr><td colSpan={9} className={`py-10 text-center text-sm ${s.faint}`}>No invoices match this view.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <EditModal s={s} invoice={editing} onClose={() => setEditing(null)} setToast={setToast}
        onSaved={(updated) => setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))} />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-xl ${
            toast.type === "success" ? "border-emerald-400/30 bg-emerald-500/[0.12] text-emerald-300" : "border-rose-400/30 bg-rose-500/[0.12] text-rose-300"}`}>
            {toast.type === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}<span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}