import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { useDevCommands, useLaunchDevServer } from "../../lib/hooks";
import { createBrowserLogger } from "../../lib/browser-logger";

const logger = createBrowserLogger("DevServerPicker");

interface DevServerPickerProps {
  projectPath: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function DevServerPicker({ projectPath, isOpen, onClose }: DevServerPickerProps) {
  const { data: commands = [], isLoading, error } = useDevCommands(projectPath);
  const launchServer = useLaunchDevServer();
  const modalRef = useRef<HTMLDivElement>(null);
  const [selectedCommand, setSelectedCommand] = useState<string>("");

  // Use the first command as default if nothing is selected and commands are available
  const displayedSelectedCommand = selectedCommand || commands[0]?.command || "";

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (!isOpen) {
      return;
    }

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleLaunch = async () => {
    if (!displayedSelectedCommand) return;

    try {
      await launchServer.mutateAsync({
        projectPath,
        command: displayedSelectedCommand,
      });
      onClose();
    } catch (err) {
      logger.error(
        "Failed to launch dev server",
        err instanceof Error ? err : new Error(String(err))
      );
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div style={backdropStyles} />
      <div style={modalContainerStyles}>
        <div
          style={modalStyles}
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dev-server-picker-title"
        >
          <div style={headerStyles}>
            <h2 style={titleStyles} id="dev-server-picker-title">
              Start Development Server
            </h2>
            <button
              type="button"
              style={closeButtonStyles}
              onClick={onClose}
              aria-label="Close"
              className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <X size={20} />
            </button>
          </div>

          <div style={contentStyles}>
            {isLoading && <p style={loadingTextStyles}>Loading dev commands...</p>}

            {error && (
              <p style={errorTextStyles}>
                Could not detect dev commands. Check that package.json has scripts or Makefile
                exists.
              </p>
            )}

            {!isLoading && !error && commands.length === 0 && (
              <p style={emptyTextStyles}>
                No dev commands found. Add scripts to package.json or create a Makefile.
              </p>
            )}

            {!isLoading && !error && commands.length > 0 && (
              <div style={commandListStyles}>
                <p style={labelStyles}>Select a command:</p>
                {commands.map((cmd) => (
                  <label key={cmd.command} style={optionContainerStyles}>
                    <input
                      type="radio"
                      name="dev-command"
                      value={cmd.command}
                      checked={displayedSelectedCommand === cmd.command}
                      onChange={(e) => setSelectedCommand(e.target.value)}
                      style={radioStyles}
                    />
                    <span style={optionTextStyles}>
                      <span style={optionNameStyles}>{cmd.name}</span>
                      {cmd.description && (
                        <span style={optionDescriptionStyles}>{cmd.description}</span>
                      )}
                      <span style={optionSourceStyles}>[{cmd.source}]</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={footerStyles}>
            <button
              type="button"
              style={cancelButtonStyles}
              onClick={onClose}
              className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              style={launchButtonStyles}
              onClick={handleLaunch}
              disabled={!displayedSelectedCommand || launchServer.isPending}
              className="hover:bg-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              {launchServer.isPending ? "Launching..." : "Launch Server"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const backdropStyles: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0, 0, 0, 0.5)",
  zIndex: 40,
};

const modalContainerStyles: React.CSSProperties = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 50,
};

const modalStyles: React.CSSProperties = {
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-lg)",
  minWidth: "400px",
  maxWidth: "500px",
  maxHeight: "80vh",
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
};

const titleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

const closeButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const contentStyles: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "var(--spacing-4)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const loadingTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  margin: 0,
  textAlign: "center",
};

const errorTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-destructive)",
  margin: 0,
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-destructive-subtle)",
  border: "1px solid var(--border-destructive)",
  borderRadius: "var(--radius-sm)",
};

const emptyTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-tertiary)",
  margin: 0,
  textAlign: "center",
};

const commandListStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const labelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

const optionContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-tertiary)",
  border: "1px solid transparent",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const radioStyles: React.CSSProperties = {
  marginTop: "4px",
  cursor: "pointer",
  flexShrink: 0,
};

const optionTextStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
};

const optionNameStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
};

const optionDescriptionStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
};

const optionSourceStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-quaternary)",
};

const footerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-4)",
  borderTop: "1px solid var(--border-primary)",
  justifyContent: "flex-end",
};

const cancelButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const launchButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
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
