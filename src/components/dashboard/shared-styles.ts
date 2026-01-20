/**
 * Shared styles for dashboard section cards (CurrentFocusCard, UpNextQueue, etc.)
 * These provide consistent visual language across all dashboard sections.
 */

/** Container for a dashboard section card with border and rounded corners */
export const sectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-primary)",
  overflow: "hidden",
};

/** Header row with icon and title, separated by bottom border */
export const sectionHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
};

/** Section title text style */
export const sectionTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-base)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

/** Content area with padding and scrollable overflow */
export const sectionContentStyles: React.CSSProperties = {
  flex: 1,
  padding: "var(--spacing-4)",
  overflowY: "auto",
};

/** Empty state container centered with column layout */
export const emptyStateStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--spacing-8)",
  textAlign: "center",
  color: "var(--text-tertiary)",
};

/** Primary text in empty states */
export const emptyTextStyles: React.CSSProperties = {
  marginTop: "var(--spacing-2)",
  fontSize: "var(--font-size-base)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
};

/** Secondary descriptive text in empty states */
export const emptySubtextStyles: React.CSSProperties = {
  marginTop: "var(--spacing-1)",
  fontSize: "var(--font-size-sm)",
};
