'use client';

const badgeColors = {
  up: 'bg-[rgba(52,211,153,0.15)] text-[#34D399]',
  down: 'bg-[rgba(248,113,113,0.15)] text-[#F87171]',
  warn: 'bg-[rgba(251,191,36,0.15)] text-[#FBBF24]',
  neutral: 'bg-[var(--bg3)] text-[var(--ink3)]',
};

export default function KPICard({ label, value, change, direction = 'neutral', sub }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-[var(--ink3)]">{label}</span>
      <div className="text-[28px] font-semibold tracking-tight leading-none">{value}</div>
      {change && (
        <span className={`text-[11px] font-mono font-medium px-2.5 py-1 rounded-full w-fit ${badgeColors[direction]}`}>
          {change}
        </span>
      )}
      {sub && <span className="text-xs text-[var(--ink3)] font-mono">{sub}</span>}
    </div>
  );
}
