"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DISPATCH & BILLING — src/app/dispatch/page.js   (v2)
 *
 *  New in v2:
 *   · Location field on every delivery (written to invoices.location)
 *   · CONTRACT BUDGET BRAIN: if the client name matches a contract client,
 *     the form flags it — the contract's MRR covers N permanent skips, so
 *     this delivery is an EXTRA. The admin chooses:
 *        (a) Bill as separate ad-hoc invoice, linked via contract_id  (default)
 *        (b) Adjust the contract instead (skips + MRR) — no invoice created
 *  Requires: migration-contract-location.sql
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  Truck, FileSignature, Container, CalendarDays, User, MapPin, Banknote,
  CreditCard, Loader2, CheckCircle2, XCircle, Send, Hash, Gauge, X,
  AlertTriangle, Scale,
} from "lucide-react";

/* ── rate card & options ─────────────────────────────────────────────────── */
const SKIP_SIZES = [
  { size: "2m³", label: "2m³ Mini",     daily: 450,  weekly: 1150, monthly: 3600 },
  { size: "3m³", label: "3m³ Midi",     daily: 620,  weekly: 1680, monthly: 5200 },
  { size: "6m³", label: "6m³ Builders", daily: 980,  weekly: 2850, monthly: 8400 },
  { size: "9m³", label: "9m³ Maxi",     daily: 1450, weekly: 4100, monthly: 11800 },
];
const HIRE_TYPES = ["Daily", "Weekly", "Monthly"];
const PAYMENT_METHODS = ["EFT", "Card", "Cash", "Account"];
const VEHICLES = ["HZN 442 GP — Hino 500", "JKL 918 GP — Isuzu FTR", "DLM 207 GP — UD Croner"];
const DRIVERS = ["Sipho M.", "Johan v.d. Berg", "Thabo K.", "Pieter S."];

const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const genInvoiceId = () => `INV-${String(Date.now()).slice(-6)}`;

function parseQty(items) {
  if (!items) return 0;
  let total = 0;
  const re = /(\d+)\s*[x×]/g;
  let m;
  while ((m = re.exec(items)) !== null) total += Number(m[1]);
  return total || 1;
}

/* ── theme tokens ────────────────────────────────────────────────────────── */
const T = {
  dark: {
    panel: "bg-white/[0.035] border border-white/[0.07] backdrop-blur-xl",
    sub: "text-zinc-400", faint: "text-zinc-500", hairline: "border-white/[0.07]",
    input: "bg-white/[0.04] border border-white/[0.09] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/15",
    select: "bg-[#16161c] border border-white/[0.09] text-zinc-100 focus:border-amber-400/60",
    chip: "bg-white/[0.05] border border-white/[0.08]",
    segOff: "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]",
  },
  light: {
    panel: "bg-white border border-zinc-200 shadow-sm",
    sub: "text-zinc-500", faint: "text-zinc-400", hairline: "border-zinc-200",
    input: "bg-white border border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15",
    select: "bg-white border border-zinc-300 text-zinc-900 focus:border-amber-500",
    chip: "bg-zinc-100 border border-zinc-200",
    segOff: "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100",
  },
};

