import { useEffect, useRef, useCallback, type ReactNode, type CSSProperties } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Handler when modal requests close (Escape key, backdrop click, close button) */
  onClose: () => void;
  /** Modal title displayed in header */
  title: string;
  /** Modal content */
  children: ReactNode;
  /** Optional footer content (e.g., action buttons) */
  footer?: ReactNode;
  /** Optional maximum width on desktop (default: "lg" = 512px) */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** Optional test ID */
  testId?: string;
}

const MAX_WIDTH_MAP: Record<NonNullable<ModalProps["maxWidth"]>, string> = {
  sm: "384px",
  md: "448px",
  lg: "512px",
  xl: "576px",
  "2xl": "672px",
};

/**
 * Modal - Reusable modal component with responsive full-screen mobile support.
 *
 * Features:
 * - **Responsive**: Full-screen on mobile (< 640px), centered dialog on desktop
 * - **Keyboard accessible**: Escape to close, focus trap
 * - **ARIA compliant**: dialog role, aria-modal, aria-labelledby
 * - **Sticky header/footer**: Content scrolls independently on mobile
 * - **iOS keyboard avoidance**: Uses 100dvh for dynamic viewport height
 *
 * Layout on mobile (< 640px):
 * ```
 * ┌────────────────────────────────┐
 * │ Title                      [X] │ <- Sticky header
 * ├────────────────────────────────┤
 * │                                │
 * │         Scrollable             │
 * │          Content               │
 * │                                │
 * ├────────────────────────────────┤
 * │ [Cancel]              [Submit] │ <- Sticky footer (if provided)
 * └────────────────────────────────┘
 * ```
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = "lg",
  testId,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap and restore
  useEffect(() => {
    if (!isOpen) return;

    // Store current focus to restore later
    previousActiveElement.current = document.activeElement;

    // Focus the modal
    const modal = modalRef.current;
    if (modal) {
      modal.focus();
    }

    // Prevent body scroll while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
      // Restore focus on close
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  // Focus trap - keep focus within modal
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;

    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }, []);

  if (!isOpen) return null;

  const maxWidthValue = MAX_WIDTH_MAP[maxWidth];

  return (
    <div style={overlayStyles} data-testid={testId}>
      {/* Backdrop */}
      <div style={backdropStyles} onClick={onClose} aria-hidden="true" />

      {/* Modal Container - centers on desktop, full-screen on mobile */}
      <div style={containerStyles}>
        {/* Modal Dialog */}
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          style={{
            ...dialogStyles,
            maxWidth: maxWidthValue,
          }}
          className="modal-dialog"
        >
          {/* Header - sticky on mobile */}
          <header style={headerStyles} className="modal-header">
            <h2 id="modal-title" style={titleStyles}>
              {title}
            </h2>
            <button
              onClick={onClose}
              style={closeButtonStyles}
              aria-label="Close modal"
              className="modal-close-btn"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>

          {/* Content - scrollable */}
          <div style={contentStyles} className="modal-content">
            {children}
          </div>

          {/* Footer - sticky on mobile */}
          {footer && (
            <footer style={footerStyles} className="modal-footer">
              {footer}
            </footer>
          )}
        </div>
      </div>

      {/* Mobile-specific styles */}
      <style>{`
        @media (max-width: 640px) {
          .modal-dialog {
            position: fixed !important;
            inset: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            height: 100dvh !important;
            max-height: 100dvh !important;
            border-radius: 0 !important;
            transform: none !important;
          }

          .modal-header {
            position: sticky !important;
            top: 0 !important;
            z-index: 10 !important;
            border-radius: 0 !important;
          }

          .modal-content {
            flex: 1 !important;
            overflow-y: auto !important;
            min-height: 0 !important;
          }

          .modal-footer {
            position: sticky !important;
            bottom: 0 !important;
            z-index: 10 !important;
          }
        }
      `}</style>
    </div>
  );
}

const overlayStyles: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const backdropStyles: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.6)",
};

const containerStyles: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  padding: "var(--spacing-4)",
  pointerEvents: "none",
};

const dialogStyles: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxHeight: "90vh",
  backgroundColor: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-xl)",
  overflow: "hidden",
  pointerEvents: "auto",
};

const headerStyles: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
  backgroundColor: "var(--bg-secondary)",
  flexShrink: 0,
};

const titleStyles: CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-lg)",
  fontWeight: 600,
  color: "var(--text-primary)",
};

const closeButtonStyles: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--spacing-2)",
  backgroundColor: "transparent",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  transition: "var(--transition-fast)",
};

const contentStyles: CSSProperties = {
  padding: "var(--spacing-4)",
  overflowY: "auto",
  flexGrow: 1,
};

const footerStyles: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-4)",
  borderTop: "1px solid var(--border-primary)",
  backgroundColor: "var(--bg-secondary)",
  flexShrink: 0,
};

export default Modal;
