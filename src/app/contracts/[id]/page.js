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
        supabase.from("settings").select("*").eq("key", "company").maybeSingle()
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

  // VAT Math Logic
  const isVatRegistered = company.is_vat_registered === true;
  const totalDue = Number(contract?.mrr || 0);
  const subtotal = isVatRegistered ? totalDue / 1.15 : totalDue;
  const vatAmount = isVatRegistered ? totalDue - subtotal : 0;

  if (loading) return <div className="grid min-h-screen place-items-center bg-zinc-50"><Loader2 size={32} className="animate-spin text-amber-500" /></div>;
  if (!contract) return <div className="p-8 text-center"><h2 className="text-xl font-bold">Contract not found</h2><button onClick={() => router.back()} className="mt-4 text-amber-500 underline">Go Back</button></div>;

  return (
    <div className="min-h-screen bg-zinc-100 py-8 font-sans text-zinc-900 print:bg-white print:py-0">
      
      {/* Screen-Only Controls */}
      <div className="mx-auto mb-6 flex max-w-[800px] items-center justify-between px-4 print:hidden">
        <button onClick={() => router.back()} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm hover:bg-zinc-50"><ArrowLeft size={16} /> Back</button>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 px-5 py-2 text-sm font-bold text-[#0F0F13] shadow-sm hover:brightness-105"><Printer size={16} /> Print SLA</button>
      </div>

      {/* The Printable A4 Page */}
      <div className="mx-auto max-w-[800px] bg-white p-12 shadow-xl print:m-0 print:max-w-none print:shadow-none sm:rounded-lg">
        
        {/* Header Block (Dynamic from Settings) */}
        <div className="mb-12 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter text-zinc-900">{company.company_name || "Easy Skips"}</h1>
            <div className="mt-3 text-sm leading-relaxed text-zinc-600">
              {company.reg_number && <p>Reg: {company.reg_number}</p>}
              {company.vat_number && <p>VAT: {company.vat_number}</p>}
              {company.address && <p className="whitespace-pre-wrap">{company.address}</p>}
              <p className="mt-1">
                {company.phone && <span className="mr-3">Tel: {company.phone}</span>}
                {company.email && <span>Email: {company.email}</span>}
              </p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-light uppercase tracking-widest text-zinc-300">Service SLA</h2>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-right">
              <span className="font-semibold text-zinc-500">Agreement No:</span>
              <span className="font-mono font-bold text-zinc-900">{contract.id}</span>
              <span className="font-semibold text-zinc-500">Status:</span>
              <span className="font-medium text-zinc-900 uppercase">{contract.status || "Active"}</span>
            </div>
          </div>
        </div>

        {/* Client & Job Details Block */}
        <div className="mb-10 grid grid-cols-2 gap-10">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-600">Client</h3>
            <p className="text-lg font-bold text-zinc-900">{contract.client}</p>
            {contract.site && <p className="mt-1 text-sm text-zinc-600">{contract.site}</p>}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-600">Contract Notes</h3>
            <p className="text-sm text-zinc-700 leading-relaxed">{contract.details || "No special terms specified."}</p>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-8 overflow-hidden rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr className="border-b border-zinc-200 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-center">Qty</th>
                <th className="px-4 py-3 text-right">Unit Rate</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {lineItems.map((item, index) => (
                <tr key={index}>
                  <td className="px-4 py-3.5 font-medium text-zinc-900">{item.skip_size} Monthly Skip Hire</td>
                  <td className="px-4 py-3.5 text-center text-zinc-600">{item.quantity}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-zinc-600">{zar.format(item.unit_price)}</td>
                  <td className="px-4 py-3.5 text-right font-mono font-medium text-zinc-900">{zar.format(item.quantity * item.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Block */}
        <div className="flex justify-end">
          <div className="w-1/2 min-w-[250px]">
            {isVatRegistered && (
              <>
                <div className="flex justify-between border-b border-zinc-100 py-2 text-sm text-zinc-600">
                  <span>Subtotal (Excl. VAT)</span>
                  <span className="font-mono">{zar.format(subtotal)}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-200 py-2 text-sm text-zinc-600">
                  <span>VAT (15%)</span>
                  <span className="font-mono">{zar.format(vatAmount)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between py-3 text-lg font-black text-zinc-900">
              <span>Monthly MRR</span>
              <span className="font-mono">{zar.format(totalDue)}</span>
            </div>
          </div>
        </div>

        {/* Footer / Banking Details */}
        <div className="mt-16 border-t border-zinc-200 pt-8">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-400">Payment Details</h3>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
            {company.bank_details || "Please contact us for banking details if paying via EFT."}
          </div>
          <p className="mt-8 text-center text-sm font-bold text-amber-500">
            Thank you for your business!
          </p>
        </div>

      </div>
    </div>
  );
}