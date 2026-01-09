/**
 * Safely parse JSON with a fallback value.
 * Returns the fallback if the input is null/undefined or parsing fails.
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely stringify a value to JSON, returning null if the value is null/undefined.
 */
export function safeJsonStringify<T>(value: T | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
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
