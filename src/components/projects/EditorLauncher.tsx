import { useState, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { useInstalledEditors, useLaunchEditor, useClickOutside } from "../../lib/hooks";

interface EditorLauncherProps {
  projectPath: string;
}

export default function EditorLauncher({ projectPath }: EditorLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: editors = [], isLoading } = useInstalledEditors();
  const launchEditor = useLaunchEditor();
  const containerRef = useRef<HTMLDivElement>(null);

  const installedEditors = editors.filter((e) => e.installed);
  const hasEditors = installedEditors.length > 0;

  // Use existing hooks instead of manual event listeners
  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  const handleLaunch = async (editor: string) => {
    setError(null);
    try {
      const result = await launchEditor.mutateAsync({
        projectPath,
        editor,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (isLoading) {
    return (
      <button style={buttonStyles} disabled type="button">
        Loading editors...
      </button>
    );
  }

  if (!hasEditors) {
    return (
      <button
        style={{ ...buttonStyles, ...disabledButtonStyles }}
        disabled
        title="No editors detected. Please install VS Code, Cursor, Vim, or Neovim."
        type="button"
      >
        Open in Editor
      </button>
    );
  }

  if (installedEditors.length === 1) {
    const editor = installedEditors[0]!;
    return (
      <div>
        <button
          style={buttonStyles}
          onClick={() => handleLaunch(editor.name)}
          disabled={launchEditor.isPending}
          type="button"
          className="hover:bg-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          {launchEditor.isPending ? "Launching..." : `Open in ${editor.displayName}`}
        </button>
        {error && <p style={errorMessageStyles}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={containerStyles} ref={containerRef}>
      <button
        style={buttonStyles}
        onClick={() => {
          setIsOpen(!isOpen);
          setError(null);
        }}
        disabled={launchEditor.isPending}
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="hover:bg-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
      >
        Open in Editor
        <ChevronDown
          size={16}
          aria-hidden="true"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}
        />
      </button>

      {error && <p style={errorMessageStyles}>{error}</p>}

      {isOpen && (
        <div style={dropdownStyles} role="menu" aria-label="Select editor">
          {installedEditors.map((editor) => (
            <button
              key={editor.name}
              style={dropdownItemStyles}
              onClick={() => handleLaunch(editor.name)}
              disabled={launchEditor.isPending}
              type="button"
              role="menuitem"
              className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              {editor.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const containerStyles: React.CSSProperties = {
  position: "relative",
};

const buttonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "var(--accent-primary)",
  color: "white",
  border: "none",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const disabledButtonStyles: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  color: "var(--text-tertiary)",
  cursor: "not-allowed",
  opacity: 0.6,
};

const dropdownStyles: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: "var(--spacing-1)",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-sm)",
  zIndex: 10,
  minWidth: "200px",
};

const dropdownItemStyles: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "transparent",
  border: "none",
  textAlign: "left",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const errorMessageStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-destructive)",
  margin: "var(--spacing-1) 0 0",
  padding: "var(--spacing-1) var(--spacing-2)",
  background: "var(--bg-destructive-subtle)",
  borderRadius: "var(--radius-sm)",
};
