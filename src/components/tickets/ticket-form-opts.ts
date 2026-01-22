import { formOptions } from "@tanstack/react-form-start";
import type { TicketFormData } from "./ticket-form-schema";

/**
 * Default values for a new ticket form.
 *
 * - Status defaults to "backlog" for new tickets
 * - Priority is undefined (shows "None" in UI)
 * - Arrays (tags, subtasks) default to empty
 * - Blocking is disabled by default
 */
const defaultTicket: TicketFormData = {
  title: "",
  description: "",
  status: "backlog",
  priority: undefined,
  epicId: undefined,
  tags: [],
  subtasks: [],
  isBlocked: false,
  blockedReason: "",
};

/**
 * TanStack Form options for Ticket forms.
 *
 * Usage in CreateTicketModal:
 * ```typescript
 * const form = useForm({
 *   ...ticketFormOpts,
 *   validators: {
 *     onChange: ticketFormSchema,
 *   },
 *   onSubmit: async ({ value }) => {
 *     await createTicketMutation.mutateAsync({
 *       ...value,
 *       projectId, // projectId comes from props, not form
 *     });
 *   },
 * });
 * ```
 *
 * Usage in EditTicketModal:
 * ```typescript
 * const form = useForm({
 *   ...ticketFormOpts,
 *   defaultValues: {
 *     title: ticket.title,
 *     description: ticket.description ?? '',
 *     status: ticket.status,
 *     priority: ticket.priority,
 *     epicId: ticket.epicId,
 *     tags: JSON.parse(ticket.tags ?? '[]'),
 *     subtasks: JSON.parse(ticket.subtasks ?? '[]'),
 *     isBlocked: ticket.isBlocked ?? false,
 *     blockedReason: ticket.blockedReason ?? '',
 *   },
 *   validators: {
 *     onChange: ticketFormSchema,
 *   },
 *   onSubmit: async ({ value }) => {
 *     await updateTicketMutation.mutateAsync({ id: ticket.id, updates: value });
 *   },
 * });
 * ```
 */
export const ticketFormOpts = formOptions({
  defaultValues: defaultTicket,
});
