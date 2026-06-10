/**
 * useUIState — global UI-state store (Zustand).
 *
 * Holds cross-component UI concerns that don't belong in posterStore: the
 * instructions overlay, the AR loading screen, and the transient toast queue
 * (auto-dismissed after `duration` ms). Despite the `use*` name it is a
 * store, not a React hook — call it anywhere.
 */

import { create } from 'zustand';
import { STORAGE_KEYS } from '@/utils/constants';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  /** Auto-dismiss delay in ms; defaults to DEFAULT_TOAST_DURATION_MS. */
  duration?: number;
}

/** How long a toast stays on screen when the caller doesn't say otherwise. */
const DEFAULT_TOAST_DURATION_MS = 3000;

interface UIState {
  // UI visibility states
  showInstructions: boolean;
  showLoading: boolean;

  // Toast notifications
  toasts: ToastMessage[];

  // Actions
  setShowInstructions: (show: boolean) => void;
  setShowLoading: (show: boolean) => void;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
}

/** Generate a unique toast ID. */
const generateToastId = (): string => {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * localStorage that never throws. iOS Safari in private browsing (and some
 * privacy configurations) throws on setItem; tutorial persistence is a
 * nice-to-have, so degrade silently rather than crash the UI action.
 */
const safeStorageSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the tutorial will simply show again next visit.
  }
};

const safeStorageGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * UI state store using Zustand.
 */
export const useUIState = create<UIState>((set, get) => ({
  // Initial state
  showInstructions: false,
  showLoading: false,
  toasts: [],

  // Set instructions visibility; dismissing marks the tutorial as completed.
  setShowInstructions: (show: boolean) => {
    set({ showInstructions: show });
    if (!show) {
      safeStorageSet(STORAGE_KEYS.TUTORIAL_COMPLETED, 'true');
    }
  },

  // Set loading state
  setShowLoading: (show: boolean) => {
    set({ showLoading: show });
  },

  // Add a toast notification and schedule its auto-dismissal.
  addToast: (toast: Omit<ToastMessage, 'id'>) => {
    const id = generateToastId();
    const newToast: ToastMessage = {
      id,
      type: toast.type,
      message: toast.message,
      duration: toast.duration || DEFAULT_TOAST_DURATION_MS,
    };

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));

    // Auto-remove toast after duration
    setTimeout(() => {
      get().removeToast(id);
    }, newToast.duration);
  },

  // Remove a toast by ID
  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
}));

/**
 * Returns whether the user has previously dismissed the instructions overlay.
 */
export const useTutorialCompleted = (): boolean => {
  return safeStorageGet(STORAGE_KEYS.TUTORIAL_COMPLETED) === 'true';
};
