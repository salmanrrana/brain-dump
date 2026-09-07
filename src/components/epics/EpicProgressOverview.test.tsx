import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EpicProgressOverview } from "./EpicProgressOverview";

describe("EpicProgressOverview", () => {
  it("shows live progress percentage that never exceeds 100%", () => {
    render(
      <EpicProgressOverview
        ticketsByStatus={{ done: 27, in_progress: 1 }}
        ticketsTotal={28}
        ticketsDone={27}
        currentTicketId={null}
      />
    );

    expect(screen.getByText("96%")).toBeInTheDocument();
  });

  it("caps displayed progress at 100% when stale totals would exceed it", () => {
    render(
      <EpicProgressOverview
        ticketsByStatus={{ done: 27, in_progress: 1 }}
        ticketsTotal={14}
        ticketsDone={27}
        currentTicketId={null}
      />
    );

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByText("193%")).not.toBeInTheDocument();
  });
});
