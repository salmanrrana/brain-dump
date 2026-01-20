import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
  type ElementType,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ModalHeaderProps {
  /** Icon to display in the gradient area (Lucide icon component) */
  icon?: ElementType;
  /** Modal title text */
  title: string;
  /** Callback when the close button is clicked */
  onClose: () => void;
  /** Additional CSS classes */
  className?: string;
}

export interface ModalBodyProps {
  /** Body content */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export interface ModalFooterProps {
  /** Footer content (typically buttons) */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Alignment of footer content (default: 'right') */
  align?: "left" | "center" | "right";
}

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when the modal should close */
  onClose: () => void;
  /** Modal width size */
  size?: ModalSize;
  /** Whether clicking the overlay closes the modal (default: true) */
  closeOnOverlayClick?: boolean;
  /** Modal content */
  children: ReactNode;
  /** Additional CSS classes for the modal container */
  className?: string;
  /** Additional inline styles for the modal container */
  style?: React.CSSProperties;
  /** ID for the modal element */
  id?: string;
  /** Accessible label for the modal */
  "aria-label"?: string;
  /** ID of the element that labels the modal */
  "aria-labelledby"?: string;
  /** ID of the element that describes the modal */
  "aria-describedby"?: string;
}

/**
 * Width values for each modal size.
 */
const SIZE_WIDTHS: Record<ModalSize, string> = {
  sm: "400px",
  md: "500px",
  lg: "600px",
  xl: "800px",
};

/**
 * Styles for the overlay backdrop.
 */
const getOverlayStyles = (isVisible: boolean): React.CSSProperties => ({
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  backdropFilter: "blur(4px)",
  zIndex: "var(--z-modal-backdrop)" as unknown as number,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--spacing-4)",
  opacity: isVisible ? 1 : 0,
  transition: "opacity var(--transition-normal)",
  pointerEvents: isVisible ? "auto" : "none",
});

/**
 * Styles for the modal container.
 */
const getModalStyles = (size: ModalSize, isVisible: boolean): React.CSSProperties => ({
  position: "relative",
  width: "100%",
  maxWidth: SIZE_WIDTHS[size],
  maxHeight: "calc(100vh - var(--spacing-8))",
  backgroundColor: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-xl)",
  boxShadow: "var(--shadow-xl)",
  zIndex: "var(--z-modal)" as unknown as number,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  opacity: isVisible ? 1 : 0,
  transform: isVisible ? "scale(1)" : "scale(0.95)",
  transition: "opacity var(--transition-normal), transform var(--transition-normal)",
});

/**
 * Styles for the scrollable content area.
 */
const getContentStyles = (): React.CSSProperties => ({
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
});

/**
 * Get all focusable elements within a container.
 */
const FOCUSABLE_SELECTORS = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
}

/**
 * Modal component with theme-aware styling.
 *
 * Features:
 * - Overlay with backdrop blur
 * - Focus trap (tab stays within modal)
 * - Escape key closes modal
 * - Click outside closes modal (optional)
 * - Enter/exit animations (fade + scale)
 * - Portal renders to body
 * - Scrollable content area
 * - Multiple sizes (sm, md, lg, xl)
 */

/**
 * Styles for the header container.
 * Sticky positioning keeps it at the top during scroll.
 */
const getHeaderStyles = (): React.CSSProperties => ({
  position: "sticky",
  top: 0,
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
  backgroundColor: "var(--bg-card)",
  zIndex: 1,
});

/**
 * Styles for the gradient icon area.
 */
const getIconAreaStyles = (): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "40px",
  height: "40px",
  borderRadius: "var(--radius-lg)",
  background: "var(--gradient-accent)",
  flexShrink: 0,
});

/**
 * Styles for the icon inside the gradient area.
 */
const getIconStyles = (): React.CSSProperties => ({
  width: "20px",
  height: "20px",
  color: "white",
});

/**
 * Styles for the title text.
 */
const getTitleStyles = (): React.CSSProperties => ({
  flex: 1,
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as unknown as number,
  color: "var(--text-primary)",
  margin: 0,
});

/**
 * Styles for the close button.
 */
const getCloseButtonStyles = (): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  borderRadius: "var(--radius-md)",
  border: "none",
  backgroundColor: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
  flexShrink: 0,
  transition: "background-color var(--transition-fast), color var(--transition-fast)",
});

/**
 * Modal header component with gradient icon area.
 *
 * Features:
 * - Gradient icon area on left using accent colors
 * - Title text
 * - Close button (X) on right
 * - Sticky at top during scroll
 * - Border bottom separator
 *
 * @example
 * ```tsx
 * <Modal.Header
 *   icon={Plus}
 *   title="Create New Ticket"
 *   onClose={onClose}
 * />
 * ```
 */
