# UI Launch Provider Surface Inventory

This inventory lists the current Brain Dump UI surfaces that own or render launch/provider controls. The shared launch provider contract in `src/lib/launch-provider-contract.ts` is the source-level boundary these surfaces should consume as they are migrated.

## Ticket launch surfaces

- `src/routes/ticket.$id.tsx` — ticket detail route launch handlers and header actions for interactive providers and Ralph/autonomous providers.
- `src/components/tickets/LaunchActions.tsx` — reusable ticket detail launch card grid; currently defines ticket launch option display metadata locally.
- `src/components/tickets/EditTicketModal.tsx` — edit modal launch actions and provider-specific dispatch branches.
- `src/components/TicketModal.tsx` — legacy ticket modal split-button launch menu and provider dispatch.

## Epic launch surfaces

- `src/components/epics/EpicDetailHeader.tsx` — epic detail header Launch menu, epic-next-ticket interactive launch, Ralph launch, and focused review provider buttons.
- `src/components/EpicModal.tsx` — epic edit modal interactive and Ralph launch actions.

## Project/default environment selectors

- `src/components/projects/WorkingMethodSelect.tsx` — project working method selector used by project create/edit flows; it should stay aligned with supported working methods, including Pi.
- `src/components/ProjectModal.tsx` — project create/edit flow that consumes `WorkingMethodSelect`.
- `src/components/projects/EditProjectModal.tsx` — project edit modal that consumes `WorkingMethodSelect`.

## Contract note

Screens may keep their existing visual layouts, labels, loading indicators, and grouping, but provider identity, display metadata, availability, and launch dispatch parameters should come from the shared launch provider contract and follow-up registry/dispatcher instead of screen-local provider enums or switch statements.
