/**
 * Shared utilities for Cost Explorer components.
 * Stage colors, gradient generators, ECharts theme helpers, and token formatters.
 */

import type { RalphSessionState } from "../../../core/types.ts";

// ============================================
// Stage Colors
// ============================================

export const STAGE_COLORS: Record<string, string> = {
  analyzing: "#3b82f6",
  implementing: "#f97316",
  testing: "#22c55e",
  committing: "#a855f7",
  reviewing: "#14b8a6",
  idle: "#71717a",
  done: "#6b7280",
};

/** Darker shade of each stage color for gradient bottom. */
export const STAGE_COLORS_DARK: Record<string, string> = {
  analyzing: "#1e40af",
  implementing: "#c2410c",
  testing: "#15803d",
  committing: "#7c3aed",
  reviewing: "#0d9488",
  idle: "#52525b",
  done: "#4b5563",
};

export function getStageColor(stage: RalphSessionState | string): string {
  return STAGE_COLORS[stage] ?? "#71717a";
}

export function getStageColorDark(stage: RalphSessionState | string): string {
  return STAGE_COLORS_DARK[stage] ?? "#52525b";
}

// ============================================
// Epic Colors (richer palette with gradients)
// ============================================

export interface GradientPair {
  top: string;
  bottom: string;
  glow: string;
}

/** Rich gradient pairs for epic-level nodes. */
export const EPIC_GRADIENTS: GradientPair[] = [
  { top: "#f97316", bottom: "#c2410c", glow: "rgba(249,115,22,0.5)" },
  { top: "#3b82f6", bottom: "#1e40af", glow: "rgba(59,130,246,0.5)" },
  { top: "#22c55e", bottom: "#15803d", glow: "rgba(34,197,94,0.5)" },
  { top: "#a855f7", bottom: "#7c3aed", glow: "rgba(168,85,247,0.5)" },
  { top: "#14b8a6", bottom: "#0d9488", glow: "rgba(20,184,166,0.5)" },
  { top: "#ef4444", bottom: "#b91c1c", glow: "rgba(239,68,68,0.5)" },
  { top: "#eab308", bottom: "#a16207", glow: "rgba(234,179,8,0.5)" },
  { top: "#ec4899", bottom: "#be185d", glow: "rgba(236,72,153,0.5)" },
  { top: "#6366f1", bottom: "#4338ca", glow: "rgba(99,102,241,0.5)" },
  { top: "#84cc16", bottom: "#4d7c0f", glow: "rgba(132,204,22,0.5)" },
];

export const EPIC_COLORS = EPIC_GRADIENTS.map((g) => g.top);

export function getEpicGradient(index: number, epicColor?: string | null): GradientPair {
  if (epicColor) {
    return { top: epicColor, bottom: darkenColor(epicColor, 0.3), glow: epicColor + "80" };
  }
  return EPIC_GRADIENTS[index % EPIC_GRADIENTS.length]!;
}

export function getEpicColor(index: number, epicColor?: string | null): string {
  if (epicColor) return epicColor;
  return EPIC_COLORS[index % EPIC_COLORS.length]!;
}

// ============================================
// Color Utilities
// ============================================

/** Darken a hex color by a factor (0-1). */
function darkenColor(hex: string, factor: number): string {
  const clean = hex.replace("#", "");
  const r = Math.round(parseInt(clean.substring(0, 2), 16) * (1 - factor));
  const g = Math.round(parseInt(clean.substring(2, 4), 16) * (1 - factor));
  const b = Math.round(parseInt(clean.substring(4, 6), 16) * (1 - factor));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Generate a glow rgba from a hex color. */
export function glowColor(hex: string, alpha = 0.5): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ============================================
// Formatters
// ============================================

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
}

// ============================================
// Time Ranges
// ============================================

export type TimeRange = "7d" | "30d" | "90d" | "all";

export const TIME_RANGES: Array<{ value: TimeRange; label: string }> = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

export function timeRangeToSince(range: TimeRange): string | undefined {
  if (range === "all") return undefined;
  const days = parseInt(range);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ============================================
// View Modes
// ============================================

export type ChartViewMode = "treemap" | "sunburst";
