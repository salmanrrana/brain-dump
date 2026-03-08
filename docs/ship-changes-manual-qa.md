# Ship Changes Manual QA Checklist

Use this checklist for the final user-facing verification of the Ship Changes flow.

## Epic ship happy path

- Open an epic with an existing epic branch and no linked PR.
- Verify the header shows `Ship Changes` and does not show `Push`.
- Launch the modal, confirm preflight checks are green, and ship selected files.
- Verify the success state shows a commit hash, PR number, and working copy/open actions.
- Close the modal and confirm the epic page now shows `Push` plus the linked PR status.

## Ticket ship happy path

- Open a ticket with `branchName` set and no linked PR.
- Verify the ticket header shows `Ship` before `Edit`.
- Launch the modal, ship selected files, and confirm the success state is visible.
- Close the modal and confirm the ticket header now shows `Push` and the linked PR metadata.

## Push-only happy path

- Open an epic or ticket that already has a linked PR.
- Verify only `Push` is shown for the ship action.
- Trigger `Push` and confirm the button shows a loading state while the request is in flight.
- Confirm a success toast is shown and the page refresh preserves the linked PR state.

## Blocked-review recovery path

- Force the review marker to be stale or missing.
- Open the modal and verify the blocked-review state explains what to do next.
- Use `Run Review` and confirm the terminal-launch feedback is visible.
- Use `Recheck` after refreshing the marker and confirm the modal returns to preflight.

## Blocked-main recovery path

- Open the modal while the scope points at `main`, `master`, or `develop`.
- Verify the blocked-main state explains that direct shipping is not allowed.
- Use `Create feature branch and continue`.
- Confirm the success/info feedback is visible and the modal returns to preflight on the new branch.

## Visible error handling

- Verify the modal keeps shipping disabled when `gh` is unavailable, the remote is missing, or no files are selected.
- Force a commit failure, push failure, and PR creation failure one at a time.
- Confirm the error state keeps the failed step and the server-provided message visible until the user retries.
- Verify `Retry from preflight` restores the preflight screen and reloads current repo state.

## Post-ship refresh checks

- After a successful ship, confirm the epic detail page refreshes to show the PR-linked state without a manual reload.
- After a successful ship, confirm the ticket detail page refreshes to show the PR-linked state without a manual reload.
- Verify the refreshed UI still shows the correct `Push` action and linked PR badge/status on both pages.
