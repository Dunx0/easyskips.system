"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SETTINGS — src/app/settings/page.js
 *
 *  Business configuration — all the things that used to be hardcoded:
 *    · Rate card          (rates table: daily/weekly/monthly per skip size)
 *    · Skip inventory     (skip_fleet table: how many of each size owned)
 *    · Vehicles / trucks  (vehicles table: add new, retire old)
 *    · Drivers            (drivers table: add new, deactivate when they leave)
 *    · Delivery zones     (zones table: range bands + surcharges for auto-quoting)
 *
 *  Schema alignment:
 *    vehicles: id(int), name, driver, type, util(int), status, active(bool — added by migration)
 *    skip_fleet: size, label, owned
 *    rates: size, label, daily, weekly, monthly
 *    drivers: id(uuid), name, active
 *    zones: id(uuid), label, max_km, surcharge, sort
 *    settings: key, value  (kept for any future simple key/value config)
 *
 *  Admin only (middleware enforces; RLS enforces at the DB).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/AppShell";
import {
  Settings, Banknote, Container, Truck, User, MapPin,
  Loader2, CheckCircle2, XCircle, Plus, Save, Power, Trash2,
} from "lucide-react";

const zar = new Intl.NumberFormat("en-ZA", {
  style: "currency", currency: "ZAR", maximumFractionDigits: 0,
});

const T = {
  dark: {
    panel: "bg-white/[0.035] border border-white/[0.07] backdrop-blur-xl",
    sub: "text-zinc-400", faint: "text-zinc-500",
    hairline: "border-white/[0.07]", divide: "divide-white/[0.05]",
    input: "bg-white/[0.04] border border-white/[0.09] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/15",
    button: "bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-zinc-300",
    chip: "bg-white/[0.05] border border-white/[0.08]",
  },
  light: {
    panel: "bg-white border border-zinc-200 shadow-sm",
    sub: "text-zinc-500", faint: "text-zinc-400",
    hairline: "border-zinc-200", divide: "divide-zinc-100",
    input: "bg-white border border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15",
    button: "bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600",
    chip: "bg-zinc-100 border border-zinc-200",
  },
};

/* ── shared sub-components ───────────────────────────────────────────────── */

function SectionHead({ icon: Icon, title, sub, s }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]">
        <Icon size={15} className="text-amber-400" /> {title}
      </h2>
      <p className={`mt-0.5 text-xs ${s.sub}`}>{sub}</p>
    </div>
  );
}

function SaveBtn({ busy, dirty, onClick }) {
  return (
    <button onClick={onClick} disabled={busy || !dirty}
      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
        !dirty
          ? "cursor-default opacity-40 bg-white/[0.05] text-zinc-500 border border-white/[0.05]"
          : busy
          ? "cursor-not-allowed bg-amber-500/40 text-[#0F0F13]/60"
          : "bg-gradient-to-br from-amber-400 to-orange-500 text-[#0F0F13] hover:brightness-105"
      }`}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
      {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
    </button>
  );
}

function ActiveBadge({ active, busy, onToggle }) {
  return (
    <button onClick={onToggle} disabled={busy}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
        active
          ? "bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-500/25"
          : "bg-zinc-500/12 text-zinc-400 ring-1 ring-zinc-500/20"
      } ${busy ? "opacity-50" : "hover:scale-[1.03]"}`}>
      {busy ? <Loader2 size={11} className="animate-spin" /> : <Power size={11} />}
      {active ? "Active" : "Inactive"}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════════════ */

