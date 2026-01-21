import { type FC, useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

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
 * - **Dark theme**: Dark background optimized for code readability
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
export const CodeBlock: FC<CodeBlockProps> = ({ code, language, testId = "code-block" }) => {
  const [copied, setCopied] = useState(false);

  // Get display name for language
  const languageDisplay = language
    ? LANGUAGE_DISPLAY_NAMES[language.toLowerCase()] || language
    : null;

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  // Styles
  const containerStyles: React.CSSProperties = {
    position: "relative",
    margin: "var(--spacing-2) 0",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--spacing-2) var(--spacing-3)",
    background: "var(--bg-tertiary)",
    borderBottom: "1px solid var(--border-primary)",
    minHeight: "32px",
  };

  const languageBadgeStyles: React.CSSProperties = {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-muted)",
    fontFamily: "monospace",
    textTransform: "lowercase",
  };

  const copyButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-1)",
    padding: "4px 8px",
    background: "transparent",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-sm)",
    color: copied ? "#22c55e" : "var(--text-muted)",
    fontSize: "var(--font-size-xs)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  };

  const preStyles: React.CSSProperties = {
    margin: 0,
    padding: "var(--spacing-3)",
    background: "#1e1e1e", // Dark code background
    overflowX: "auto",
    fontSize: "var(--font-size-sm)",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    lineHeight: 1.6,
    color: "#d4d4d4", // Light text for dark background
  };

  const codeStyles: React.CSSProperties = {
    display: "block",
    whiteSpace: "pre",
  };

  return (
    <div style={containerStyles} data-testid={testId}>
      {/* Header with language and copy button */}
      <div style={headerStyles}>
        <span style={languageBadgeStyles}>{languageDisplay || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          style={copyButtonStyles}
          className="hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
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
      <pre style={preStyles}>
        <code style={codeStyles}>{code}</code>
      </pre>
    </div>
  );
};

export default CodeBlock;
