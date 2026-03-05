# Activity Section Divider Overlap Audit

Date: 2026-03-05
Ticket: `7375bbc3-b9d5-4c06-9ba1-bc707f8c3f57`

## Reproduction

1. Start app with `pnpm dev` and open:
   - `http://localhost:4243/ticket/7375bbc3-b9d5-4c06-9ba1-bc707f8c3f57`
2. Scroll to the Activity area near the bottom of the ticket details page.
3. Observe the horizontal divider crossing through the Activity heading/content area.

Runtime measurement from Playwright (viewport 1440x900):

- `ticket-detail-activity` box: `y=666.3125`, `height=209.390625`
- metadata `<footer>` box: `y=690.3125`, `height=51`
- Result: overlap is `true` (boxes intersect vertically)

## Offending Component and Style Source

Primary file: `src/routes/ticket.$id.tsx`

- `activitySectionStyles` sets:
  - `flex: 1`
  - `minHeight: 0`
- `metadataStyles` sets:
  - `borderTop: "1px solid var(--border-primary)"`

Because the Activity section is forced into flex growth/shrink behavior while metadata is rendered as a later sibling with a top border, the metadata row enters the same vertical region as Activity content in this layout, causing the divider line to visually cut through the Activity area.

## Expected Spacing / Divider Behavior

- Activity heading, comments list, and comment input should occupy one uninterrupted vertical block.
- Divider lines should separate sections only at section boundaries, never through section content.
- Metadata should appear after Activity with clear separation, not stacked on top of Activity content.

## Precise Fix Scope (for implementation ticket)

Limit changes to `src/routes/ticket.$id.tsx` layout styles:

- Remove or replace the `flex: 1` behavior on `activitySectionStyles` so Activity does not share vertical space with metadata.
- Keep metadata divider (`metadataStyles.borderTop`) but ensure it is rendered below Activity block without overlap.
- Do not modify Activity comment rendering (`src/components/tickets/ActivitySection.tsx`) unless route-level layout changes are insufficient.
- Do not change unrelated sections (description, subtasks, header, workflow, telemetry, Claude tasks).
