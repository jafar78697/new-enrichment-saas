import React from 'react';

interface StatCardProps { label: string; value: string | number; sub?: string; }

export default function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="bg-white border border-[#D8E1D7] rounded-xl p-5">
      <p className="text-xs text-[#7B8794] font-medium uppercase tracking-wide mb-2">{label}</p>
      <p className="font-mono text-3xl font-bold text-[#14202B]">{value}</p>
      {sub && <p className="text-xs text-[#52606D] mt-1">{sub}</p>}
    </div>
  );
}
