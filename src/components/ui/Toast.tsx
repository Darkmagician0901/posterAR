/**
 * Toast Component
 * Displays temporary notification messages
 */

import React, { useEffect, useState } from 'react';
import { useUIState, ToastMessage } from '@/hooks/useUIState';
import './Toast.css';

interface ToastItemProps {
  toast: ToastMessage;
  onRemove: (id: string) => void;
}

/**
 * Individual toast item
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
      <button
        className="toast-close"
        onClick={handleClose}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
};

/**
 * Toast container component
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
