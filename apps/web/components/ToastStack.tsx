"use client";

import { useCallback, useEffect, useState } from "react";

export type ToastTone = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
  action?: { label: string; href: string };
};

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    return id;
  }, []);

  return { toasts, push, dismiss };
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), 4500);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className={`toast toast-${toast.tone}`} role="status">
      <div className="toast-body">
        <strong>{toast.title}</strong>
        {toast.message ? <p>{toast.message}</p> : null}
        {toast.action ? (
          <a className="toast-action" href={toast.action.href} target="_blank" rel="noreferrer">
            {toast.action.label}
          </a>
        ) : null}
      </div>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
        ×
      </button>
    </div>
  );
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
