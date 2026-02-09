import { type FC, useState, useRef, useCallback, type KeyboardEvent } from "react";
import { ChevronDown, Wand2, Sparkles, Code2, MousePointer2, Terminal, Github, Check } from "lucide-react";
import { useClickOutside } from "../../lib/hooks";

// =============================================================================
// Types & Constants
// =============================================================================

/** Working method option configuration */
export interface WorkingMethodOption {
  value: WorkingMethod;
  label: string;
  icon: typeof Wand2;
  description: string;
}

/** Valid working method values */
export type WorkingMethod =
  | "auto"
  | "claude-code"
  | "vscode"
  | "opencode"
  | "cursor"
  | "copilot-cli"
  | "codex";

/** All available working method options */
export const WORKING_METHOD_OPTIONS: WorkingMethodOption[] = [
  {
    value: "auto",
    label: "Auto-detect",
    icon: Wand2,
    description: "Detect from environment",
  },
  {
    value: "claude-code",
    label: "Claude Code",
    icon: Sparkles,
    description: "Anthropic CLI",
  },
  {
    value: "vscode",
    label: "VS Code",
    icon: Code2,
    description: "VS Code + MCP",
  },
  {
    value: "opencode",
    label: "OpenCode",
    icon: MousePointer2,
    description: "Alternative client",
  },
  {
    value: "cursor",
    label: "Cursor",
    icon: MousePointer2,
    description: "AI-first editor",
  },
  {
    value: "copilot-cli",
    label: "Copilot CLI",
    icon: Github,
    description: "GitHub terminal agent",
  },
  {
    value: "codex",
    label: "Codex",
    icon: Terminal,
    description: "OpenAI coding agent",
  },
];

// =============================================================================
// Component Types
// =============================================================================

export interface WorkingMethodSelectProps {
  /** Currently selected working method */
  value: WorkingMethod;
  /** Handler called when selection changes */
  onChange: (value: WorkingMethod) => void;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** ID for the button element (for label association) */
  id?: string;
  /** Test ID prefix for testing */
  testId?: string;
}

// =============================================================================
// WorkingMethodSelect Component
// =============================================================================

/**
 * WorkingMethodSelect - Dropdown for selecting project working method preference.
 *
 * Features:
 * - **7 options**: Auto-detect, Claude Code, VS Code, OpenCode, Cursor, Copilot CLI, Codex
 * - **Icon + name per option**: Visual differentiation
 * - **Description text**: Explains each option's purpose
 * - **Keyboard accessible**: Arrow keys, Enter, Escape
 * - **ARIA compliant**: Proper roles and states
 *
 * @example
 * ```tsx
 * <WorkingMethodSelect
 *   value={workingMethod}
 *   onChange={setWorkingMethod}
 * />
 * ```
 */
export const WorkingMethodSelect: FC<WorkingMethodSelectProps> = ({
  value,
  onChange,
  disabled = false,
  id,
  testId = "working-method-select",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  // Get the currently selected option
  const selectedOption = WORKING_METHOD_OPTIONS.find((opt) => opt.value === value);
  const SelectedIcon = selectedOption?.icon ?? Wand2;

  // Toggle dropdown
  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      const currentIndex = WORKING_METHOD_OPTIONS.findIndex((opt) => opt.value === value);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [disabled, isOpen, value]);

  // Handle option selection
  const handleSelect = useCallback(
    (option: WorkingMethodOption) => {
      onChange(option.value);
      setIsOpen(false);
      buttonRef.current?.focus();
    },
    [onChange]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          buttonRef.current?.focus();
          break;
        case "ArrowDown":
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setFocusedIndex(0);
          } else {
            setFocusedIndex((prev) => (prev + 1) % WORKING_METHOD_OPTIONS.length);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setFocusedIndex(WORKING_METHOD_OPTIONS.length - 1);
          } else {
            setFocusedIndex(
              (prev) => (prev - 1 + WORKING_METHOD_OPTIONS.length) % WORKING_METHOD_OPTIONS.length
            );
          }
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (isOpen && focusedIndex >= 0) {
            const option = WORKING_METHOD_OPTIONS[focusedIndex];
            if (option) {
              handleSelect(option);
            }
          } else {
            handleToggle();
          }
          break;
      }
    },
    [disabled, focusedIndex, handleSelect, handleToggle, isOpen]
  );

  return (
    <div ref={containerRef} style={containerStyles} onKeyDown={handleKeyDown} data-testid={testId}>
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        id={id}
        onClick={handleToggle}
        disabled={disabled}
        style={{
          ...buttonStyles,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={id}
        data-testid={`${testId}-trigger`}
        className="hover:border-[var(--border-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)]"
      >
        <div style={buttonContentStyles}>
          <SelectedIcon size={16} style={buttonIconStyles} aria-hidden="true" />
          <span style={buttonLabelStyles}>{selectedOption?.label ?? "Select..."}</span>
        </div>
        <ChevronDown
          size={16}
          style={{
            ...chevronStyles,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <ul
          role="listbox"
          aria-activedescendant={focusedIndex >= 0 ? `option-${focusedIndex}` : undefined}
          style={dropdownStyles}
          data-testid={`${testId}-dropdown`}
        >
          {WORKING_METHOD_OPTIONS.map((option, index) => {
            const Icon = option.icon;
            const isSelected = option.value === value;
            const isFocused = index === focusedIndex;

            return (
              <li
                key={option.value}
                id={`option-${index}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setFocusedIndex(index)}
                style={{
                  ...optionStyles,
                  background: isFocused ? "var(--bg-hover)" : "transparent",
                }}
                data-testid={`${testId}-option-${option.value}`}
                className="hover:bg-[var(--bg-hover)]"
              >
                <Icon size={18} style={optionIconStyles} aria-hidden="true" />
                <div style={optionTextStyles}>
                  <span style={optionLabelStyles}>{option.label}</span>
                  <span style={optionDescStyles}>{option.description}</span>
                </div>
                {isSelected && <Check size={16} style={checkStyles} aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// =============================================================================
// Styles
// =============================================================================

const containerStyles: React.CSSProperties = {
  position: "relative",
  width: "100%",
};

const buttonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-primary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
  textAlign: "left",
  transition: "all var(--transition-fast)",
};

const buttonContentStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const buttonIconStyles: React.CSSProperties = {
  color: "var(--text-secondary)",
  flexShrink: 0,
};

const buttonLabelStyles: React.CSSProperties = {
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
};

const chevronStyles: React.CSSProperties = {
  color: "var(--text-tertiary)",
  transition: "transform 0.15s ease",
};

const dropdownStyles: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  zIndex: 50,
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-lg)",
  overflow: "hidden",
  margin: 0,
  padding: "var(--spacing-1)",
  listStyle: "none",
};

const optionStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-2) var(--spacing-3)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  transition: "background-color 0.1s ease",
};

const optionIconStyles: React.CSSProperties = {
  color: "var(--accent-primary)",
  flexShrink: 0,
};

const optionTextStyles: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const optionLabelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
};

const optionDescStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-muted)",
};

const checkStyles: React.CSSProperties = {
  color: "var(--accent-primary)",
  flexShrink: 0,
};

export default WorkingMethodSelect;
