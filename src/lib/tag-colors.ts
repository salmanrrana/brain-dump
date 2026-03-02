/**
 * Shared tag color palette and hashing utilities.
 *
 * Used by TagInput, TicketTags, and TagListView for consistent tag colors.
 */

export const TAG_COLORS = [
  { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6" }, // blue
  { bg: "rgba(168, 85, 247, 0.15)", text: "#a855f7" }, // purple
  { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e" }, // green
  { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316" }, // orange
  { bg: "rgba(236, 72, 153, 0.15)", text: "#ec4899" }, // pink
  { bg: "rgba(14, 165, 233, 0.15)", text: "#0ea5e9" }, // sky
  { bg: "rgba(234, 179, 8, 0.15)", text: "#ca8a04" }, // yellow (darkened for contrast)
  { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444" }, // red
  { bg: "rgba(99, 102, 241, 0.15)", text: "#6366f1" }, // indigo
  { bg: "rgba(20, 184, 166, 0.15)", text: "#14b8a6" }, // teal
] as const;

/**
 * Simple hash function to consistently map tag names to colors.
 * Same tag will always get the same color.
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get color for a tag based on its name.
 */
export function getTagColor(tag: string): { bg: string; text: string } {
  const index = hashString(tag) % TAG_COLORS.length;
  return TAG_COLORS[index]!;
}
