import { useEffect } from 'react';
import { useToastStore, type ToastType } from '../../stores/toast';
import { announceToScreenReader } from '../../lib/accessibility';

const typeStyles: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
};

const typeIcons: Record<ToastType, JSX.Element> = {
  success: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
};

const typeLabels: Record<ToastType, string> = {
  success: 'Success',
  error: 'Error',
  info: 'Information',
  warning: 'Warning',
};

const typePriority: Record<ToastType, 'polite' | 'assertive'> = {
  success: 'polite',
  error: 'assertive',
  info: 'polite',
  warning: 'assertive',
};

export function Toaster() {
  const { toasts, removeToast } = useToastStore();

  // Announce new toasts to screen readers
  useEffect(() => {
    if (toasts.length > 0) {
      const latestToast = toasts[toasts.length - 1];
      announceToScreenReader(
        `${typeLabels[latestToast.type]}: ${latestToast.message}`,
        typePriority[latestToast.type]
      );
    }
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live={typePriority[toast.type]}
          className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg animate-in slide-in-from-right ${typeStyles[toast.type]}`}
        >
          <div aria-label={typeLabels[toast.type]} className="flex-shrink-0 mt-0.5">
            {typeIcons[toast.type]}
          </div>
          <p className="flex-1 text-sm">{toast.message}</p>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            aria-label={`Dismiss ${typeLabels[toast.type].toLowerCase()} notification`}
            className="flex-shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 rounded"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
