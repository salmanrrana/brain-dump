/**
 * Shared JSON utilities for the core layer.
 *
 * These are small helpers used across multiple core modules
 * to avoid duplicating parse logic.
 */

/**
 * Safely parse a JSON string, returning a fallback value if the input
 * is null, undefined, or not valid JSON.
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
