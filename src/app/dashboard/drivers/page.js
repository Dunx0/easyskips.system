'use client';

import { useState } from 'react';
import { invoices, costs } from '@/lib/data';
import { R, Rk, pct, filterByPeriod, buildDriverStats, totalSkips } from '@/lib/helpers';
import KPICard from '@/components/KPICard';
import FilterBar from '@/components/FilterBar';

export default function DriversPage() {
  const [period, setPeriod] = useState('month');
  const filtered = filterByPeriod(invoices, period);
  const drivers = buildDriverStats(filtered);

  const totalRev = drivers.reduce((s, d) => s + d.rev, 0);
  const totalSkipsDel = drivers.reduce((s, d) => s + d.skips, 0);
  const topDriver = drivers[0];

  const bonusPerSkip = 15;
  const skipThreshold = 20;
  const topBonusAmount = 1000;

  const driversWithBonus = drivers.map((d, i) => {
    let bonus = 0;
    if (d.skips > skipThreshold) bonus += (d.skips - skipThreshold) * bonusPerSkip;
    if (i === 0 && d.rev > 0) bonus += topBonusAmount;
    return { ...d, bonus };
  });

  const barColors = ['var(--accent)', 'var(--secondary)', 'var(--green)', 'var(--blue)', 'var(--amber)', 'var(--red)'];
  const totalBonus = driversWithBonus.reduce((s, d) => s + d.bonus, 0);

  return (
    <div>
      <FilterBar current={period} onChange={setPeriod} />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        {[
          { label: 'Active Drivers', value: drivers.length, change: `${filtered.length} jobs`, direction: 'neutral' },
          { label: 'Skips Delivered', value: totalSkipsDel, change: `${drivers.length} drivers`, direction: 'up' },
          { label: 'Top Performer', value: topDriver?.name || '—', change: topDriver ? R(topDriver.rev) : '', direction: 'up' },
          { label: 'Total Bonus Payout', value: R(totalBonus), change: `${driversWithBonus.filter(d => d.bonus > 0).length} qualify`, direction: totalBonus > 0 ? 'up' : 'neutral' },
        ].map((k, i) => (
          <div key={i} className="es-card">
            <KPICard {...k} />
          </div>
        ))}
      </div>

      {/* Leaderboard + Bonus */}
      <div className="grid grid-cols-[1fr_360px] gap-5 mb-5">
        <div className="es-card">
          <h3 className="text-lg font-semibold mb-1">Driver Leaderboard</h3>
          <p className="text-xs text-[var(--ink3)] mb-6">Ranked by revenue this period</p>

          <div className="space-y-4">
            {driversWithBonus.map((d, i) => {
              const maxRev = driversWithBonus[0]?.rev || 1;
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;

              return (
                <div key={d.name} className="flex items-center gap-4">
                  <span className="text-lg w-8 text-center">{medal}</span>
                  <div className="w-[90px] flex-shrink-0">
                    <div className="font-semibold text-sm">{d.name}</div>
                    <div className="text-[11px] text-[var(--ink3)]">{d.vehicles.join(', ')}</div>
                  </div>
                  <div className="flex-1 h-8 bg-[var(--bg2)] rounded-lg overflow-hidden">
                    <div className="h-full rounded-lg flex items-center px-3 transition-all duration-700"
                      style={{ width: `${Math.max((d.rev / maxRev) * 100, 12)}%`, background: barColors[i % barColors.length], opacity: 0.8 }}>
                      <span className="text-[11px] font-mono font-semibold text-black whitespace-nowrap">{R(d.rev)}</span>
                    </div>
                  </div>
                  <div className="text-right w-[75px] flex-shrink-0">
                    <div className="font-mono text-xs">{d.skips} skips</div>
                    <div className="font-mono text-[11px] text-[var(--ink3)]">{d.jobs} jobs</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="es-card">
          <h3 className="text-lg font-semibold mb-1">Bonus Calculator</h3>
          <p className="text-xs text-[var(--ink3)] mb-5">Based on current rules</p>

          <div className="bg-[var(--accent-dim2)] border border-[var(--accent-dim)] rounded-xl p-4 mb-5">
            <p className="text-xs text-[var(--ink3)] font-mono leading-relaxed">
              R{bonusPerSkip}/skip above {skipThreshold} threshold<br />
              R{topBonusAmount.toLocaleString()} top performer bonus
            </p>
          </div>

          <div className="space-y-3">
            {driversWithBonus.map(d => (
              <div key={d.name} className="flex items-center justify-between pb-3 border-b border-[var(--line)] last:border-0">
                <div>
                  <div className="font-medium text-sm">{d.name}</div>
                  <div className="text-[11px] text-[var(--ink3)] font-mono">{d.skips} skips · {d.jobs} jobs</div>
                </div>
                <span className={`text-xl font-semibold ${d.bonus > 0 ? 'text-[var(--green)]' : 'text-[var(--ink3)]'}`}>
                  {d.bonus > 0 ? R(d.bonus) : '—'}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--line)] flex justify-between items-center">
            <span className="text-sm text-[var(--ink3)]">Total Payout</span>
            <span className="text-2xl font-semibold text-[var(--accent)]">{R(totalBonus)}</span>
          </div>
        </div>
      </div>

      {/* Detail table */}
      <div className="es-card">
        <h3 className="text-lg font-semibold mb-1">Driver Detail</h3>
        <p className="text-xs text-[var(--ink3)] mb-5">Full performance metrics</p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--line)]">
                {['#', 'Driver', 'Vehicle', 'Jobs', 'Skips', 'Revenue', 'Avg/Job', 'Rev Share', 'Bonus'].map(h => (
                  <th key={h} className="text-[11px] font-mono text-[var(--ink3)] font-normal px-3 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {driversWithBonus.map((d, i) => (
                <tr key={d.name} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg2)] transition-colors">
                  <td className="px-3 py-3 font-mono text-xs text-[var(--ink3)]">{i + 1}</td>
                  <td className="px-3 py-3 text-sm font-medium">{d.name}</td>
                  <td className="px-3 py-3 text-xs text-[var(--ink3)]">{d.vehicles.join(', ')}</td>
                  <td className="px-3 py-3 font-mono text-sm">{d.jobs}</td>
                  <td className="px-3 py-3 font-mono text-sm">{d.skips}</td>
                  <td className="px-3 py-3 font-mono text-sm text-[var(--accent)]">{R(d.rev)}</td>
                  <td className="px-3 py-3 font-mono text-sm">{R(d.avgRevPerJob)}</td>
                  <td className="px-3 py-3 font-mono text-sm">{pct(totalRev > 0 ? d.rev / totalRev * 100 : 0)}</td>
                  <td className={`px-3 py-3 font-mono text-sm font-medium ${d.bonus > 0 ? 'text-[var(--green)]' : 'text-[var(--ink3)]'}`}>
                    {d.bonus > 0 ? R(d.bonus) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
