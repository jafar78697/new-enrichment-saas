import React, { useEffect } from 'react';

type ToastType = 'success' | 'error' | 'info';

const STYLES: Record<ToastType, string> = {
  success: 'bg-[#15803D] text-white',
  error: 'bg-[#DC2626] text-white',
  info: 'bg-[#0F766E] text-white',
};

interface ToastProps { message: string; type?: ToastType; onClose: () => void; duration?: number; }

export default function Toast({ message, type = 'info', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [onClose, duration]);

  return (
    <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${STYLES[type]}`} role="alert">
      {message}
    </div>
  );
}
