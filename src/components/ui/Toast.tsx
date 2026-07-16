/**
 * Toast Component
 *
 * Displays temporary notification messages (success / error / info) in a
 * stacked container. The list of active toasts lives in useUIState; this file
 * only renders them and handles the slide-in / slide-out CSS transitions.
 */

import React, { useEffect, useState } from 'react';
import { useUIState, ToastMessage } from '@/hooks/useUIState';
import './Toast.css';

interface ToastItemProps {
  /** The toast to render (id, type, message). */
  toast: ToastMessage;
  /** Removes the toast from the useUIState list, given its id. */
  onRemove: (id: string) => void;
}

/**
 * A single toast row: icon, message, and a close button. Handles its own
 * slide-in on mount and slide-out before asking the parent to remove it.
 */
const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Mount invisible, then flip visible a tick later so the CSS transition
    // runs. Cleared on unmount so a fast-dismissed toast doesn't set state
    // after the component is gone.
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    // Drop the "visible" class first so the 300 ms slide-out transition in
    // Toast.css plays, then remove the toast from the list once it is done.
    setIsVisible(false);
    setTimeout(() => onRemove(toast.id), 300);
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'info':
        return 'ℹ';
      default:
        return '';
    }
  };

  return (
    <div
      className={`toast-item toast-${toast.type} ${isVisible ? 'toast-visible' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <div className="toast-icon">{getIcon()}</div>
      <div className="toast-message">{toast.message}</div>
      <button className="toast-close" onClick={handleClose} aria-label="Close notification">
        ×
      </button>
    </div>
  );
};

/**
 * Container that renders every active toast from useUIState as a ToastItem.
 * Renders null when there are no toasts.
 */
export const Toast: React.FC = () => {
  const { toasts, removeToast } = useUIState();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};
