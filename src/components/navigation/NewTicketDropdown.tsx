import { type FC, useState, useRef, useCallback, useMemo, type KeyboardEvent } from "react";
import { Plus, ChevronDown, FileText, Rocket, type LucideIcon } from "lucide-react";
import { useClickOutside } from "../../lib/hooks";

export interface NewTicketDropdownProps {
  /** Handler when "New Ticket" is selected */
  onNewTicket?: () => void;
  /** Handler when "Start from Scratch" is selected */
  onStartFromScratch?: () => void;
  /** Disable the dropdown button */
  disabled?: boolean;
}

interface MenuItem {
  label: string;
  icon: LucideIcon;
  action: "newTicket" | "startFromScratch";
}

const MENU_ITEMS: MenuItem[] = [
  { label: "New Ticket", icon: FileText, action: "newTicket" },
  { label: "Start from Scratch", icon: Rocket, action: "startFromScratch" },
];

const DROPDOWN_KEYFRAMES = `
@keyframes newtickdropdown-fade {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

let keyframesInjected = false;
function injectKeyframes(): void {
  if (typeof document === "undefined" || keyframesInjected) return;
  try {
    const style = document.createElement("style");
    style.textContent = DROPDOWN_KEYFRAMES;
    document.head.appendChild(style);
    keyframesInjected = true;
  } catch {
    // Animation unavailable but component functional
  }
}

/**
 * NewTicketDropdown - Primary "New" button with dropdown menu for ticket creation.
 *
 * Features:
 * - **Primary button**: Gradient background with "+ New" text
 * - **Dropdown menu**: Two options - "New Ticket" and "Start from Scratch"
 * - **Keyboard accessible**: Tab to focus, Enter/Space to toggle, Arrow keys to navigate
 * - **Click outside closes**: Uses useClickOutside hook
 * - **Escape closes**: Keyboard dismiss support
 *
 * Design:
 * ```
 * [+ New v]
 *   +--------------------+
 *   | New Ticket         |
 *   | Start from Scratch |
 *   +--------------------+
 * ```
 */
export const NewTicketDropdown: FC<NewTicketDropdownProps> = ({
  onNewTicket,
  onStartFromScratch,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  injectKeyframes();

  // Close dropdown when clicking outside
  useClickOutside(
    containerRef,
    useCallback(() => {
      setIsOpen(false);
      setFocusedIndex(-1);
    }, []),
    isOpen
  );

  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    setFocusedIndex(-1);
  }, [disabled]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    buttonRef.current?.focus();
  }, []);

  const handleAction = useCallback(
    (action: MenuItem["action"]) => {
      if (action === "newTicket") {
        onNewTicket?.();
      } else {
        onStartFromScratch?.();
      }
      closeDropdown();
    },
    [onNewTicket, onStartFromScratch, closeDropdown]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!isOpen) {
        // When closed, Enter/Space opens the dropdown
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleDropdown();
        }
        return;
      }

      const itemCount = MENU_ITEMS.length;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeDropdown();
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => (prev < itemCount - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : itemCount - 1));
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < itemCount) {
            const item = MENU_ITEMS[focusedIndex];
            if (item) {
              handleAction(item.action);
            }
          }
          break;
        case "Tab":
          // Allow normal tab behavior but close dropdown
          closeDropdown();
          break;
      }
    },
    [isOpen, focusedIndex, toggleDropdown, closeDropdown, handleAction]
  );

  // Styles
  const buttonStyles: React.CSSProperties = useMemo(
    () => ({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--spacing-1)",
      height: "36px",
      padding: "0 var(--spacing-3)",
      background: disabled ? "var(--bg-tertiary)" : "var(--gradient-accent)",
      color: disabled ? "var(--text-muted)" : "#ffffff",
      border: "none",
      borderRadius: "var(--radius-lg)",
      fontSize: "var(--font-size-sm)",
      fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "all var(--transition-normal)",
    }),
    [disabled]
  );

  const dropdownStyles: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: 0,
    minWidth: "180px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-lg)",
    zIndex: "var(--z-dropdown)",
    animation: "newtickdropdown-fade 150ms ease-out",
    overflow: "hidden",
  };

  const getMenuItemStyles = (isFocused: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    width: "100%",
    padding: "var(--spacing-2) var(--spacing-3)",
    background: isFocused ? "var(--bg-hover)" : "transparent",
    color: "var(--text-primary)",
    border: "none",
    fontSize: "var(--font-size-sm)",
    cursor: "pointer",
    transition: "background var(--transition-fast)",
    textAlign: "left",
  });

  const iconStyles: React.CSSProperties = {
    color: "var(--text-secondary)",
    flexShrink: 0,
  };

  const handleButtonHover = (e: React.MouseEvent<HTMLButtonElement>, isHovering: boolean) => {
    if (disabled) return;
    const target = e.currentTarget;
    if (isHovering) {
      target.style.filter = "brightness(1.1)";
      target.style.boxShadow = "var(--shadow-glow-sm)";
    } else {
      target.style.filter = "none";
      target.style.boxShadow = "none";
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", display: "inline-block" }}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={buttonRef}
        type="button"
        style={buttonStyles}
        onClick={toggleDropdown}
        onMouseEnter={(e) => handleButtonHover(e, true)}
        onMouseLeave={(e) => handleButtonHover(e, false)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Create new ticket or start from scratch"
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-[var(--bg-secondary)]"
      >
        <Plus size={16} aria-hidden="true" />
        <span>New</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform var(--transition-fast)",
          }}
        />
      </button>

      {isOpen && (
        <div style={dropdownStyles} role="listbox" aria-label="New ticket options">
          {MENU_ITEMS.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                style={getMenuItemStyles(index === focusedIndex)}
                onClick={() => handleAction(item.action)}
                onMouseEnter={() => setFocusedIndex(index)}
                onMouseLeave={() => setFocusedIndex(-1)}
                role="option"
                aria-selected={index === focusedIndex}
              >
                <Icon size={16} style={iconStyles} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NewTicketDropdown;
