import { useState } from "react";
import { Terminal, Zap } from "lucide-react";
import EditorLauncher from "./EditorLauncher";
import DevServerPicker from "./DevServerPicker";
import { createBrowserLogger } from "../../lib/browser-logger";

const logger = createBrowserLogger("DevHubToolbar");

interface DevHubToolbarProps {
  projectPath: string;
}

export default function DevHubToolbar({ projectPath }: DevHubToolbarProps) {
  const [isDevServerOpen, setIsDevServerOpen] = useState(false);
  const [isLaunchingTerminal, setIsLaunchingTerminal] = useState(false);

  const handleLaunchTerminal = async () => {
    try {
      setIsLaunchingTerminal(true);
      // TODO: Implement terminal launch for dev hub
      // For now, just log the action
      logger.info(`Launch terminal in: ${projectPath}`);
    } catch (err) {
      logger.error(
        "Failed to launch terminal",
        err instanceof Error ? err : new Error(String(err))
      );
    } finally {
      setIsLaunchingTerminal(false);
    }
  };

  return (
    <>
      <div style={toolbarStyles}>
        <EditorLauncher projectPath={projectPath} />

        <button
          type="button"
          style={secondaryButtonStyles}
          onClick={handleLaunchTerminal}
          disabled={isLaunchingTerminal}
          className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          <Terminal size={16} />
          {isLaunchingTerminal ? "Opening..." : "New Terminal"}
        </button>

        <button
          type="button"
          style={secondaryButtonStyles}
          onClick={() => setIsDevServerOpen(true)}
          className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
        >
          <Zap size={16} />
          Start Dev Server
        </button>
      </div>

      <DevServerPicker
        projectPath={projectPath}
        isOpen={isDevServerOpen}
        onClose={() => setIsDevServerOpen(false)}
      />
    </>
  );
}

const toolbarStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-3) var(--spacing-4)",
  flexWrap: "wrap",
};

const secondaryButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
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
