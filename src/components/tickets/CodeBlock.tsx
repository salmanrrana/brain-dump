import { useState, useCallback, useRef, useEffect, useMemo, memo } from "react";
import { Copy, Check } from "lucide-react";
import { renderHighlightedCodeLine } from "../../lib/syntax-highlight";

// =============================================================================
// Types
// =============================================================================

export interface CodeBlockProps {
  /** The code content to display */
  code: string;
  /** The programming language (from markdown fence, e.g., "typescript") */
  language?: string | undefined;
  /** Test ID prefix for testing */
  testId?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Display names for common languages */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  ruby: "Ruby",
  go: "Go",
  rs: "Rust",
  rust: "Rust",
  java: "Java",
  kt: "Kotlin",
  kotlin: "Kotlin",
  swift: "Swift",
  c: "C",
  cpp: "C++",
  cs: "C#",
  csharp: "C#",
  php: "PHP",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  xml: "XML",
  md: "Markdown",
  markdown: "Markdown",
  sh: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  fish: "Fish",
  powershell: "PowerShell",
  ps1: "PowerShell",
  dockerfile: "Dockerfile",
  docker: "Docker",
  graphql: "GraphQL",
  prisma: "Prisma",
};

// =============================================================================
// CodeBlock Component
// =============================================================================

/**
 * CodeBlock - Styled code block with language indicator and copy button.
 *
 * Features:
 * - **Language indicator**: Shows language badge in top-right corner
 * - **Copy button**: Click to copy code to clipboard with visual feedback
 * - **Theme-aware syntax**: Uses shared code token colors for readability
 * - **Horizontal scroll**: Long lines scroll instead of wrapping
 *
 * @example
 * ```tsx
 * <CodeBlock
 *   code="const x = 1;"
 *   language="typescript"
 * />
 * ```
 */
export const CodeBlock = memo(function CodeBlock({
  code,
  language,
  testId = "code-block",
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Get display name for language
  const languageDisplay = language
    ? LANGUAGE_DISPLAY_NAMES[language.toLowerCase()] || language
    : null;
  const highlightedLines = useMemo(
    () =>
      code
        .split("\n")
        .map((line, lineIndex) =>
          renderHighlightedCodeLine(line, language, `${testId}-${lineIndex}`)
        ),
    [code, language, testId]
  );

  // Handle copy to clipboard with proper error handling
  const handleCopy = useCallback(async () => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    let success = false;

    try {
      await navigator.clipboard.writeText(code);
      success = true;
    } catch {
      // Fallback for older browsers
      try {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        success = document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch (fallbackError) {
        console.warn("Failed to copy to clipboard:", fallbackError);
        success = false;
      }
    }

    if (success) {
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <div
      className="relative my-2 overflow-hidden rounded-md border border-[var(--code-border)] bg-[var(--code-surface)]"
      data-testid={testId}
    >
      {/* Header with language and copy button */}
      <div className="flex min-h-8 items-center justify-between border-b border-[var(--code-border)] bg-[var(--code-header-bg)] px-3 py-2">
        <span className="font-mono text-xs lowercase text-[var(--code-muted)]">
          {languageDisplay || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex cursor-pointer items-center gap-1 rounded-sm border px-2 py-1 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40 ${
            copied
              ? "border-[var(--success)]/40 text-[var(--success)]"
              : "border-[var(--code-border)] text-[var(--code-muted)] hover:border-[var(--accent-primary)]/50 hover:text-[var(--code-text)]"
          }`}
          aria-label={copied ? "Copied!" : "Copy code"}
          data-testid={`${testId}-copy`}
        >
          {copied ? (
            <>
              <Check size={12} aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy size={12} aria-hidden="true" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <pre className="m-0 overflow-x-auto bg-[var(--code-surface)] p-3 font-mono text-sm leading-relaxed text-[var(--code-text)]">
        <code className="block whitespace-pre">
          {highlightedLines.map((nodes, lineIndex) => (
            <span className="block min-h-[1.5em]" key={`${testId}-line-${lineIndex}`}>
              {nodes}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
});

export default CodeBlock;
