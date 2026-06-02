/**
 * useUIState — global UI-state store (Zustand).
 *
 * Holds cross-component UI concerns that don't belong in posterStore: overlay
 * visibility (instructions, controls, loading, poster controls), the active
 * modal, and the transient toast queue (auto-dismissed after `duration` ms).
 * Despite the `use*` name it is a store, not a React hook — call it anywhere.
 */

import { create } from 'zustand';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number;
}

interface UIState {
  // UI visibility states
  showInstructions: boolean;
  showControls: boolean;
  showLoading: boolean;
  showPosterControls: boolean;
  
  // Toast notifications
  toasts: ToastMessage[];
  
  // Modal state
  activeModal: string | null;
  
  // Actions
  setShowInstructions: (show: boolean) => void;
  setShowControls: (show: boolean) => void;
  setShowLoading: (show: boolean) => void;
  setShowPosterControls: (show: boolean) => void;
  setActiveModal: (modal: string | null) => void;
  
  // Toast actions
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

/**
 * Generate unique toast ID
 */
const generateToastId = (): string => {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * UI state store using Zustand
 */
export const useUIState = create<UIState>((set, get) => ({
  // Initial state
  showInstructions: false,
  showControls: true,
  showLoading: false,
  showPosterControls: false,
  toasts: [],
  activeModal: null,

  // Set instructions visibility
  setShowInstructions: (show: boolean) => {
    set({ showInstructions: show });
    
    // Save to localStorage if dismissing
    if (!show) {
      localStorage.setItem('xr-poster-tutorial-completed', 'true');
    }
  },

  // Set controls visibility
  setShowControls: (show: boolean) => {
    set({ showControls: show });
  },

  // Set loading state
  setShowLoading: (show: boolean) => {
    set({ showLoading: show });
  },

  // Set poster controls visibility
  setShowPosterControls: (show: boolean) => {
    set({ showPosterControls: show });
  },

  // Set active modal
  setActiveModal: (modal: string | null) => {
    set({ activeModal: modal });
  },

  // Add a toast notification
  addToast: (toast: Omit<ToastMessage, 'id'>) => {
    const id = generateToastId();
    const newToast: ToastMessage = {
      id,
      type: toast.type,
      message: toast.message,
      duration: toast.duration || 3000,
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

  // Clear all toasts
  clearToasts: () => {
    set({ toasts: [] });
  },
}));

/**
 * Hook to check if tutorial has been completed
 */
export const useTutorialCompleted = (): boolean => {
  return localStorage.getItem('xr-poster-tutorial-completed') === 'true';
};
