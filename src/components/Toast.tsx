import {
  useEffect,
  useState,
  createContext,
  useContext,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (typeof document === "undefined" || !document.body) {
    return null;
  }

  const containerStyles: CSSProperties = {
    position: "fixed",
    left: "max(1rem, env(safe-area-inset-left))",
    right: "max(1rem, env(safe-area-inset-right))",
    bottom: "max(1rem, env(safe-area-inset-bottom))",
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    alignItems: "flex-end",
    pointerEvents: "none",
  };

  return createPortal(
    <div
      style={containerStyles}
      aria-live="polite"
      aria-label="Notifications"
      data-testid="toast-container"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>,
    document.body
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const config = {
    success: {
      icon: CheckCircle,
      bgClass:
        "bg-[color-mix(in_srgb,var(--success)_15%,var(--bg-secondary))] border-[var(--success)]",
      iconClass: "text-[var(--success)]",
    },
    error: {
      icon: AlertCircle,
      bgClass: "bg-[color-mix(in_srgb,var(--error)_15%,var(--bg-secondary))] border-[var(--error)]",
      iconClass: "text-[var(--error)]",
    },
    info: {
      icon: Info,
      bgClass: "bg-[color-mix(in_srgb,var(--info)_15%,var(--bg-secondary))] border-[var(--info)]",
      iconClass: "text-[var(--info)]",
    },
  }[toast.type];

  const Icon = config.icon;

  // Use role="alert" for errors (assertive), role="status" for success/info (polite)
  const role = toast.type === "error" ? "alert" : "status";

  return (
    <div
      role={role}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      className={`pointer-events-auto ml-auto flex max-w-[32rem] items-start gap-3 rounded-xl border px-4 py-3 shadow-xl backdrop-blur-md animate-slide-in ${config.bgClass}`}
      style={{ width: "min(32rem, 100%)" }}
    >
      <Icon size={18} className={`mt-0.5 shrink-0 ${config.iconClass}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words text-sm text-[var(--text-primary)]">
        {toast.message}
      </span>
      <button
        onClick={() => onRemove(toast.id)}
        className="ml-2 shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
