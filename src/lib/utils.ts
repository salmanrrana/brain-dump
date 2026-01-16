/**
 * Safely parse JSON with a fallback value.
 * Returns the fallback if the input is null/undefined or parsing fails.
 * Logs parsing failures for debugging data corruption issues.
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    // Log parsing failure for debugging - helps identify data corruption
    console.error("[safeJsonParse] Failed to parse JSON:", {
      preview: json.length > 100 ? json.substring(0, 100) + "..." : json,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return fallback;
  }
}

/**
 * Safely stringify a value to JSON, returning null if the value is null/undefined.
 * Handles circular references and other stringify errors gracefully.
 */
export function safeJsonStringify<T>(value: T | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch (error) {
    console.error("[safeJsonStringify] Failed to stringify value:", error);
    return null;
  }
}

/**
 * Ensures an entity exists, throwing an error if not found.
 * Use with drizzle-orm query results.
 */
export function ensureExists<T>(
  entity: T | undefined,
  entityName: string,
  id: string
): T {
  if (!entity) {
    throw new Error(`${entityName} not found: ${id}`);
  }
  return entity;
}

/**
 * Returns a pluralized string based on count.
 * @param count - The number to check
 * @param singular - The singular form of the word
 * @param plural - Optional plural form (defaults to singular + "s")
 * @returns Formatted string like "1 item" or "5 items"
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string
): string {
  return `${count} ${count === 1 ? singular : plural ?? singular + "s"}`;
}
