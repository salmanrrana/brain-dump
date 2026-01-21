/**
 * Container Logs Modal
 *
 * Displays live streaming logs from a running Docker container.
 * Features auto-scroll, copy to clipboard, and iteration progress display.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useModalKeyboard, useRalphContainerLogs } from "../lib/hooks";
import { X, Copy, Check, Loader2, Terminal, Pause, Play } from "lucide-react";

interface ContainerLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  containerName: string | null;
}

// Hoisted regex for ANSI escape codes (js-hoist-regexp)
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_REGEX = /\x1B\[[0-9;]*[A-Za-z]/g;

/**
 * Strip ANSI escape codes from a string for cleaner display.
 */
function stripAnsi(str: string): string {
  return str.replace(ANSI_ESCAPE_REGEX, "");
}

export default function ContainerLogsModal({
  isOpen,
  onClose,
  containerName,
}: ContainerLogsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Modal keyboard handling (Escape to close, focus trap)
  useModalKeyboard(modalRef, onClose);

  // Fetch logs with polling
  const { logs, containerRunning, iterationInfo, loading, error } = useRalphContainerLogs(
    containerName,
    {
      enabled: isOpen && Boolean(containerName),
      pollingInterval: 1000,
      tail: 1000,
    }
  );

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Detect manual scroll to pause auto-scroll
  const handleScroll = useCallback(() => {
    if (!logsContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    // If user scrolled up more than 100px from bottom, pause auto-scroll
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    }
  }, [autoScroll]);

  // Copy logs to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(stripAnsi(logs));
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy logs:", err);
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  }, [logs]);

  // Resume auto-scroll
  const handleResumeAutoScroll = useCallback(() => {
    setAutoScroll(true);
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Memoize the cleaned logs to avoid recomputing on every render (rerender-memo)
  const cleanLogs = useMemo(() => stripAnsi(logs), [logs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logs-modal-title"
        className="relative bg-[var(--bg-secondary)] rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border-primary)] shrink-0">
          <div className="flex items-center justify-center w-10 h-10 bg-[var(--accent-primary)]/20 rounded-full">
            <Terminal size={20} className="text-[var(--accent-primary)]" />
          </div>
          <div className="flex-1">
            <h2 id="logs-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
              Container Logs
            </h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-[var(--text-secondary)] font-mono">{containerName}</span>
              {containerRunning ? (
                <span className="flex items-center gap-1 text-[var(--accent-success)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-success)] animate-pulse" />
                  Running
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[var(--text-tertiary)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--text-tertiary)]" />
                  Stopped
                </span>
              )}
              {iterationInfo && (
                <span className="text-[var(--accent-ai)]">
                  Iteration {iterationInfo.current}/{iterationInfo.total}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Auto-scroll toggle */}
            <button
              onClick={autoScroll ? () => setAutoScroll(false) : handleResumeAutoScroll}
              className={`p-2 rounded-lg transition-colors ${
                autoScroll
                  ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/30"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              }`}
              title={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
              aria-label={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
            >
              {autoScroll ? <Pause size={16} /> : <Play size={16} />}
            </button>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              disabled={!logs}
              className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              title={copyError ? "Copy failed!" : copied ? "Copied!" : "Copy logs"}
              aria-label={copyError ? "Copy failed" : copied ? "Copied" : "Copy logs to clipboard"}
            >
              {copyError ? (
                <X size={16} className="text-[var(--accent-danger)]" />
              ) : copied ? (
                <Check size={16} className="text-[var(--accent-success)]" />
              ) : (
                <Copy size={16} />
              )}
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Logs content */}
        <div
          ref={logsContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto bg-[var(--bg-primary)] p-4"
        >
          {loading && !logs ? (
            <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
              <Loader2 size={24} className="animate-spin mr-2" />
              <span>Loading logs...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-[var(--accent-danger)]">
              <span>Error: {error}</span>
            </div>
          ) : !logs ? (
            <div className="flex items-center justify-center h-full text-[var(--text-tertiary)]">
              <span>No logs available</span>
            </div>
          ) : (
            <pre className="text-sm font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-words leading-relaxed">
              {cleanLogs}
              <div ref={logsEndRef} />
            </pre>
          )}
        </div>

        {/* Footer with auto-scroll indicator (rendering-conditional-render: use ternary) */}
        {!autoScroll && logs ? (
          <div className="shrink-0 px-4 py-2 bg-[var(--bg-tertiary)] border-t border-[var(--border-primary)] flex items-center justify-center">
            <button
              onClick={handleResumeAutoScroll}
              className="text-sm text-[var(--accent-primary)] hover:text-[var(--accent-secondary)] flex items-center gap-2"
            >
              <Play size={14} />
              Resume auto-scroll
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
