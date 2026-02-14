// Shared style constants for dev hub components
// Reduces duplication across TechStackCard, GitHistoryCard, and DevServerPicker

export const cardStyles: React.CSSProperties = {
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  padding: "var(--spacing-4)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
  maxHeight: "280px",
  overflow: "auto",
};

export const cardHeaderStyles: React.CSSProperties = {
  fontSize: "var(--font-size-md)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
  paddingBottom: "var(--spacing-2)",
  borderBottom: "1px solid var(--border-primary)",
};

export const cardContentStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

export const errorStyles: React.CSSProperties = {
  padding: "var(--spacing-2)",
  background: "var(--bg-destructive-subtle)",
  border: "1px solid var(--border-destructive)",
  borderRadius: "var(--radius-sm)",
};

export const errorTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-destructive)",
  margin: 0,
};

export const skeletonLineStyles: React.CSSProperties = {
  height: "20px",
  background:
    "linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%)",
  backgroundSize: "200% 100%",
  borderRadius: "var(--radius-sm)",
  animation: "pulse 1.5s ease-in-out infinite",
};

export const accentButtonStyles: React.CSSProperties = {
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

export const secondaryButtonStyles: React.CSSProperties = {
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

// Tailwind className constants for reusable button hover/focus states
export const HOVER_CLASS =
  "hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]";
export const ACCENT_HOVER_CLASS =
  "hover:bg-[var(--accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]";
