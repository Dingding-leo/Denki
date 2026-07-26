import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

interface UIState {
  toasts: Toast[];
  pendingConfirm: PendingConfirm | null;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
  dismissToast: (id: number) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  resolveConfirm: (confirmed: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
}

let nextToastId = 1;

export const useUIStore = create<UIState>((set, get) => ({
  toasts: [],
  pendingConfirm: null,
  paletteOpen: false,
  shortcutsOpen: false,

  showToast: (message, type = 'success', durationMs = 4000) => {
    const id = nextToastId++;
    // Keep at most 3 toasts on screen so they never stack into a wall
    set(state => ({ toasts: [...state.toasts.slice(-2), { id, message, type }] }));
    window.setTimeout(() => get().dismissToast(id), durationMs);
  },

  dismissToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),

  confirm: (options) =>
    new Promise<boolean>(resolve => {
      // A second confirm while one is open cancels the first
      get().pendingConfirm?.resolve(false);
      set({ pendingConfirm: { ...options, resolve } });
    }),

  resolveConfirm: (confirmed) => {
    const pending = get().pendingConfirm;
    if (!pending) return;
    set({ pendingConfirm: null });
    pending.resolve(confirmed);
  },

  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
}));

// Imperative helpers so services and event handlers can use these without hooks
export const toast = (message: string, type: ToastType = 'success', durationMs?: number) =>
  useUIStore.getState().showToast(message, type, durationMs);

export const confirmDialog = (options: ConfirmOptions) => useUIStore.getState().confirm(options);