export default function SettingsPage() {
  const { dark } = useTheme();
  const s = T[dark ? "dark" : "light"];

  /* state per section */
  const [rates, setRates] = useState([]);
  const [skipFleet, setSkipFleet] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [zones, setZones] = useState([]);

  const [dirty, setDirty] = useState({ rates: false, fleet: false, zones: false });
  const [saving, setSaving] = useState(null); // which section is saving
  const [loading, setLoading] = useState(true);
  const [busyRow, setBusyRow] = useState(null);

  /* add-row state */
  const [newVehicle, setNewVehicle] = useState({ name: "", driver: "", type: "" });
  const [newDriver, setNewDriver] = useState("");
  const [newZone, setNewZone] = useState({ label: "", max_km: "", surcharge: "" });
  const [newSkip, setNewSkip] = useState({ size: "", label: "", owned: "" });

  const [toast, setToast] = useState(null);

  /* ── load ──────────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    const [r, sf, v, d, z] = await Promise.all([
      supabase.from("rates").select("*").order("size"),
      supabase.from("skip_fleet").select("*").order("size"),
      supabase.from("vehicles").select("*").order("name"),
      supabase.from("drivers").select("*").order("name"),
      supabase.from("zones").select("*").order("sort"),
    ]);
    const err = r.error || sf.error || v.error || d.error || z.error;
    if (err) setToast({ type: "error", msg: `Load failed: ${err.message} — has the final migration SQL been run?` });
    setRates(r.data ?? []);
    setSkipFleet(sf.data ?? []);
    setVehicles(v.data ?? []);
    setDrivers(d.data ?? []);
    setZones(z.data ?? []);
    setDirty({ rates: false, fleet: false, zones: false });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  /* ── bulk save helpers ─────────────────────────────────────────────────── */
  async function saveSection(table, rows, dirtyKey) {
    setSaving(table);
    const { error } = await supabase.from(table).upsert(rows);
    setSaving(null);
    if (error) return setToast({ type: "error", msg: `${table}: ${error.message}` });
    setDirty((p) => ({ ...p, [dirtyKey]: false }));
    setToast({ type: "success", msg: `${table === "skip_fleet" ? "Fleet" : table} saved — live everywhere immediately` });
  }

  /* ── rate card edits ───────────────────────────────────────────────────── */
  const editRate = (size, field, val) => {
    setRates((p) => p.map((r) => r.size === size ? { ...r, [field]: Number(val) || 0 } : r));
    setDirty((p) => ({ ...p, rates: true }));
  };

  /* ── skip fleet edits ──────────────────────────────────────────────────── */
  const editFleet = (size, val) => {
    setSkipFleet((p) => p.map((f) => f.size === size ? { ...f, owned: Math.max(0, Number(val) || 0) } : f));
    setDirty((p) => ({ ...p, fleet: true }));
  };

  /* add a brand-new skip size (writes immediately, not via Save button) */
  async function addSkipSize() {
    const size = newSkip.size.trim();
    const label = newSkip.label.trim();
    if (!size) return setToast({ type: "error", msg: "Enter a size, e.g. 12m³" });
    if (skipFleet.some((f) => f.size === size)) return setToast({ type: "error", msg: `${size} already exists` });
    const row = { size, label: label || size, owned: Math.max(0, Number(newSkip.owned) || 0) };
    const { data, error } = await supabase.from("skip_fleet").insert(row).select().single();
    if (error) return setToast({ type: "error", msg: error.message });
    setSkipFleet((p) => [...p, data].sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true })));
    setNewSkip({ size: "", label: "", owned: "" });
    setToast({ type: "success", msg: `${size} skip size added` });
  }

  /* remove a skip size — guarded: warn it won't affect existing invoices */
  async function removeSkipSize(f) {
    if (!confirm(`Remove the ${f.size} (${f.label}) size?\n\nExisting invoices keep their data, but this size will no longer be selectable for new dispatches or quotes.`)) return;
    setBusyRow(f.size);
    const { error } = await supabase.from("skip_fleet").delete().eq("size", f.size);
    setBusyRow(null);
    if (error) return setToast({ type: "error", msg: error.message });
    setSkipFleet((p) => p.filter((x) => x.size !== f.size));
    setToast({ type: "success", msg: `${f.size} removed` });
  }

  /* ── zone edits ────────────────────────────────────────────────────────── */
  const editZone = (id, field, val) => {
    setZones((p) => p.map((z) => z.id === id ? { ...z, [field]: field === "label" ? val : Number(val) || 0 } : z));
    setDirty((p) => ({ ...p, zones: true }));
  };

  /* ── add vehicle ───────────────────────────────────────────────────────── */
  async function addVehicle() {
    if (!newVehicle.name.trim()) return;
    const { data, error } = await supabase.from("vehicles")
      .insert({ name: newVehicle.name.trim(), driver: newVehicle.driver.trim() || null, type: newVehicle.type.trim() || null, status: "active", util: 0 })
      .select().single();
    if (error) return setToast({ type: "error", msg: error.message });
    setVehicles((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewVehicle({ name: "", driver: "", type: "" });
    setToast({ type: "success", msg: `${data.name} added` });
  }

  /* ── toggle vehicle status ─────────────────────────────────────────────── */
  async function toggleVehicleStatus(v) {
    const nextStatus = v.status === "active" ? "retired" : "active";
    setBusyRow(v.id);
    const { error } = await supabase.from("vehicles").update({ status: nextStatus }).eq("id", v.id);
    setBusyRow(null);
    if (error) return setToast({ type: "error", msg: error.message });
    setVehicles((p) => p.map((x) => x.id === v.id ? { ...x, status: nextStatus } : x));
  }

  /* ── add driver ────────────────────────────────────────────────────────── */
  async function addDriver() {
    const name = newDriver.trim();
    if (!name) return;
    const { data, error } = await supabase.from("drivers")
      .insert({ name, active: true }).select().single();
    if (error) return setToast({ type: "error", msg: error.message });
    setDrivers((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewDriver("");
    setToast({ type: "success", msg: `${name} added` });
  }

  /* ── toggle driver active ──────────────────────────────────────────────── */
  async function toggleDriver(d) {
    setBusyRow(d.id);
    const { error } = await supabase.from("drivers").update({ active: !d.active }).eq("id", d.id);
    setBusyRow(null);
    if (error) return setToast({ type: "error", msg: error.message });
    setDrivers((p) => p.map((x) => x.id === d.id ? { ...x, active: !d.active } : x));
  }

  /* ── add zone ──────────────────────────────────────────────────────────── */
  async function addZone() {
    if (!newZone.label.trim() || !newZone.max_km) return;
    const { data, error } = await supabase.from("zones")
      .insert({ label: newZone.label.trim(), max_km: Number(newZone.max_km), surcharge: Number(newZone.surcharge) || 0, sort: zones.length + 1 })
      .select().single();
    if (error) return setToast({ type: "error", msg: error.message });
    setZones((p) => [...p, data]);
    setNewZone({ label: "", max_km: "", surcharge: "" });
    setToast({ type: "success", msg: `${data.label} added` });
  }

  /* ── shared input styles ───────────────────────────────────────────────── */
  const inp = `w-full rounded-lg px-2.5 py-1.5 text-sm tabular-nums outline-none transition-all ${s.input}`;

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 size={24} className="animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-6">
          <h1 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
            <Settings size={20} className="text-amber-400" /> Business Settings
          </h1>
          <p className={`mt-1 text-xs ${s.sub}`}>
            Rates, fleet, vehicles, drivers and delivery zones — changes here apply instantly across quotes and dispatch
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* ── RATE CARD ─────────────────────────────────────────────── */}
          <section className={`rounded-2xl p-5 ${s.panel}`}>
            <div className="flex items-start justify-between">
              <SectionHead icon={Banknote} title="Rate card" sub="Hire price per skip size (ZAR)" s={s} />
              <SaveBtn busy={saving === "rates"} dirty={dirty.rates}
                onClick={() => saveSection("rates", rates, "rates")} />
            </div>
            {rates.length === 0 ? (
              <p className={`text-sm ${s.faint}`}>No rates found — run the final migration SQL.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wider ${s.hairline} ${s.faint}`}>
                    <th className="pb-2">Size</th>
                    <th className="pb-2">Daily (R)</th>
                    <th className="pb-2">Weekly (R)</th>
                    <th className="pb-2">Monthly (R)</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${s.divide}`}>
                  {rates.map((r) => (
                    <tr key={r.size}>
                      <td className="py-2.5 pr-3">
                        <span className="font-bold tabular-nums">{r.size}</span>{" "}
                        <span className={`text-xs ${s.faint}`}>{r.label}</span>
                      </td>
                      {["daily", "weekly", "monthly"].map((f) => (
                        <td key={f} className="py-2.5 pr-2">
                          <input type="number" min="0" step="50" value={r[f]}
                            onChange={(e) => editRate(r.size, f, e.target.value)}
                            className={inp} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ── SKIP FLEET ─────────────────────────────────────────────── */}
          <section className={`rounded-2xl p-5 ${s.panel}`}>
            <div className="flex items-start justify-between">
              <SectionHead icon={Container} title="Skip inventory"
                sub="Sizes you own and how many — add new sizes, edit counts, remove sizes" s={s} />
              <SaveBtn busy={saving === "skip_fleet"} dirty={dirty.fleet}
                onClick={() => saveSection("skip_fleet", skipFleet, "fleet")} />
            </div>

            <div className="space-y-2">
              {skipFleet.map((f) => (
                <div key={f.size} className="flex items-center gap-3">
                  <div className="w-28">
                    <p className="text-sm font-bold tabular-nums">{f.size}</p>
                    <p className={`text-xs ${s.faint}`}>{f.label}</p>
                  </div>
                  <input type="number" min="0" max="999" value={f.owned}
                    onChange={(e) => editFleet(f.size, e.target.value)}
                    className={`w-24 rounded-lg px-2.5 py-1.5 text-sm tabular-nums outline-none ${s.input}`} />
                  <span className={`flex-1 text-xs ${s.faint}`}>owned</span>
                  <button onClick={() => removeSkipSize(f)} disabled={busyRow === f.size}
                    title="Remove this size"
                    className="rounded-lg p-2 text-rose-400 transition-colors hover:bg-rose-500/10">
                    {busyRow === f.size ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
              {skipFleet.length === 0 && (
                <p className={`py-3 text-sm ${s.faint}`}>No skip sizes yet — add your first below.</p>
              )}
            </div>

            {/* add new size */}
            <div className={`mt-4 border-t pt-4 ${s.hairline}`}>
              <p className={`mb-2 text-[11px] font-semibold uppercase tracking-wider ${s.faint}`}>Add a new size</p>
              <div className="grid grid-cols-3 gap-2">
                <input value={newSkip.size} onChange={(e) => setNewSkip((p) => ({ ...p, size: e.target.value }))}
                  placeholder="Size e.g. 12m³" className={inp} />
                <input value={newSkip.label} onChange={(e) => setNewSkip((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Label e.g. Jumbo" className={inp} />
                <div className="flex gap-2">
                  <input type="number" min="0" value={newSkip.owned}
                    onChange={(e) => setNewSkip((p) => ({ ...p, owned: e.target.value }))}
                    placeholder="Qty" className={inp} />
                  <button onClick={addSkipSize}
                    className={`flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${s.button}`}>
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              <p className={`mt-2 text-[11px] leading-relaxed ${s.faint}`}>
                New sizes become selectable in Dispatch and Quotes immediately. Set a rate for the new size in the
                Rate card section so it can be auto-priced. "Deployed" is derived live from uncollected invoices.
              </p>
            </div>
          </section>

          {/* ── VEHICLES ───────────────────────────────────────────────── */}
          <section className={`rounded-2xl p-5 ${s.panel}`}>
            <SectionHead icon={Truck} title="Vehicles"
              sub="Add trucks, retire old ones — retired vehicles stay in invoice history" s={s} />

            {/* add new */}
            <div className="mb-4 grid grid-cols-3 gap-2">
              <input value={newVehicle.name} onChange={(e) => setNewVehicle((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. KPR 331 GP" className={inp} />
              <input value={newVehicle.driver} onChange={(e) => setNewVehicle((p) => ({ ...p, driver: e.target.value }))}
                placeholder="Assigned driver" className={inp} />
              <input value={newVehicle.type} onChange={(e) => setNewVehicle((p) => ({ ...p, type: e.target.value }))}
                placeholder="Type e.g. Hino 500" className={inp} />
            </div>
            <button onClick={addVehicle}
              className={`mb-4 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${s.button}`}>
              <Plus size={13} /> Add vehicle
            </button>

            <div className={`divide-y ${s.divide}`}>
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className={`text-sm font-medium ${v.status === "retired" ? `line-through ${s.faint}` : ""}`}>
                      {v.name}
                    </p>
                    <p className={`text-xs ${s.faint}`}>
                      {[v.type, v.driver].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ActiveBadge active={v.status !== "retired"} busy={busyRow === v.id}
                    onToggle={() => toggleVehicleStatus(v)} />
                </div>
              ))}
              {vehicles.length === 0 && (
                <p className={`py-4 text-sm ${s.faint}`}>No vehicles yet — add one above.</p>
              )}
            </div>
          </section>

          {/* ── DRIVERS ────────────────────────────────────────────────── */}
          <section className={`rounded-2xl p-5 ${s.panel}`}>
            <SectionHead icon={User} title="Drivers"
              sub="Deactivate when a driver leaves — their name stays on past invoices" s={s} />

            <div className="mb-4 flex gap-2">
              <input value={newDriver} onChange={(e) => setNewDriver(e.target.value)}
                placeholder="e.g. Lucas N." onKeyDown={(e) => e.key === "Enter" && addDriver()}
                className={`flex-1 rounded-xl px-3.5 py-2 text-sm outline-none ${s.input}`} />
              <button onClick={addDriver}
                className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold ${s.button}`}>
                <Plus size={13} /> Add
              </button>
            </div>

            <div className={`divide-y ${s.divide}`}>
              {drivers.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2.5">
                  <span className={`text-sm ${d.active ? "" : `line-through ${s.faint}`}`}>{d.name}</span>
                  <ActiveBadge active={d.active} busy={busyRow === d.id}
                    onToggle={() => toggleDriver(d)} />
                </div>
              ))}
              {drivers.length === 0 && (
                <p className={`py-4 text-sm ${s.faint}`}>No drivers yet — add one above.</p>
              )}
            </div>
          </section>

          {/* ── DELIVERY ZONES ─────────────────────────────────────────── */}
          <section className={`rounded-2xl p-5 lg:col-span-2 ${s.panel}`}>
            <div className="flex items-start justify-between">
              <SectionHead icon={MapPin} title="Delivery zones"
                sub="Distance bands from the yard — surcharge is added automatically when quoting" s={s} />
              <SaveBtn busy={saving === "zones"} dirty={dirty.zones}
                onClick={() => saveSection("zones", zones, "zones")} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wider ${s.hairline} ${s.faint}`}>
                    <th className="pb-2 pr-3">Zone label</th>
                    <th className="pb-2 pr-3">Up to (km)</th>
                    <th className="pb-2">Surcharge (R)</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${s.divide}`}>
                  {zones.map((z) => (
                    <tr key={z.id}>
                      <td className="py-2 pr-3">
                        <input value={z.label}
                          onChange={(e) => editZone(z.id, "label", e.target.value)}
                          className={inp} />
                      </td>
                      <td className="py-2 pr-3">
                        <input type="number" min="1" value={z.max_km}
                          onChange={(e) => editZone(z.id, "max_km", e.target.value)}
                          className={inp} />
                      </td>
                      <td className="py-2">
                        <input type="number" min="0" step="50" value={z.surcharge}
                          onChange={(e) => editZone(z.id, "surcharge", e.target.value)}
                          className={inp} />
                      </td>
                    </tr>
                  ))}
                  {/* add new zone row */}
                  <tr>
                    <td className="py-2 pr-3">
                      <input value={newZone.label}
                        onChange={(e) => setNewZone((p) => ({ ...p, label: e.target.value }))}
                        placeholder="New zone label" className={inp} />
                    </td>
                    <td className="py-2 pr-3">
                      <input type="number" value={newZone.max_km}
                        onChange={(e) => setNewZone((p) => ({ ...p, max_km: e.target.value }))}
                        placeholder="km" className={inp} />
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <input type="number" value={newZone.surcharge}
                          onChange={(e) => setNewZone((p) => ({ ...p, surcharge: e.target.value }))}
                          placeholder="R" className={inp} />
                        <button onClick={addZone}
                          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${s.button}`}>
                          <Plus size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={`mt-3 text-[11px] ${s.faint}`}>
              Zone A surcharge is typically R0 (local delivery included in hire price).
              Zones are used by the Quotes page auto-pricer.
            </p>
          </section>

        </div>
      </div>

      {/* toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-xl ${
            toast.type === "success"
              ? "border-emerald-400/30 bg-emerald-500/[0.12] text-emerald-300"
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