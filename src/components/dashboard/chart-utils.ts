/**
 * Shared utilities for dashboard chart components.
 * Provides theme-reactive colors, formatters, and common styles
 * used across CostTrendChart, CostPerTicketChart, CostByEpicChart,
 * and the existing telemetry charts in AITelemetryTab.
 */

import { useEffect, useState } from "react";

// =============================================================================
// Theme Colors
// =============================================================================

/** All CSS custom property color tokens used by dashboard charts. */
export interface ChartColors {
  primary: string;
  ai: string;
  secondary: string;
  success: string;
  error: string;
  warning: string;
  muted: string;
  border: string;
  bg: string;
  text: string;
  textSecondary: string;
}

/** SSR-safe fallback values for chart colors. */
const FALLBACK_COLORS: ChartColors = {
  primary: "#f97316",
  ai: "#14b8a6",
  secondary: "#ea580c",
  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",
  muted: "#71717a",
  border: "#374151",
  bg: "#1e293b",
  text: "#e2e8f0",
  textSecondary: "#94a3b8",
};

function getComputedColors(): ChartColors {
  if (typeof window === "undefined") {
    return FALLBACK_COLORS;
  }
  const style = getComputedStyle(document.documentElement);
  return {
    primary: style.getPropertyValue("--accent-primary").trim() || FALLBACK_COLORS.primary,
    ai: style.getPropertyValue("--accent-ai").trim() || FALLBACK_COLORS.ai,
    secondary: style.getPropertyValue("--accent-secondary").trim() || FALLBACK_COLORS.secondary,
    success: style.getPropertyValue("--success").trim() || FALLBACK_COLORS.success,
    error: style.getPropertyValue("--error").trim() || FALLBACK_COLORS.error,
    warning: style.getPropertyValue("--warning").trim() || FALLBACK_COLORS.warning,
    muted: style.getPropertyValue("--text-tertiary").trim() || FALLBACK_COLORS.muted,
    border: style.getPropertyValue("--border-primary").trim() || FALLBACK_COLORS.border,
    bg: style.getPropertyValue("--bg-secondary").trim() || FALLBACK_COLORS.bg,
    text: style.getPropertyValue("--text-primary").trim() || FALLBACK_COLORS.text,
    textSecondary:
      style.getPropertyValue("--text-secondary").trim() || FALLBACK_COLORS.textSecondary,
  };
}

/**
 * Hook that provides theme-reactive chart colors.
 * Re-reads CSS custom properties when the data-theme attribute changes.
 */
export function useThemeColors(): ChartColors {
  const [colors, setColors] = useState(getComputedColors);

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(getComputedColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return colors;
}

// =============================================================================
// Formatters
// =============================================================================

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// =============================================================================
// Shared Styles
// =============================================================================

export const tooltipStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-secondary)",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "var(--spacing-2)",
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
  boxShadow: "var(--shadow-lg)",
};

export const emptyChartStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 120,
  color: "var(--text-tertiary)",
  fontSize: "var(--font-size-sm)",
};

export const subtitleStyle: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
};
