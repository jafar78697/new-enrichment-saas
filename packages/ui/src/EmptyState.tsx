import React from 'react';

interface EmptyStateProps { title: string; body: string; cta?: React.ReactNode; }

export default function EmptyState({ title, body, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="font-heading font-semibold text-[#14202B] text-lg">{title}</p>
      <p className="text-[#52606D] text-sm mt-1 max-w-xs">{body}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}
