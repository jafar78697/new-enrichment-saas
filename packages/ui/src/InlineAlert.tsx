import React from 'react';

type AlertType = 'error' | 'warning' | 'success' | 'info';

const STYLES: Record<AlertType, string> = {
  error: 'bg-red-50 border-[#DC2626] text-[#DC2626]',
  warning: 'bg-amber-50 border-[#F59E0B] text-amber-700',
  success: 'bg-green-50 border-[#15803D] text-[#15803D]',
  info: 'bg-blue-50 border-[#2563EB] text-[#2563EB]',
};

interface InlineAlertProps { type?: AlertType; message: string; }

export default function InlineAlert({ type = 'error', message }: InlineAlertProps) {
  return (
    <div className={`border rounded-lg p-3 text-sm ${STYLES[type]}`}>{message}</div>
  );
}
