/** Extract a human-readable message from an unknown error value. */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
