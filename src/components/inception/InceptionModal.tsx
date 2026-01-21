import { type FC, useRef, useCallback, useState } from "react";
import { X, Rocket, Sparkles, Loader2 } from "lucide-react";
import { useClickOutside, useSettings } from "../../lib/hooks";
import { launchProjectInception } from "../../api/inception";
import { useToast } from "../Toast";

// =============================================================================
// Component Types
// =============================================================================

export interface InceptionModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Handler called when the modal should close */
  onClose: () => void;
  /** Handler called when user chooses to skip AI and create manually */
  onSkipAI?: () => void;
}

// =============================================================================
// Main InceptionModal Component
// =============================================================================

/**
 * InceptionModal - "Start from Scratch" modal for AI-guided project creation.
 *
 * Features:
 * - **Hero section**: Large rocket icon with engaging copy
 * - **AI explanation**: Describes what Claude will do
 * - **Primary CTA**: "Start with Claude" button that launches terminal
 * - **Secondary link**: "Skip AI" option for manual creation
 * - **Loading state**: Shows spinner while launching terminal
 * - **Keyboard accessible**: Escape to close, Tab navigation
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │ [🚀] Start from Scratch                                 [×] │
 * ├─────────────────────────────────────────────────────────────┤
 * │                                                              │
 * │           🚀                                                 │
 * │     Start Something New                                      │
 * │                                                              │
 * │  Let AI help you brainstorm and plan your next project.     │
 * │  Claude will interview you about your idea and create       │
 * │  a structured spec with epics and tickets.                   │
 * │                                                              │
 * │            [ 🤖 Start with Claude ]                          │
 * │                                                              │
 * │        or skip AI and create manually                       │
 * │                                                              │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 */
export const InceptionModal: FC<InceptionModalProps> = ({ isOpen, onClose, onSkipAI }) => {
  // State
  const [isLaunching, setIsLaunching] = useState(false);

  // Refs
  const modalRef = useRef<HTMLDivElement>(null);

  // Hooks
  const { settings } = useSettings();
  const { showToast } = useToast();

  // Close on click outside
  useClickOutside(modalRef, onClose, isOpen);

  /**
   * Handle keyboard events
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  /**
   * Launch Claude with inception prompt
   */
  const handleStartWithClaude = useCallback(async () => {
    if (isLaunching) return;

    setIsLaunching(true);

    try {
      const result = await launchProjectInception({
        data: {
          preferredTerminal: settings?.terminalEmulator ?? null,
        },
      });

      if (result.success) {
        showToast("success", result.message);
        // Show any warnings (e.g., terminal fallback) as info toasts
        if (result.warnings) {
          result.warnings.forEach((warning) => {
            showToast("info", warning);
          });
        }
        onClose();
      } else {
        showToast("error", result.message);
      }
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Failed to launch Claude");
    } finally {
      setIsLaunching(false);
    }
  }, [isLaunching, settings?.terminalEmulator, showToast, onClose]);

  /**
   * Handle skip AI link click
   */
  const handleSkipAI = useCallback(() => {
    onClose();
    onSkipAI?.();
  }, [onClose, onSkipAI]);

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div style={backdropStyles} data-testid="inception-modal-backdrop">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inception-modal-title"
        style={modalStyles}
        onKeyDown={handleKeyDown}
        data-testid="inception-modal"
      >
        {/* Header */}
        <header style={headerStyles}>
          <div style={headerTitleContainerStyles}>
            <span style={headerIconStyles}>
              <Rocket size={20} aria-hidden="true" />
            </span>
            <h2 id="inception-modal-title" style={headerTitleStyles}>
              Start from Scratch
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={closeButtonStyles}
            aria-label="Close modal"
            data-testid="inception-modal-close"
            className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {/* Content */}
        <div style={contentStyles}>
          {/* Hero Section */}
          <div style={heroStyles}>
            <div style={heroIconContainerStyles}>
              <Rocket size={48} style={heroIconStyles} aria-hidden="true" />
            </div>
            <h3 style={heroTitleStyles}>Start Something New</h3>
            <p style={heroDescriptionStyles}>
              Let AI help you brainstorm and plan your next project. Claude will interview you about
              your idea and create a structured spec with epics and tickets.
            </p>
          </div>

          {/* Primary CTA */}
          <button
            type="button"
            onClick={handleStartWithClaude}
            disabled={isLaunching}
            style={{
              ...primaryButtonStyles,
              opacity: isLaunching ? 0.7 : 1,
              cursor: isLaunching ? "not-allowed" : "pointer",
            }}
            data-testid="inception-start-button"
            className="hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-primary)]"
          >
            {isLaunching ? (
              <>
                <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                <span>Launching Claude...</span>
              </>
            ) : (
              <>
                <Sparkles size={20} aria-hidden="true" />
                <span>Start with Claude</span>
              </>
            )}
          </button>

          {/* Secondary Link */}
          <button
            type="button"
            onClick={handleSkipAI}
            style={skipLinkStyles}
            data-testid="inception-skip-link"
            className="hover:text-[var(--text-primary)] focus:outline-none focus-visible:underline"
          >
            or skip AI and create manually
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Styles
// =============================================================================

const backdropStyles: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0, 0, 0, 0.6)",
  zIndex: 50,
};

const modalStyles: React.CSSProperties = {
  width: "100%",
  maxWidth: "440px",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-xl)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
  background: "var(--bg-secondary)",
};

const headerTitleContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
};

const headerIconStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
  borderRadius: "var(--radius-md)",
  background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
  color: "white",
};

const headerTitleStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
};

const closeButtonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const contentStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "var(--spacing-6)",
  gap: "var(--spacing-4)",
};

const heroStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: "var(--spacing-3)",
};

const heroIconContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "80px",
  height: "80px",
  borderRadius: "var(--radius-full)",
  background: "linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(234, 88, 12, 0.1) 100%)",
  marginBottom: "var(--spacing-2)",
};

const heroIconStyles: React.CSSProperties = {
  color: "#f97316", // Orange
};

const heroTitleStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-xl)",
  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
};

const heroDescriptionStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-base)",
  color: "var(--text-secondary)",
  lineHeight: 1.6,
  maxWidth: "340px",
};

const primaryButtonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--spacing-2)",
  width: "100%",
  maxWidth: "280px",
  padding: "var(--spacing-3) var(--spacing-6)",
  background: "var(--gradient-accent)",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "white",
  fontSize: "var(--font-size-base)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  transition: "all var(--transition-fast)",
  marginTop: "var(--spacing-2)",
};

const skipLinkStyles: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-tertiary)",
  fontSize: "var(--font-size-sm)",
  cursor: "pointer",
  transition: "color var(--transition-fast)",
  padding: "var(--spacing-2)",
};

export default InceptionModal;
