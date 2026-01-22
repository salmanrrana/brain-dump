import { formOptions } from "@tanstack/react-form-start";
import type { TicketFormData } from "./ticket-form-schema";

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

export const ticketFormOpts = formOptions({
  defaultValues: defaultTicket,
});
