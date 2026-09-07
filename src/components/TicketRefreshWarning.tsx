interface TicketRefreshWarningProps {
  error: string | null;
  onRetry: () => unknown;
}

/** Keep cached tickets and open edits visible while a background refresh fails. */
export function TicketRefreshWarning({ error, onRetry }: TicketRefreshWarningProps) {
  if (!error) return null;
  return (
    <p role="status" className="px-4 py-2 text-sm text-[var(--accent-danger)]">
      Could not refresh tickets. Showing the last loaded data.{" "}
      <button type="button" className="underline" onClick={() => void onRetry()}>
        Try again
      </button>
    </p>
  );
}
