/**
 * Shared styles for settings tab components.
 *
 * These style objects define theme-aware CSS classes used across all settings tabs:
 * - GeneralTab, RalphTab, GitTab, EnterpriseTab
 *
 * Uses CSS custom properties from src/styles/variables.css for consistent theming.
 */

// =============================================================================
// SECTION STYLES
// =============================================================================

/** Section header with icon - used for grouping related settings */
export const sectionHeaderStyles = {
  container: "flex items-center gap-3 mb-4",
  iconBox: (colorVar: string) =>
    `w-8 h-8 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,${colorVar}_15%,transparent)]`,
  title: "text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]",
};

// =============================================================================
// FORM FIELD STYLES
// =============================================================================

/** Form field label and hint text */
export const fieldStyles = {
  label: "block text-sm font-semibold text-[var(--text-secondary)] mb-1.5",
  hint: "mt-1.5 text-xs text-[var(--text-tertiary)] leading-relaxed",
};

/** Input and select base styles */
export const inputStyles = {
  base: "w-full px-3 py-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] transition-all focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20",
  select:
    "w-full px-3 py-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] appearance-none transition-all focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20",
  selectArrow:
    "absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none",
};

// =============================================================================
// STATUS CARD STYLES
// =============================================================================

/** Status card for displaying system information */
export const statusCardStyles = {
  container: "mt-4 p-3.5 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-xl",
  row: "flex items-center gap-2.5 text-xs",
  hintBox: "mt-3 p-3 bg-[var(--bg-primary)] rounded-lg",
  hintTitle: "text-xs font-semibold text-[var(--text-secondary)] mb-1.5",
  hintList: "text-xs text-[var(--text-tertiary)] leading-relaxed",
  code: "bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded font-mono text-[10px]",
};

// =============================================================================
// TOGGLE STYLES
// =============================================================================

/** Toggle switch styles */
export const toggleStyles = {
  row: "flex items-start justify-between gap-4 py-3",
  info: "flex-1",
  label: "text-sm font-semibold text-[var(--text-primary)] mb-1",
  desc: "text-xs text-[var(--text-tertiary)] leading-relaxed",
  switch: (isOn: boolean) =>
    `relative inline-flex h-6 w-11 items-center rounded-full transition-all flex-shrink-0 ${
      isOn
        ? "bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-ai)] shadow-[0_0_12px_var(--accent-glow)]"
        : "bg-[var(--bg-tertiary)] border border-[var(--border-primary)]"
    }`,
  knob: (isOn: boolean) =>
    `inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
      isOn ? "translate-x-6" : "translate-x-1"
    }`,
};

// =============================================================================
// BUTTON GROUP STYLES
// =============================================================================

/** Button group styles (for timeout/iteration selectors) */
export const buttonGroupStyles = {
  container: "flex flex-wrap gap-2",
  button: (isActive: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
      isActive
        ? "bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-ai)] text-white shadow-[0_4px_12px_var(--accent-glow)]"
        : "bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
    }`,
};
