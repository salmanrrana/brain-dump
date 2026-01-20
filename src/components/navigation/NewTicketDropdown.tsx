import {
  type FC,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from "react";
import { Plus, ChevronDown, FileText, Rocket, type LucideIcon } from "lucide-react";
import { useClickOutside } from "../../lib/hooks";

export interface NewTicketDropdownProps {
  onNewTicket?: () => void;
  onStartFromScratch?: () => void;
  disabled?: boolean;
}

interface MenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

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
  } catch (error) {
    // Animation unavailable but component still functional
    console.warn("[NewTicketDropdown] Failed to inject keyframes:", error);
  }
}

/**
 * Primary "New" button with dropdown for ticket creation.
 * Supports full keyboard navigation (Tab, Enter/Space, Arrow keys, Escape).
 */
export const NewTicketDropdown: FC<NewTicketDropdownProps> = ({
  onNewTicket,
  onStartFromScratch,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Inject CSS keyframes once on mount
  useEffect(() => {
    injectKeyframes();
  }, []);

  // useMemo justified: menuItems is a dependency of handleKeyDown callback
  const menuItems: MenuItem[] = useMemo(
    () => [
      { label: "New Ticket", icon: FileText, onSelect: () => onNewTicket?.() },
      { label: "Start from Scratch", icon: Rocket, onSelect: () => onStartFromScratch?.() },
    ],
    [onNewTicket, onStartFromScratch]
  );

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    buttonRef.current?.focus();
  }, []);

  const handleClickOutside = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
  }, []);

  useClickOutside(containerRef, handleClickOutside, isOpen);

  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    setFocusedIndex(-1);
  }, [disabled]);

  const handleSelect = useCallback(
    (item: MenuItem) => {
      item.onSelect();
      closeDropdown();
    },
    [closeDropdown]
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

      const itemCount = menuItems.length;

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
            const item = menuItems[focusedIndex];
            if (item) {
              handleSelect(item);
            }
          }
          break;
        case "Tab":
          // Allow normal tab behavior but close dropdown
          closeDropdown();
          break;
      }
    },
    [isOpen, focusedIndex, menuItems, toggleDropdown, closeDropdown, handleSelect]
  );

  const buttonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing-1)",
    height: "36px",
    padding: "0 var(--spacing-3)",
    background: disabled ? "var(--bg-tertiary)" : "var(--gradient-accent)",
    color: disabled ? "var(--text-muted)" : "var(--text-on-accent, #ffffff)",
    border: "none",
    borderRadius: "var(--radius-lg)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "all var(--transition-normal)",
    // Hover state applied via isHovering state instead of imperative DOM manipulation
    filter: isHovering && !disabled ? "brightness(1.1)" : "none",
    boxShadow: isHovering && !disabled ? "var(--shadow-glow-sm)" : "none",
  };

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

  // Generate unique ID for ARIA activedescendant pattern
  const getOptionId = (index: number) => `new-ticket-option-${index}`;

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
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
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
        <div
          style={dropdownStyles}
          role="listbox"
          aria-label="New ticket options"
          aria-activedescendant={focusedIndex >= 0 ? getOptionId(focusedIndex) : undefined}
        >
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                id={getOptionId(index)}
                type="button"
                style={getMenuItemStyles(index === focusedIndex)}
                onClick={() => handleSelect(item)}
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
