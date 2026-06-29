"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2, Printer, ArrowLeft, Container, FileSignature } from "lucide-react";

const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 });
const VAT_RATE = 0.15;

export default function ContractPrintPage() {
  const { id } = useParams();
  const router = useRouter();
  
  const [contract, setContract] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadContract() {
      try {
        // 1. Fetch Contract Head
        const { data: cData, error: cErr } = await supabase
          .from("contracts")
          .select("*")
          .eq("id", id)
          .single();
          
        if (cErr) throw cErr;
        setContract(cData);

        // 2. Fetch Line Items
        const { data: lData, error: lErr } = await supabase
          .from("contract_line_items")
          .select("*")
          .eq("contract_id", id);
          
        if (!lErr && lData) {
          setLines(lData);
        } else {
          // Fallback if line items don't exist yet, build a mock line from the head
          setLines([{ skip_size: cData.size || "6m³", quantity: cData.skips || 1, monthly_rate: cData.mrr ? Math.round(cData.mrr / (cData.skips || 1)) : 0 }]);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    if (id) loadContract();
  }, [id]);

  const subtotal = useMemo(() => {
    if (lines.length > 0) return lines.reduce((sum, l) => sum + (l.quantity * l.monthly_rate), 0);
    return contract?.mrr || 0;
  }, [lines, contract]);

  const vatAmount = subtotal * VAT_RATE;
  const totalAmount = subtotal + vatAmount;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F0F13]">
        <Loader2 size={32} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0F0F13] text-zinc-100">
        <p className="text-rose-400">Error loading contract: {error || "Not found"}</p>
        <button onClick={() => router.back()} className="mt-4 rounded-lg bg-white/[0.05] px-4 py-2 hover:bg-white/[0.1]">Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 p-4 font-sans text-zinc-900 print:bg-white print:p-0 sm:p-8">
      
      {/* --- NON-PRINTABLE CONTROL BAR --- */}
      <div className="mx-auto mb-8 flex max-w-4xl items-center justify-between rounded-2xl bg-white p-4 shadow-sm print:hidden">
        <button 
          onClick={() => router.back()} 
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <ArrowLeft size={16} /> Back to Ledger
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-zinc-400">Optimized for A4 Printing</span>
          <button 
            onClick={() => window.print()} 
            className="flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-bold tracking-wide text-white transition-all hover:bg-cyan-700 active:scale-95 shadow-md shadow-cyan-600/20"
          >
            <Printer size={16} /> Print SLA
          </button>
        </div>
      </div>

      {/* --- A4 PRINTABLE CANVAS --- */}
      <div className="mx-auto max-w-4xl bg-white p-10 shadow-xl print:m-0 print:w-full print:max-w-none print:p-8 print:shadow-none sm:p-16">
        
        {/* Header Block */}
        <div className="flex items-start justify-between border-b-2 border-zinc-800 pb-8">
          <div>
            <div className="flex items-center gap-2 text-zinc-900">
              <Container size={28} strokeWidth={2.5} className="text-cyan-600" />
              <h1 className="text-2xl font-black tracking-tight">SkipCommand</h1>
            </div>
            <p className="mt-1 text-xs font-semibold text-zinc-500">PTA DISPATCH & LOGISTICS</p>
            <div className="mt-4 space-y-0.5 text-sm text-zinc-600">
              <p>100 Pretoria East Industrial</p>
              <p>Pretoria, 0081</p>
              <p>VAT No: 4890123456</p>
              <p>accounts@skipcommand.co.za</p>
            </div>
          </div>
          
          <div className="text-right">
            <h2 className="text-3xl font-black uppercase tracking-widest text-zinc-200 print:text-zinc-400">Service SLA</h2>
            <div className="mt-4 space-y-1 text-sm tabular-nums text-zinc-600">
              <p><span className="font-semibold text-zinc-900">Agreement No:</span> {contract.id}</p>
              <p><span className="font-semibold text-zinc-900">Effective Date:</span> {contract.since || "TBD"}</p>
              <p><span className="font-semibold text-zinc-900">Status:</span> <span className="uppercase">{contract.status || "Active"}</span></p>
            </div>
          </div>
        </div>

        {/* Client Block */}
        <div className="my-8 rounded-xl border border-zinc-200 bg-zinc-50 p-6">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-cyan-600">Client / Site Details</h3>
          <div className="grid grid-cols-2 gap-8 text-sm">
            <div>
              <p className="font-bold text-zinc-900 text-base">{contract.client}</p>
              <p className="mt-1 text-zinc-600">Attn: Site Manager / Accounts</p>
            </div>
            <div>
              <p className="font-bold text-zinc-900">Deployment Site:</p>
              <p className="mt-1 text-zinc-600">{contract.site || "As specified per dispatch"}</p>
              {contract.details && (
                <p className="mt-2 text-xs text-zinc-500"><span className="font-semibold">Notes:</span> {contract.details}</p>
              )}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-800 text-left text-xs font-bold uppercase tracking-wider text-zinc-900">
              <th className="py-3 pr-4">Asset / Service Description</th>
              <th className="py-3 pr-4 text-center">Qty</th>
              <th className="py-3 pr-4 text-right">Unit Rate (Excl. VAT)</th>
              <th className="py-3 text-right">Monthly Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 border-b border-zinc-200">
            {lines.map((item, idx) => (
              <tr key={idx}>
                <td className="py-4 pr-4">
                  <p className="font-bold text-zinc-900">{item.skip_size} Heavy Duty Skip</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Monthly recurring rental footprint</p>
                </td>
                <td className="py-4 pr-4 text-center font-medium tabular-nums">{item.quantity}</td>
                <td className="py-4 pr-4 text-right tabular-nums text-zinc-600">{zar.format(item.monthly_rate)}</td>
                <td className="py-4 text-right font-semibold tabular-nums text-zinc-900">{zar.format(item.quantity * item.monthly_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Block */}
        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-3 text-sm tabular-nums">
            <div className="flex justify-between text-zinc-600">
              <span>Base MRR (Excl. VAT)</span>
              <span>{zar.format(subtotal)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>VAT @ 15%</span>
              <span>{zar.format(vatAmount)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-zinc-800 pt-3 text-lg font-black text-cyan-700">
              <span>Gross MRR</span>
              <span>{zar.format(totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Terms & Signatures */}
        <div className="mt-16 pt-8 border-t border-zinc-200">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-900 mb-2">Standard Terms of Agreement</h3>
          <p className="text-[10px] leading-relaxed text-zinc-500 text-justify">
            This schedule constitutes a binding Service Level Agreement (SLA). The Monthly Recurring Revenue (MRR) outlined above will be invoiced on the 1st of every month, payable strictly within 30 days. Standard environmental and weight restrictions apply to all skips. Hazardous waste is strictly prohibited unless authorized in writing. SkipCommand reserves the right to suspend servicing if accounts fall into arrears. Extra collections outside of the agreed swap schedule will be billed as separate ad-hoc invoices at prevailing standard rates.
          </p>

          <div className="mt-12 grid grid-cols-2 gap-12">
            <div>
              <div className="border-b border-zinc-400 pb-8 flex items-end">
                <FileSignature className="text-zinc-300 mr-2" size={24} />
              </div>
              <p className="mt-2 text-xs font-bold text-zinc-900">Authorized Signature (Client)</p>
              <p className="text-[10px] text-zinc-500">Date: ____________________</p>
            </div>
            <div>
              <div className="border-b border-zinc-400 pb-8 flex items-end">
                <span className="font-black text-cyan-700/40 text-xl tracking-tighter ml-2">SkipCommand</span>
              </div>
              <p className="mt-2 text-xs font-bold text-zinc-900">Authorized Signature (Provider)</p>
              <p className="text-[10px] text-zinc-500">Date: ____________________</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}