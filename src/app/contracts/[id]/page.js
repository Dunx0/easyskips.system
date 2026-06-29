"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Printer, ArrowLeft, Loader2, Container } from "lucide-react";

const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 });

export default function ContractPrintPage() {
  const params = useParams();
  const router = useRouter();
  
  const [contract, setContract] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    
    async function loadContractData() {
      setLoading(true);
      
      const [conRes, itemsRes, settingsRes] = await Promise.all([
        supabase.from("contracts").select("*").eq("id", params.id).single(),
        supabase.from("contract_line_items").select("*").eq("contract_id", params.id),
        supabase.from("settings").select("*").limit(1).maybeSingle()
      ]);

      if (conRes.data) setContract(conRes.data);
      if (settingsRes.data) setCompany(settingsRes.data);
      
      if (itemsRes.data && itemsRes.data.length > 0) {
        setLineItems(itemsRes.data.map(d => ({ skip_size: d.skip_size, quantity: d.quantity, unit_price: d.monthly_rate })));
      } else if (conRes.data) {
        const qty = conRes.data.skips || 1;
        setLineItems([{ skip_size: conRes.data.size || "6m³", quantity: qty, unit_price: Math.round(conRes.data.mrr / qty) }]);
      }
      
      setLoading(false);
    }
    
    loadContractData();
  }, [params?.id]);

  const subtotal = useMemo(() => lineItems.reduce((sum, l) => sum + (l.quantity * l.unit_price), 0), [lineItems]);
  const isVatRegistered = company.is_vat_registered !== false;
  const vatAmount = isVatRegistered ? subtotal * 0.15 : 0;
  const totalDue = subtotal + vatAmount;

  if (loading) return <div className="grid min-h-screen place-items-center bg-zinc-50"><Loader2 size={32} className="animate-spin text-cyan-500" /></div>;
  if (!contract) return <div className="p-8 text-center"><h2 className="text-xl font-bold">Contract not found</h2><button onClick={() => router.push("/invoices")} className="mt-4 text-cyan-600 underline">Return to Ledger</button></div>;

  return (
    <div className="min-h-screen bg-zinc-100 py-8 font-sans text-zinc-900 print:bg-white print:py-0">
      <div className="mx-auto mb-6 flex max-w-[800px] items-center justify-between px-4 print:hidden">
        <button onClick={() => router.back()} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm hover:bg-zinc-50"><ArrowLeft size={16} /> Back</button>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:brightness-105"><Printer size={16} /> Print SLA</button>
      </div>

      <div className="mx-auto max-w-[800px] bg-white p-12 shadow-xl print:m-0 print:max-w-none print:shadow-none sm:rounded-lg">
        {/* Header Block */}
        <div className="mb-12 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2"><Container size={28} className="text-cyan-600" /><h1 className="text-3xl font-black uppercase tracking-tighter">{company.company_name || "SkipCommand"}</h1></div>
            <div className="mt-3 text-sm text-zinc-600">{company.address && <p className="whitespace-pre-wrap">{company.address}</p>}<p className="mt-1">VAT: {company.vat_number || "4890123456"}</p></div>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-light uppercase tracking-widest text-zinc-300">Service SLA</h2>
            <div className="mt-4 text-sm font-semibold text-zinc-900"><p>ID: {contract.id}</p><p>Status: {contract.status || "Active"}</p></div>
          </div>
        </div>

        {/* Client & Details */}
        <div className="mb-10 grid grid-cols-2 gap-10">
          <div><h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Client</h3><p className="text-lg font-bold">{contract.client}</p></div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm"><h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-400">Contract Notes</h3><p>{contract.details || "No special terms specified."}</p></div>
        </div>

        {/* Lines */}
        <table className="w-full text-sm border-b border-zinc-200 mb-8">
          <thead className="bg-zinc-50"><tr className="text-left text-xs font-bold uppercase text-zinc-500"><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-center">Qty</th><th className="px-4 py-3 text-right">Unit Rate</th><th className="px-4 py-3 text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">{lineItems.map((l, i) => (<tr key={i}><td className="px-4 py-4 font-bold">{l.skip_size} Skip</td><td className="px-4 py-4 text-center">{l.quantity}</td><td className="px-4 py-4 text-right">{zar.format(l.unit_price)}</td><td className="px-4 py-4 text-right font-mono">{zar.format(l.quantity * l.unit_price)}</td></tr>))}</tbody>
        </table>

        {/* Totals & Footer (Matches Invoice) */}
        <div className="flex justify-end"><div className="w-1/2">{isVatRegistered && (<><div className="flex justify-between py-2 text-sm text-zinc-600"><span>Subtotal</span><span className="font-mono">{zar.format(subtotal)}</span></div><div className="flex justify-between py-2 text-sm text-zinc-600"><span>VAT (15%)</span><span className="font-mono">{zar.format(vatAmount)}</span></div></>)}<div className="flex justify-between py-3 text-lg font-black text-cyan-700"><span>Monthly MRR</span><span className="font-mono">{zar.format(totalDue)}</span></div></div></div>
      </div>
    </div>
  );
}