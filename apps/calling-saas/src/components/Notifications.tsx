import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type NotificationTone = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  tone: NotificationTone;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface NotificationContextValue {
  notify: (message: string, tone?: NotificationTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const toastStyles: Record<NotificationTone, { icon: typeof CheckCircle2; accent: string; iconColor: string }> = {
  success: { icon: CheckCircle2, accent: 'border-emerald-400/35', iconColor: 'text-emerald-400' },
  error: { icon: AlertCircle, accent: 'border-rose-400/35', iconColor: 'text-rose-400' },
  info: { icon: Info, accent: 'border-primary/35', iconColor: 'text-primary' },
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmOptions | null>(null);
  const confirmResolver = useRef<((confirmed: boolean) => void) | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message: string, tone: NotificationTone = 'info') => {
    const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message, tone }].slice(-4));
    window.setTimeout(() => dismissToast(id), tone === 'error' ? 6500 : 4500);
  }, [dismissToast]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    if (confirmResolver.current) confirmResolver.current(false);
    confirmResolver.current = resolve;
    setConfirmation(options);
  }), []);

  const resolveConfirmation = useCallback((confirmed: boolean) => {
    confirmResolver.current?.(confirmed);
    confirmResolver.current = null;
    setConfirmation(null);
  }, []);

  useEffect(() => {
    if (!confirmation) return;

    cancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') resolveConfirmation(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmation, resolveConfirmation]);

  return (
    <NotificationContext.Provider value={{ notify, confirm }}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[110] flex w-[min(390px,calc(100vw-2rem))] flex-col gap-3" aria-live="polite">
        {toasts.map((toast) => {
          const style = toastStyles[toast.tone];
          const Icon = style.icon;
          return (
            <div key={toast.id} className={`pointer-events-auto flex items-start gap-3 rounded-lg border ${style.accent} bg-surface/95 px-4 py-3 shadow-2xl backdrop-blur-xl`}>
              <Icon size={20} className={`mt-0.5 shrink-0 ${style.iconColor}`} />
              <p className="flex-1 text-sm leading-5 text-white">{toast.message}</p>
              <button onClick={() => dismissToast(toast.id)} className="-mr-1 -mt-1 rounded p-1 text-textMuted transition hover:bg-white/5 hover:text-white" aria-label="Dismiss notification">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {confirmation && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => resolveConfirmation(false)}>
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${confirmation.destructive ? 'bg-rose-400/10 text-rose-400' : 'bg-amber-400/10 text-amber-300'}`}>
                <AlertTriangle size={21} />
              </div>
              <div>
                <h2 id="confirmation-title" className="text-lg font-semibold text-white">{confirmation.title}</h2>
                <p className="mt-2 text-sm leading-6 text-textMuted">{confirmation.message}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button ref={cancelButtonRef} onClick={() => resolveConfirmation(false)} className="btn-secondary px-4 py-2 text-sm">
                {confirmation.cancelLabel || 'Cancel'}
              </button>
              <button onClick={() => resolveConfirmation(true)} className={`${confirmation.destructive ? 'bg-rose-500 hover:bg-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.25)]' : 'btn-primary'} rounded-lg px-4 py-2 text-sm font-medium text-white transition`}>
                {confirmation.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider.');
  return context;
}
