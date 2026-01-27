import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface Modal {
  id: string;
  component: React.ComponentType<{ onClose: () => void }>;
  props?: Record<string, unknown>;
}

interface UIState {
  // Toast notifications
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  // Modal management
  modals: Modal[];
  openModal: (modal: Omit<Modal, 'id'>) => void;
  closeModal: (id: string) => void;
  closeAllModals: () => void;

  // Global loading state
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

let toastCounter = 0;
let modalCounter = 0;

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      toasts: [],
      addToast: (toast) => {
        const id = `toast-${++toastCounter}`;
        set((state) => ({
          toasts: [...state.toasts, { ...toast, id }],
        }));

        // Auto-remove after duration
        const duration = toast.duration ?? 5000;
        if (duration > 0) {
          setTimeout(() => {
            set((state) => ({
              toasts: state.toasts.filter((t) => t.id !== id),
            }));
          }, duration);
        }
      },
      removeToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),

      modals: [],
      openModal: (modal) => {
        const id = `modal-${++modalCounter}`;
        set((state) => ({
          modals: [...state.modals, { ...modal, id }],
        }));
      },
      closeModal: (id) =>
        set((state) => ({
          modals: state.modals.filter((m) => m.id !== id),
        })),
      closeAllModals: () => set({ modals: [] }),

      isLoading: false,
      setLoading: (loading) => set({ isLoading: loading }),
    }),
    { name: 'UIStore' }
  )
);
