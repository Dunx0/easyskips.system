'use client';

import { periodLabel } from '@/lib/helpers';

const periods = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
  { value: 'all', label: 'All Time' },
];

export default function FilterBar({ current, onChange }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <span className="text-sm text-[var(--ink3)]">{periodLabel(current)}</span>
      <div className="flex items-center bg-[var(--bg2)] rounded-xl p-1 gap-0.5">
        {periods.map(p => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={`text-xs font-medium px-4 py-1.5 rounded-lg transition-all duration-200
              ${current === p.value
                ? 'bg-[var(--bg1)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--ink3)] hover:text-[var(--ink2)] hover:bg-[var(--bg3)]'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
