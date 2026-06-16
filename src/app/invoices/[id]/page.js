"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Printer, ArrowLeft, Loader2 } from "lucide-react";

const zar = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 });

// Fallback parser for older invoices that might not have records in the invoice_line_items table
function parseItemsFallback(itemsStr, totalAmount) {
  if (!itemsStr) return [];
  const out = []; 
  const re = /(\d+)\s*[x×]\s*(\d(?:\.\d)?m³)/gi; 
  let m;
  while ((m = re.exec(itemsStr)) !== null) out.push({ quantity: +m[1], skip_size: m[2] });
  if (out.length === 0) { 
    const sm = itemsStr.match(/(\d(?:\.\d)?m³)/); 
    if (sm) out.push({ quantity: 1, skip_size: sm[1] }); 
  }
  
  // Distribute total amount roughly to get a unit price
  const totalQty = out.reduce((sum, item) => sum + item.quantity, 0) || 1;
  const unitPrice = totalAmount / totalQty;
  
  return out.map(item => ({ ...item, unit_price: unitPrice }));
}

export default function InvoicePrintPage() {
  const params = useParams();
  const router = useRouter();
  
  const [invoice, setInvoice] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    
    async function loadInvoiceData() {
      setLoading(true);
      
      const [invRes, itemsRes, settingsRes] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", params.id).single(),
        supabase.from("invoice_line_items").select("*").eq("invoice_id", params.id),
        supabase.from("settings").select("*").eq("key", "company").maybeSingle()
      ]);

      if (invRes.data) setInvoice(invRes.data);
      if (settingsRes.data) setCompany(settingsRes.data);
      
      // Use database line items if they exist, otherwise use the fallback string parser
      if (itemsRes.data && itemsRes.data.length > 0) {
        setLineItems(itemsRes.data);
      } else if (invRes.data) {
        setLineItems(parseItemsFallback(invRes.data.items, invRes.data.amount));
      }
      
      setLoading(false);
    }
    
    loadInvoiceData();
  }, [params?.id]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-50">
        <Loader2 size={32} className="animate-spin text-amber-500" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold">Invoice not found</h2>
        <button onClick={() => router.push("/invoices")} className="mt-4 text-amber-500 underline">Return to Ledger</button>
      </div>
    );
  }

  // VAT Math Logic
  const isVatRegistered = company.is_vat_registered === true;
  const totalDue = Number(invoice.amount || 0);
  const subtotal = isVatRegistered ? totalDue / 1.15 : totalDue;
  const vatAmount = isVatRegistered ? totalDue - subtotal : 0;

  return (
    <div className="min-h-screen bg-zinc-100 py-8 font-sans text-zinc-900 print:bg-white print:py-0">
      
      {/* Screen-Only Controls (Hidden during print) */}
      <div className="mx-auto mb-6 flex max-w-[800px] items-center justify-between px-4 print:hidden">
        <button onClick={() => router.back()} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm transition-hover hover:bg-zinc-50">
          <ArrowLeft size={16} /> Back
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 px-5 py-2 text-sm font-bold text-[#0F0F13] shadow-sm transition-hover hover:brightness-105">
          <Printer size={16} /> Print Document
        </button>
      </div>

      {/* The Printable A4 Page */}
      <div className="mx-auto max-w-[800px] bg-white p-12 shadow-xl print:m-0 print:max-w-none print:shadow-none sm:rounded-lg print:sm:rounded-none">
        
        {/* Header Block */}
        <div className="mb-12 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter text-zinc-900">
              {company.company_name || "Easy Skips"}
            </h1>
            <div className="mt-3 text-sm leading-relaxed text-zinc-600">
              {company.reg_number && <p>Reg: {company.reg_number}</p>}
              {company.vat_number && <p>VAT: {company.vat_number}</p>}
              {company.address && <p className="mt-1 whitespace-pre-wrap">{company.address}</p>}
              <p className="mt-1">
                {company.phone && <span className="mr-3">Tel: {company.phone}</span>}
                {company.email && <span>Email: {company.email}</span>}
              </p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-light uppercase tracking-widest text-zinc-300">
              {isVatRegistered ? "Tax Invoice" : "Invoice"}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="font-semibold text-zinc-500">Invoice No:</span>
              <span className="font-mono font-bold text-zinc-900">{invoice.id}</span>
              <span className="font-semibold text-zinc-500">Date:</span>
              <span className="font-medium text-zinc-900">{invoice.date}</span>
            </div>
          </div>
        </div>

        {/* Client & Job Details Block */}
        <div className="mb-10 grid grid-cols-2 gap-10">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-400">Bill To</h3>
            <p className="text-lg font-bold text-zinc-900">{invoice.client}</p>
            {invoice.location && (
              <p className="mt-1 text-sm leading-relaxed text-zinc-600">{invoice.location}</p>
            )}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-400">Job Details</h3>
            <ul className="space-y-1.5 text-sm text-zinc-700">
              <li className="flex justify-between"><span>Hire Period:</span> <span className="font-semibold">{invoice.hire || "Weekly"}</span></li>
              {invoice.vehicle && <li className="flex justify-between"><span>Vehicle:</span> <span className="font-semibold">{invoice.vehicle}</span></li>}
              {invoice.driver && <li className="flex justify-between"><span>Driver:</span> <span className="font-semibold">{invoice.driver}</span></li>}
              <li className="flex justify-between"><span>Payment:</span> <span className="font-semibold">{invoice.payment || "EFT"}</span></li>
            </ul>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-8 overflow-hidden rounded-xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr className="border-b border-zinc-200 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-center">Qty</th>
                <th className="px-4 py-3 text-right">Unit Price</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {lineItems.map((item, index) => {
                const lineTotal = item.quantity * item.unit_price;
                return (
                  <tr key={index}>
                    <td className="px-4 py-3.5 font-medium text-zinc-900">{item.skip_size} Skip Hire</td>
                    <td className="px-4 py-3.5 text-center text-zinc-600">{item.quantity}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-zinc-600">{zar.format(item.unit_price)}</td>
                    <td className="px-4 py-3.5 text-right font-mono font-medium text-zinc-900">{zar.format(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals Block */}
        <div className="flex justify-end">
          <div className="w-1/2 min-w-[250px]">
            {isVatRegistered ? (
              <>
                <div className="flex justify-between border-b border-zinc-100 py-2 text-sm text-zinc-600">
                  <span>Subtotal</span>
                  <span className="font-mono">{zar.format(subtotal)}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-200 py-2 text-sm text-zinc-600">
                  <span>VAT (15%)</span>
                  <span className="font-mono">{zar.format(vatAmount)}</span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between py-3 text-lg font-black text-zinc-900">
              <span>Total Due</span>
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