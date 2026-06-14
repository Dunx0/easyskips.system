'use client';

import { useState } from 'react';
import { invoices } from '@/lib/data';
import { R, pct, filterByPeriod, getPreviousPeriod } from '@/lib/helpers';
import KPICard from '@/components/KPICard';
import FilterBar from '@/components/FilterBar';

export default function Page() {
  const [period, setPeriod] = useState('month');
  const filtered = filterByPeriod(invoices, period);
  const prev = getPreviousPeriod(invoices, period);

  const rev = filtered.reduce((s, i) => s + i.amount, 0);
  const revP = prev.reduce((s, i) => s + i.amount, 0);
  const delta = revP > 0 ? ((rev - revP) / revP * 100) : 0;
  const bkd = filtered.reduce((s, i) => s + i.banked, 0);
  const bkdP = prev.reduce((s, i) => s + i.banked, 0);
  const bkdDelta = bkdP > 0 ? ((bkd - bkdP) / bkdP * 100) : 0;
  const ow = rev - bkd;

  return (
    <div>
      <FilterBar current={period} onChange={setPeriod} />

      <div className="grid grid-cols-4 gap-5 mb-6">
        <div className="es-card">
          <KPICard label="Revenue" value={R(rev)}
            change={(delta >= 0 ? '+' : '') + delta.toFixed(1) + '%'}
            direction={delta >= 0 ? 'up' : 'down'} />
        </div>
        <div className="es-card">
          <KPICard label="Collected" value={R(bkd)}
            change={(bkdDelta >= 0 ? '+' : '') + bkdDelta.toFixed(1) + '%'}
            direction={bkdDelta >= 0 ? 'up' : 'down'} />
        </div>
        <div className="es-card">
          <KPICard label="Outstanding" value={R(ow)}
            change={ow > 0 ? 'not yet banked' : 'all clear'}
            direction={ow > 0 ? 'warn' : 'up'} />
        </div>
        <div className="es-card">
          <KPICard label="Jobs" value={filtered.length}
            change={invoices.length + ' all time'}
            direction="neutral" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {[1, 2, 3].map(i => (
          <div key={i} className="es-card flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-2xl bg-[var(--bg2)] border border-[var(--line)] flex items-center justify-center mb-4">
              <div className="w-6 h-1 bg-[var(--line2)] rounded-full" />
            </div>
            <div className="w-24 h-2 bg-[var(--bg3)] rounded-full mb-2" />
            <div className="w-16 h-2 bg-[var(--bg2)] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
