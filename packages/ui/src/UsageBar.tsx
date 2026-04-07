import React from 'react';

interface UsageBarProps { used: number; total: number; label: string; }

export default function UsageBar({ used, total, label }: UsageBarProps) {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct > 80 ? '#F59E0B' : '#0F766E';
  return (
    <div>
      <div className="flex justify-between text-xs text-[#52606D] mb-1">
        <span>{label}</span>
        <span className="font-mono">{used.toLocaleString()} / {total.toLocaleString()}</span>
      </div>
      <div className="w-full bg-[#EEF2EA] rounded-full h-2">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