function ModalHeader({ icon: Icon, title, onClose, className = "" }: ModalHeaderProps) {
  return (
    <header style={getHeaderStyles()} className={className} data-testid="modal-header">
      {/* Gradient icon area */}
      {Icon && (
        <div style={getIconAreaStyles()}>
          <Icon style={getIconStyles()} aria-hidden="true" />
        </div>
      )}

      {/* Title */}
      <h2 style={getTitleStyles()}>{title}</h2>

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        style={getCloseButtonStyles()}
        aria-label="Close modal"
        data-testid="modal-close-button"
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
        onFocus={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
      >
        <X size={20} aria-hidden="true" />
      </button>
    </header>
  );
}

/**
 * Styles for the body container.
 */
const getBodyStyles = (): React.CSSProperties => ({
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  padding: "var(--spacing-4)",
});

/**
 * Modal body component for scrollable content area.
 *
 * Features:
 * - Scrolls when content overflows
 * - Consistent padding from design system
 * - Flexible height (grows to fill available space)
 *
 * @example
 * ```tsx
 * <Modal.Body>
 *   <form>
 *     <input type="text" />
 *     <textarea />
 *   </form>
 * </Modal.Body>
 * ```
 */
function ModalBody({ children, className = "" }: ModalBodyProps) {
  return (
    <div style={getBodyStyles()} className={className} data-testid="modal-body">
      {children}
    </div>
  );
}

/**
 * Styles for the footer container.
 */
const getFooterStyles = (align: "left" | "center" | "right"): React.CSSProperties => {
  const justifyMap = {
    left: "flex-start",
    center: "center",
    right: "flex-end",
  };

  return {
    position: "sticky",
    bottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: justifyMap[align],
    gap: "var(--spacing-3)",
    padding: "var(--spacing-4)",
    borderTop: "1px solid var(--border-primary)",
    backgroundColor: "var(--bg-card)",
  };
};

/**
 * Modal footer component for action buttons.
 *
 * Features:
 * - Sticky at bottom during scroll
 * - Border top separator
 * - Aligns content (default: right)
 * - Gap between children for button spacing
 *
 * @example
 * ```tsx
 * <Modal.Footer>
 *   <Button variant="secondary" onClick={onCancel}>Cancel</Button>
 *   <Button variant="primary" onClick={onSave}>Save</Button>
 * </Modal.Footer>
 *
 * // Left-aligned footer
 * <Modal.Footer align="left">
 *   <Button>Delete</Button>
 * </Modal.Footer>
 * ```
 */
function ModalFooter({ children, className = "", align = "right" }: ModalFooterProps) {
  return (
    <footer style={getFooterStyles(align)} className={className} data-testid="modal-footer">
      {children}
    </footer>
  );
}

export function Modal({
  isOpen,
  onClose,
  size = "md",
  closeOnOverlayClick = true,
  children,
  className = "",
  style,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle escape key
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }

      // Focus trap: Tab and Shift+Tab
      if (event.key === "Tab" && modalRef.current) {
        const focusableElements = getFocusableElements(modalRef.current);
        if (focusableElements.length === 0) {
          event.preventDefault();
          return;
        }

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (event.shiftKey) {
          // Shift+Tab: If on first element, go to last
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: If on last element, go to first
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    },
    [onClose]
  );

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      // Only close if clicking the overlay itself, not the modal content
      if (closeOnOverlayClick && event.target === event.currentTarget) {
        onClose();
      }
    },
    [closeOnOverlayClick, onClose]
  );

  // Focus management: save previous focus and focus modal on open
  useEffect(() => {
    if (isOpen) {
      // Save currently focused element
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Focus the modal or first focusable element
      requestAnimationFrame(() => {
        if (modalRef.current) {
          const focusableElements = getFocusableElements(modalRef.current);
          const firstElement = focusableElements[0];
          if (firstElement) {
            firstElement.focus();
          } else {
            // If no focusable elements, focus the modal itself
            modalRef.current.focus();
          }
        }
      });
    } else {
      // Restore focus when closing
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
        previousActiveElement.current = null;
      }
    }
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Don't render anything if not open
  if (!isOpen) {
    return null;
  }

  // SSR safety: don't render portal on server
  if (typeof document === "undefined" || !document.body) {
    return null;
  }

  // Use portal to render at body level
  return createPortal(
    <div
      style={getOverlayStyles(isOpen)}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      data-testid="modal-overlay"
    >
      <div
        ref={modalRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        tabIndex={-1}
        style={{ ...getModalStyles(size, isOpen), ...style }}
        className={className}
        data-testid="modal-container"
        data-size={size}
        data-open={isOpen ? "true" : undefined}
      >
        <div style={getContentStyles()}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

// Attach subcomponents for compound component pattern
Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;

export default Modal;
