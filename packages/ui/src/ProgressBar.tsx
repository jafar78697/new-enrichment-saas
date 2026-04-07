import React from 'react';

interface ProgressBarProps { value: number; max?: number; color?: string; }

export default function ProgressBar({ value, max = 100, color = '#0F766E' }: ProgressBarProps) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="w-full bg-[#EEF2EA] rounded-full h-2.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}
