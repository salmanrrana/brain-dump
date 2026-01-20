/**
 * Toast Context and Hook for Brain Dump
 *
 * Provides toast notification management with a simple API for showing
 * success, error, and info messages from anywhere in the app.
 *
 * @example
 * ```tsx
 * // In your app root
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 *
 * // In any component
 * const toast = useToast();
 *
 * // Shorthand methods
 * toast.success("Ticket created!");
 * toast.error("Failed to save");
 * toast.info("Processing...");
 *
 * // Full control
 * toast.toast({ message: "Custom", variant: "info", duration: 5000 });
 * ```
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { ToastContainer, type ToastData, type ToastVariant } from "../components-v2/ui/Toast";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for creating a toast notification.
 */
export interface ToastOptions {
  /** Toast message content (can be string or ReactNode) */
  message: ReactNode;
  /** Visual variant (default: "info") */
  variant?: ToastVariant;
  /** Auto-dismiss duration in ms, 0 to disable (default: 3000) */
  duration?: number;
}

/**
 * Return type for the useToast hook.
 */
export interface UseToastReturn {
  /** Show a toast with full control over options */
  toast: (options: ToastOptions) => void;
  /** Show a success toast (green) */
  success: (message: ReactNode) => void;
  /** Show an error toast (red) */
  error: (message: ReactNode) => void;
  /** Show an info toast (blue) */
  info: (message: ReactNode) => void;
}

/**
 * Internal context value.
 */
interface ToastContextValue extends UseToastReturn {
  /** Internal: Current toasts array */
  toasts: ToastData[];
  /** Internal: Remove a toast by ID */
  removeToast: (id: string) => void;
}

// =============================================================================

// =============================================================================

/** Default auto-dismiss duration in milliseconds */
export const DEFAULT_DURATION = 3000;

// =============================================================================
// ID GENERATOR
// =============================================================================

let toastCounter = 0;

/**
 * Generate a unique ID for each toast.
 * Uses a simple counter for uniqueness.
 */
function generateToastId(): string {
  toastCounter += 1;
  return `toast-${toastCounter}-${Date.now()}`;
}

// =============================================================================

// =============================================================================

/**
 * React context for toast state and actions.
 * Default value is undefined to detect missing provider.
 */
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// =============================================================================

// =============================================================================

export interface ToastProviderProps {
  /** Child components to wrap */
  children: ReactNode;
}

/**
 * Toast provider component that manages toast state and renders the container.
 *
 * Features:
 * - Manages array of active toasts
 * - Provides toast/success/error/info methods via context
 * - Renders ToastContainer at body level via portal
 * - Handles toast lifecycle (add/remove)
 *
 * @example
 * ```tsx
 * // In your app root
 * function App() {
 *   return (
 *     <ToastProvider>
 *       <Router />
 *     </ToastProvider>
 *   );
 * }
 * ```
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  // Remove a toast by ID
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Add a toast with full options
  const toast = useCallback((options: ToastOptions) => {
    const newToast: ToastData = {
      id: generateToastId(),
      message: options.message,
      variant: options.variant ?? "info",
      duration: options.duration ?? DEFAULT_DURATION,
    };

    setToasts((prev) => [...prev, newToast]);
  }, []);

  // Shorthand for success toasts
  const success = useCallback(
    (message: ReactNode) => {
      toast({ message, variant: "success" });
    },
    [toast]
  );

  // Shorthand for error toasts
  const error = useCallback(
    (message: ReactNode) => {
      toast({ message, variant: "error" });
    },
    [toast]
  );

  // Shorthand for info toasts
  const info = useCallback(
    (message: ReactNode) => {
      toast({ message, variant: "info" });
    },
    [toast]
  );

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<ToastContextValue>(
    () => ({
      toasts,
      removeToast,
      toast,
      success,
      error,
      info,
    }),
    [toasts, removeToast, toast, success, error, info]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

// =============================================================================

// =============================================================================

/**
 * Hook to access toast functionality from any component.
 *
 * Must be used within a ToastProvider.
 *
 * @returns Object with toast/success/error/info methods
 * @throws Error if used outside ToastProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const toast = useToast();
 *
 *   const handleSave = async () => {
 *     try {
 *       await saveData();
 *       toast.success("Saved successfully!");
 *     } catch (err) {
 *       toast.error("Failed to save");
 *     }
 *   };
 *
 *   return <button onClick={handleSave}>Save</button>;
 * }
 * ```
 */
export function useToast(): UseToastReturn {
  const context = useContext(ToastContext);

  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  // Return only the public API
  return {
    toast: context.toast,
    success: context.success,
    error: context.error,
    info: context.info,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { ToastContext };
export default ToastProvider;
