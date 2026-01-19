/**
 * Toast Component
 *
 * A notification component for displaying success, error, and info messages.
 * Supports auto-dismiss, manual dismiss, and stacking multiple toasts.
 *
 * Uses CSS custom properties from the design system for automatic theme adaptation.
 *
 * @example
 * ```tsx
 * import { Toast } from '@/components-v2/ui/Toast';
 *
 * // Basic variants
 * <Toast variant="success" message="Ticket created!" onDismiss={handleDismiss} />
 * <Toast variant="error" message="Failed to save" onDismiss={handleDismiss} />
 * <Toast variant="info" message="Processing..." onDismiss={handleDismiss} />
 *
 * // With auto-dismiss
 * <Toast variant="success" message="Saved!" duration={3000} onDismiss={handleDismiss} />
 *
 * // Without auto-dismiss
 * <Toast variant="info" message="Click to dismiss" duration={0} onDismiss={handleDismiss} />
 * ```
 */

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Check, AlertCircle, Info } from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

export type ToastVariant = "success" | "error" | "info";

export interface ToastProps {
  /** Toast message content */
  message: ReactNode;
  /** Visual variant determining color and icon */
  variant?: ToastVariant;
  /** Auto-dismiss duration in ms (0 to disable) */
  duration?: number;
  /** Callback when toast is dismissed */
  onDismiss: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Unique identifier for the toast */
  id?: string;
}

export interface ToastData {
  /** Unique identifier */
  id: string;
  /** Toast message content */
  message: ReactNode;
  /** Visual variant */
  variant: ToastVariant;
  /** Auto-dismiss duration in ms */
  duration: number;
}

// =============================================================================
// VARIANT CONFIGURATION
// =============================================================================

/**
 * Style and icon configuration for each toast variant.
 */
const VARIANT_CONFIG: Record<
  ToastVariant,
  {
    icon: typeof Check;
    iconColor: string;
    backgroundColor: string;
    borderColor: string;
  }
> = {
  success: {
    icon: Check,
    iconColor: "var(--success)",
    backgroundColor: "var(--success-muted)",
    borderColor: "var(--success)",
  },
  error: {
    icon: AlertCircle,
    iconColor: "var(--error)",
    backgroundColor: "var(--error-muted)",
    borderColor: "var(--error)",
  },
  info: {
    icon: Info,
    iconColor: "var(--info)",
    backgroundColor: "var(--info-muted)",
    borderColor: "var(--info)",
  },
};

// =============================================================================
// STYLE CONFIGURATION
// =============================================================================

/**
 * Base styles for the toast container.
 */
const getToastStyles = (variant: ToastVariant, isVisible: boolean): React.CSSProperties => {
  const config = VARIANT_CONFIG[variant];
  return {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-3)",
    padding: "var(--spacing-3) var(--spacing-4)",
    backgroundColor: "var(--bg-card)",
    border: `1px solid ${config.borderColor}`,
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-lg)",
    minWidth: "280px",
    maxWidth: "400px",
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "translateX(0)" : "translateX(100%)",
    transition: "opacity var(--transition-normal), transform var(--transition-normal)",
    pointerEvents: isVisible ? "auto" : "none",
  };
};

/**
 * Styles for the icon container.
 */
const getIconContainerStyles = (variant: ToastVariant): React.CSSProperties => {
  const config = VARIANT_CONFIG[variant];
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    borderRadius: "var(--radius-full)",
    backgroundColor: config.backgroundColor,
    flexShrink: 0,
  };
};

/**
 * Styles for the icon itself.
 */
const getIconStyles = (variant: ToastVariant): React.CSSProperties => {
  const config = VARIANT_CONFIG[variant];
  return {
    width: "14px",
    height: "14px",
    color: config.iconColor,
  };
};

/**
 * Styles for the message text.
 */
const getMessageStyles = (): React.CSSProperties => ({
  flex: 1,
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
  lineHeight: "var(--line-height-normal)",
});

/**
 * Styles for the dismiss button.
 */
const getDismissButtonStyles = (): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "24px",
  height: "24px",
  padding: 0,
  border: "none",
  borderRadius: "var(--radius-md)",
  backgroundColor: "transparent",
  color: "var(--text-tertiary)",
  cursor: "pointer",
  flexShrink: 0,
  transition: "background-color var(--transition-fast), color var(--transition-fast)",
});

// =============================================================================
// TOAST COMPONENT
// =============================================================================

/**
 * Individual toast notification component.
 *
 * Features:
 * - 3 variants: success (green), error (red), info (blue)
 * - Icon per variant (check, alert, info)
 * - Auto-dismiss after configurable duration
 * - Manual dismiss button
 * - Slide-in animation from right
 * - Uses CSS variables for theming
 */
export function Toast({
  message,
  variant = "info",
  duration = 3000,
  onDismiss,
  className = "",
  id,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  // Handle dismiss with exit animation
  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setIsVisible(false);
    // Wait for animation to complete before calling onDismiss
    setTimeout(() => {
      onDismiss();
    }, 150); // Match transition duration
  }, [onDismiss]);

  // Enter animation on mount
  useEffect(() => {
    // Small delay to trigger CSS transition
    const enterTimer = requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => {
      cancelAnimationFrame(enterTimer);
    };
  }, []);

  // Auto-dismiss timer
  useEffect(() => {
    if (duration === 0 || isExiting) return undefined;

    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [duration, handleDismiss, isExiting]);

  return (
    <div
      role="alert"
      aria-live="polite"
      style={getToastStyles(variant, isVisible)}
      className={className}
      data-testid="toast"
      data-variant={variant}
      id={id}
    >
      {/* Icon */}
      <div style={getIconContainerStyles(variant)} data-testid="toast-icon">
        <Icon style={getIconStyles(variant)} aria-hidden="true" />
      </div>

      {/* Message */}
      <div style={getMessageStyles()} data-testid="toast-message">
        {message}
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        style={getDismissButtonStyles()}
        aria-label="Dismiss notification"
        data-testid="toast-dismiss"
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-tertiary)";
        }}
        onFocus={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-tertiary)";
        }}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

// =============================================================================
// TOAST CONTAINER COMPONENT
// =============================================================================

/**
 * Styles for the toast container that holds stacked toasts.
 */
const getContainerStyles = (): React.CSSProperties => ({
  position: "fixed",
  top: "var(--spacing-4)",
  right: "var(--spacing-4)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
  zIndex: "var(--z-toast)" as unknown as number,
  pointerEvents: "none",
});

/**
 * Styles for individual toast wrappers in the container.
 */
const getToastWrapperStyles = (): React.CSSProperties => ({
  pointerEvents: "auto",
});

export interface ToastContainerProps {
  /** Array of toast data to display */
  toasts: ToastData[];
  /** Callback to remove a toast by id */
  onRemove: (id: string) => void;
}

/**
 * Container component for rendering multiple stacked toasts.
 *
 * Features:
 * - Renders to body via portal
 * - Fixed position in top-right corner
 * - Stacks multiple toasts with gap
 * - Manages individual toast lifecycles
 */
export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  // Don't render if no toasts
  if (toasts.length === 0) {
    return null;
  }

  // Render to body via portal
  return createPortal(
    <div style={getContainerStyles()} data-testid="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} style={getToastWrapperStyles()}>
          <Toast
            id={toast.id}
            message={toast.message}
            variant={toast.variant}
            duration={toast.duration}
            onDismiss={() => onRemove(toast.id)}
          />
        </div>
      ))}
    </div>,
    document.body
  );
}

export default Toast;
