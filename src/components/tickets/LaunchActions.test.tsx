import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LaunchActions } from "./LaunchActions";
import {
  getInteractiveUiLaunchProvidersForContext,
  getRalphAutonomousUiLaunchProvidersForContext,
} from "../../lib/ui-launch-registry";

describe("LaunchActions", () => {
  it("renders ticket providers from the shared registry without epic export actions", () => {
    render(<LaunchActions ticketStatus="ready" onLaunch={vi.fn()} />);

    for (const provider of getInteractiveUiLaunchProvidersForContext("ticket")) {
      expect(
        screen.getAllByRole("button", { name: provider.display.label }).length
      ).toBeGreaterThan(0);
    }

    for (const provider of getRalphAutonomousUiLaunchProvidersForContext("ticket")) {
      const label = provider.display.label.replace("Ralph (", "").replace(")", "");
      expect(screen.getAllByRole("button", { name: label }).length).toBeGreaterThan(0);
    }

    expect(screen.queryByRole("button", { name: "Export Epic" })).not.toBeInTheDocument();
  });
});