/* ── micro-components ────────────────────────────────────────────────────── */
function Field({ s, label, icon: Icon, children, hint }) {
  return (
    <label className="block">
      <span className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${s.sub}`}>
        {Icon && <Icon size={12} />}{label}
        {hint && <span className={`font-normal normal-case tracking-normal ${s.faint}`}>— {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Segmented({ s, options, value, onChange }) {
  return (
    <div className={`flex rounded-xl p-1 ${s.chip}`}>
      {options.map((opt) => (
        <button key={opt} type="button" onClick={() => onChange(opt)}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all duration-200 ${
            value === opt
              ? "bg-gradient-to-br from-amber-400 to-orange-500 text-[#0F0F13]"
              : s.segOff
          }`}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function SubmitButton({ busy, label, busyLabel, icon: Icon }) {
  return (
    <button type="submit" disabled={busy}
      className={`mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold tracking-wide transition-all duration-200 ${
        busy ? "cursor-not-allowed bg-amber-500/40 text-[#0F0F13]/60"
             : "bg-gradient-to-br from-amber-400 to-orange-500 text-[#0F0F13] hover:brightness-105 active:scale-[0.99]"
      }`}>
      {busy ? <Loader2 size={17} className="animate-spin" /> : <Icon size={17} />}
      {busy ? busyLabel : label}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════════════ */

const EMPTY_DELIVERY = {
  client: "", date: today(), size: "6m³", hire: "Weekly", payment: "EFT",
  driver: DRIVERS[0], vehicle: VEHICLES[0], amount: 2850, location: "",
};
const EMPTY_CONTRACT = { client: "", site: "", skips: 1, size: "6m³", mrr: "" };

export default function DispatchPage() {
  const { dark } = useTheme();
  const s = T[dark ? "dark" : "light"];

  const [delivery, setDelivery] = useState(EMPTY_DELIVERY);
  const [contractForm, setContractForm] = useState(EMPTY_CONTRACT);
  const [contracts, setContracts] = useState([]);
  const [openExtras, setOpenExtras] = useState([]); // uncollected invoices linked to contracts
  const [clientNames, setClientNames] = useState([]);
  const [submittingInvoice, setSubmittingInvoice] = useState(false);
  const [submittingContract, setSubmittingContract] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [toast, setToast] = useState(null);

  const loadContext = useCallback(async () => {
    const [c, e, n] = await Promise.all([
      supabase.from("contracts").select("*"),
      supabase.from("invoices").select("contract_id, items").eq("collected", false).not("contract_id", "is", null),
      supabase.from("clients").select("name").order("name"),
    ]);
    setContracts(c.data ?? []);
    setOpenExtras(e.data ?? []);
    setClientNames((n.data ?? []).map((x) => x.name));
  }, []);

  useEffect(() => { loadContext(); }, [loadContext]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const suggested = useCallback((size, hire) => {
    const r = SKIP_SIZES.find((x) => x.size === size);
    return r ? r[hire.toLowerCase()] : "";
  }, []);

  const setDeliveryField = (key, value) =>
    setDelivery((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "size" || key === "hire") next.amount = suggested(next.size, next.hire);
      return next;
    });

  /* ── CONTRACT BUDGET BRAIN ────────────────────────────────────────────── */
  const matchedContract = useMemo(() => {
    const name = delivery.client.trim().toLowerCase();
    if (name.length < 3) return null;
    return contracts.find(
      (c) => c.client.toLowerCase().includes(name) || name.includes(c.client.toLowerCase())
    ) ?? null;
  }, [delivery.client, contracts]);

  const budget = useMemo(() => {
    if (!matchedContract) return null;
    const extrasOut = openExtras
      .filter((e) => e.contract_id === matchedContract.id)
      .reduce((sum, e) => sum + parseQty(e.items), 0);
    return {
      covered: matchedContract.skips,           // skips the MRR pays for
      extrasOut,                                // extra skips already on site, billed separately
      afterThis: matchedContract.skips + extrasOut + 1,
    };
  }, [matchedContract, openExtras]);

  /* adjust contract instead of invoicing: +1 skip, pro-rata MRR uplift */
  async function adjustContract() {
    if (!matchedContract || adjusting) return;
    setAdjusting(true);
    try {
      const perSkip = matchedContract.mrr / matchedContract.skips; // current per-skip rate
      const newSkips = matchedContract.skips + 1;
      const newMrr = Math.round(matchedContract.mrr + perSkip);
      const { error } = await supabase
        .from("contracts")
        .update({ skips: newSkips, mrr: newMrr })
        .eq("id", matchedContract.id);
      if (error) throw new Error(error.message);
      setToast({
        type: "success",
        msg: `${matchedContract.id} adjusted → ${newSkips}× skips @ ${zar.format(newMrr)}/mo. No invoice created — dispatch the skip via the run sheet.`,
      });
      setDelivery({ ...EMPTY_DELIVERY, date: today() });
      loadContext();
    } catch (err) {
      setToast({ type: "error", msg: `Adjustment failed: ${err.message}` });
    } finally {
      setAdjusting(false);
    }
  }

  /* ── SUBMIT: invoice (links contract_id when client is on contract) ───── */
  async function handleDeliverySubmit(e) {
    e.preventDefault();
    if (submittingInvoice) return;
    setSubmittingInvoice(true);
    const id = genInvoiceId();
    try {
      const row = {
        id,
        client: delivery.client.trim(),
        date: delivery.date,
        items: `1× ${delivery.size} Skip`,
        amount: Number(delivery.amount) || 0,
        banked: false, collected: false,
        hire: delivery.hire, payment: delivery.payment,
        vehicle: delivery.vehicle, driver: delivery.driver,
        location: delivery.location.trim() || null,
        contract_id: matchedContract?.id ?? null,   // flags this as a contract extra
      };
      const { data: saved, error } = await supabase.from("invoices").insert([row]).select().single();
      if (error) throw new Error(error.message);
      await supabase.from("clients").upsert({ name: row.client }, { onConflict: "name", ignoreDuplicates: true });
      setToast({
        type: "success",
        msg: matchedContract
          ? `${saved.id ?? id} logged as CONTRACT EXTRA for ${matchedContract.id} — ${zar.format(row.amount)}`
          : `Invoice ${saved.id ?? id} logged — ${row.client}, ${zar.format(row.amount)}`,
      });
      setDelivery({ ...EMPTY_DELIVERY, date: today() });
      loadContext();
    } catch (err) {
      setToast({ type: "error", msg: `Invoice failed: ${err.message}` });
    } finally {
      setSubmittingInvoice(false);
    }
  }

  /* ── SUBMIT: new contract ─────────────────────────────────────────────── */
  async function handleContractSubmit(e) {
    e.preventDefault();
    if (submittingContract) return;
    setSubmittingContract(true);
    try {
      const row = {
        client: contractForm.client.trim(),
        site: contractForm.site.trim(),
        skips: Number(contractForm.skips) || 1,
        size: contractForm.size,
        mrr: Number(contractForm.mrr) || 0,
        since: today(),
      };
      const { data: saved, error } = await supabase.from("contracts").insert([row]).select().single();
      if (error) throw new Error(error.message);
      setToast({ type: "success", msg: `Contract registered — ${saved.client ?? row.client} @ ${zar.format(row.mrr)}/mo` });
      setContractForm(EMPTY_CONTRACT);
      loadContext();
    } catch (err) {
      setToast({ type: "error", msg: `Contract failed: ${err.message}` });
    } finally {
      setSubmittingContract(false);
    }
  }

  const inputCls = `w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all duration-200 tabular-nums ${s.input}`;
  const selectCls = `w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all duration-200 ${s.select}`;

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-7">
          <h1 className="text-xl font-extrabold tracking-tight">
            Dispatch &amp; Billing
            <span className={`ml-2.5 align-middle text-[10px] font-bold uppercase tracking-[0.2em] ${s.faint}`}>Admin Console</span>
          </h1>
          <p className={`mt-1 flex items-center gap-1.5 text-xs ${s.sub}`}>
            <CalendarDays size={12} /> Log deliveries and register contract clients — contract clients are auto-detected
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ════ LEFT — LOG DELIVERY ════ */}
          <section className={`rounded-2xl p-6 ${s.panel}`}>
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-[#0F0F13]">
                <Truck size={19} strokeWidth={2.3} />
              </div>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Log Delivery</h2>
                <p className={`text-xs ${s.sub}`}>Creates an invoice · marks skip as deployed</p>
              </div>
            </div>

            <form onSubmit={handleDeliverySubmit} className="space-y-4">
              <Field s={s} label="Client name" icon={User}>
                <input required list="dispatch-clients" value={delivery.client}
                  onChange={(e) => setDeliveryField("client", e.target.value)}
                  placeholder="e.g. Hillcrest Projects" className={inputCls} />
                <datalist id="dispatch-clients">
                  {clientNames.map((n) => <option key={n} value={n} />)}
                </datalist>
              </Field>

              {/* ── CONTRACT BUDGET FLAG ── */}
              {matchedContract && budget && (
                <div className="rounded-xl border border-amber-400/40 bg-amber-500/[0.08] p-4">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                    <Scale size={13} /> Contract client detected — {matchedContract.id}
                  </p>
                  <p className={`mt-1.5 text-xs leading-relaxed ${s.sub}`}>
                    <span className="font-semibold">{matchedContract.client}</span>&apos;s MRR of{" "}
                    <span className="font-bold tabular-nums text-cyan-400">{zar.format(matchedContract.mrr)}/mo</span> covers{" "}
                    <span className="font-bold tabular-nums">{budget.covered}× {matchedContract.size}</span> at {matchedContract.site}.
                    {budget.extrasOut > 0 && <> They already have <span className="font-bold tabular-nums text-amber-400">{budget.extrasOut} extra</span> on site, billed separately.</>}{" "}
                    This delivery takes them to <span className="font-bold tabular-nums">{budget.afterThis} skips</span> — over budget.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className={`rounded-lg px-3 py-2 text-[11px] leading-snug ${s.chip}`}>
                      <span className="font-bold text-amber-400">Option A (this form):</span> submit below — billed as a
                      separate ad-hoc invoice, linked to the contract.
                    </div>
                    <button type="button" onClick={adjustContract} disabled={adjusting}
                      className="rounded-lg border border-cyan-400/40 bg-cyan-500/[0.1] px-3 py-2 text-left text-[11px] font-medium leading-snug text-cyan-300 transition-colors hover:bg-cyan-500/[0.18]">
                      {adjusting ? <Loader2 size={12} className="mb-0.5 inline animate-spin" /> : <span className="font-bold">Option B:</span>}{" "}
                      adjust contract instead → {budget.covered + 1}× skips @{" "}
                      {zar.format(Math.round(matchedContract.mrr + matchedContract.mrr / matchedContract.skips))}/mo (pro-rata). No invoice.
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field s={s} label="Drop-off date" icon={CalendarDays}>
                  <input required type="date" value={delivery.date}
                    onChange={(e) => setDeliveryField("date", e.target.value)} className={inputCls} />
                </Field>
                <Field s={s} label="Skip size" icon={Container}>
                  <select value={delivery.size} onChange={(e) => setDeliveryField("size", e.target.value)} className={selectCls}>
                    {SKIP_SIZES.map((x) => <option key={x.size} value={x.size}>{x.label}</option>)}
                  </select>
                </Field>
              </div>

              <Field s={s} label="Location" icon={MapPin} hint="where the skip will stand">
                <input required value={delivery.location}
                  onChange={(e) => setDeliveryField("location", e.target.value)}
                  placeholder="e.g. 12 Koedoe St, Waterval East" className={inputCls} />
              </Field>

              <Field s={s} label="Hire type" icon={Gauge}>
                <Segmented s={s} options={HIRE_TYPES} value={delivery.hire} onChange={(v) => setDeliveryField("hire", v)} />
              </Field>

              <Field s={s} label="Payment method" icon={CreditCard}>
                <Segmented s={s} options={PAYMENT_METHODS} value={delivery.payment} onChange={(v) => setDeliveryField("payment", v)} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field s={s} label="Driver" icon={User}>
                  <select value={delivery.driver} onChange={(e) => setDeliveryField("driver", e.target.value)} className={selectCls}>
                    {DRIVERS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </Field>
                <Field s={s} label="Vehicle" icon={Truck}>
                  <select value={delivery.vehicle} onChange={(e) => setDeliveryField("vehicle", e.target.value)} className={selectCls}>
                    {VEHICLES.map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Field>
              </div>

              <Field s={s} label="Amount (ZAR)" icon={Banknote} hint="auto-quoted, editable">
                <input required type="number" min="0" step="50" value={delivery.amount}
                  onChange={(e) => setDeliveryField("amount", e.target.value)} className={inputCls} />
              </Field>

              <SubmitButton busy={submittingInvoice}
                label={matchedContract ? "Log as contract extra" : "Dispatch & Log"}
                busyLabel="Logging…" icon={Send} />
            </form>
          </section>

          {/* ════ RIGHT — REGISTER CONTRACT ════ */}
          <section className={`h-fit rounded-2xl p-6 ${s.panel}`}>
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-sky-600 text-[#0F0F13]">
                <FileSignature size={19} strokeWidth={2.3} />
              </div>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Register New Contract</h2>
                <p className={`text-xs ${s.sub}`}>Adds guaranteed MRR to the revenue base-load</p>
              </div>
            </div>

            <form onSubmit={handleContractSubmit} className="space-y-4">
              <Field s={s} label="Client entity" icon={User}>
                <input required value={contractForm.client}
                  onChange={(e) => setContractForm((p) => ({ ...p, client: e.target.value }))}
                  placeholder="e.g. WBHO — Menlyn Maine Ph 3" className={inputCls} />
              </Field>
              <Field s={s} label="Site location" icon={MapPin}>
                <input required value={contractForm.site}
                  onChange={(e) => setContractForm((p) => ({ ...p, site: e.target.value }))}
                  placeholder="e.g. Menlyn, Pretoria East" className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field s={s} label="Skip count" icon={Hash}>
                  <input required type="number" min="1" max="20" value={contractForm.skips}
                    onChange={(e) => setContractForm((p) => ({ ...p, skips: e.target.value }))} className={inputCls} />
                </Field>
                <Field s={s} label="Skip size" icon={Container}>
                  <select value={contractForm.size}
                    onChange={(e) => setContractForm((p) => ({ ...p, size: e.target.value }))} className={selectCls}>
                    {SKIP_SIZES.map((x) => <option key={x.size} value={x.size}>{x.label}</option>)}
                  </select>
                </Field>
              </div>
              <Field s={s} label="Agreed MRR (ZAR)" icon={Banknote} hint="guaranteed monthly recurring">
                <input required type="number" min="0" step="100" value={contractForm.mrr}
                  onChange={(e) => setContractForm((p) => ({ ...p, mrr: e.target.value }))}
                  placeholder="e.g. 7600" className={inputCls} />
              </Field>

              <div className={`rounded-xl px-4 py-3 text-xs ${s.chip}`}>
                <p className={`font-semibold uppercase tracking-[0.12em] ${s.faint}`}>Deal summary</p>
                <p className={`mt-1 tabular-nums ${s.sub}`}>
                  {contractForm.skips || 0}× {contractForm.size} permanent skip{Number(contractForm.skips) === 1 ? "" : "s"}
                  {contractForm.site ? ` @ ${contractForm.site}` : ""} ·{" "}
                  <span className="font-bold text-cyan-400">{zar.format(Number(contractForm.mrr) || 0)}/mo</span> ={" "}
                  <span className="font-semibold">{zar.format((Number(contractForm.mrr) || 0) * 12)}/yr</span>
                </p>
              </div>

              <SubmitButton busy={submittingContract} label="Register Contract" busyLabel="Registering…" icon={FileSignature} />
            </form>
          </section>
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className={`pointer-events-auto flex max-w-lg items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-xl ${
            toast.type === "success" ? "border-emerald-400/30 bg-emerald-500/[0.12] text-emerald-300"
                                     : "border-rose-400/30 bg-rose-500/[0.12] text-rose-300"
          }`}>
            {toast.type === "success" ? <CheckCircle2 size={18} className="shrink-0" /> : <XCircle size={18} className="shrink-0" />}
            <span>{toast.msg}</span>
            <button onClick={() => setToast(null)} aria-label="Dismiss" className="ml-1 opacity-60 hover:opacity-100"><X size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}