import type { AnchorHTMLAttributes } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicTicketsList } from "./EpicTicketsList";

type EpicTicket = Parameters<typeof EpicTicketsList>[0]["tickets"][number];

// The list renders router <Link>s for each ticket; stub them as plain anchors
// so the component can render without a router context.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href="#" {...props}>
      {children}
    </a>
  ),
}));

let ticketCounter = 0;
function makeTicket(overrides: Partial<EpicTicket> = {}): EpicTicket {
  return {
    id: `ticket-${++ticketCounter}`,
    title: "Untitled ticket",
    status: "backlog",
    priority: null,
    isBlocked: null,
    blockedReason: null,
    prNumber: null,
    prStatus: null,
    ...overrides,
  };
}

describe("EpicTicketsList", () => {
  it("shows an empty state when the epic has no tickets", () => {
    render(<EpicTicketsList tickets={[]} />);

    expect(screen.getByText("No tickets in this epic yet")).toBeInTheDocument();
  });

  it("groups tickets by status with per-group counts the user can see", () => {
    render(
      <EpicTicketsList
        tickets={[
          makeTicket({ title: "Build the widget", status: "in_progress" }),
          makeTicket({ title: "Wire the API", status: "in_progress" }),
          makeTicket({ title: "Draft the spec", status: "ready" }),
        ]}
      />
    );

    // Group headers reflect the count of tickets in each status.
    expect(screen.getByText("In Progress (2)")).toBeInTheDocument();
    expect(screen.getByText("Ready (1)")).toBeInTheDocument();

    // Tickets appear under their (expanded) groups.
    expect(screen.getByText("Build the widget")).toBeInTheDocument();
    expect(screen.getByText("Wire the API")).toBeInTheDocument();
    expect(screen.getByText("Draft the spec")).toBeInTheDocument();
  });

  it("hides done tickets until the user expands the collapsed Done group", async () => {
    const user = userEvent.setup();
    render(
      <EpicTicketsList
        tickets={[
          makeTicket({ title: "Active work", status: "in_progress" }),
          makeTicket({ title: "Shipped feature", status: "done" }),
        ]}
      />
    );

    // Done group starts collapsed: its ticket is not shown yet.
    expect(screen.getByText("Done (1)")).toBeInTheDocument();
    expect(screen.queryByText("Shipped feature")).not.toBeInTheDocument();

    // Clicking the Done header reveals the ticket.
    await user.click(screen.getByRole("button", { name: /Done \(1\)/ }));
    expect(screen.getByText("Shipped feature")).toBeInTheDocument();
  });
});
