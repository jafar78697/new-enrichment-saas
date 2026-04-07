import React from 'react';

const STATUS_MAP: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600',
  processing_http: 'bg-blue-100 text-blue-700',
  processing_browser: 'bg-teal-100 text-teal-700',
  completed: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  blocked: 'bg-gray-200 text-red-600',
  browser_timeout: 'bg-orange-100 text-orange-700',
  insufficient_credits: 'bg-amber-100 text-red-600',
  running: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

interface BadgeProps { status: string; label?: string; }

export default function Badge({ status, label }: BadgeProps) {
  const cls = STATUS_MAP[status] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label || status}
    </span>
  );
}
