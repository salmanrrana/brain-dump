import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LaunchProviderMenu } from "./LaunchProviderMenu";
import {
  getInteractiveUiLaunchProvidersForContext,
  getRalphAutonomousUiLaunchProvidersForContext,
} from "../lib/ui-launch-registry";

describe("LaunchProviderMenu", () => {
  it("renders provider labels from the shared registry for epic launch contexts", () => {
    render(
      <LaunchProviderMenu
        interactiveContext="epic-next-ticket"
        ralphContext="epic"
        onInteractiveLaunch={vi.fn()}
        onRalphLaunch={vi.fn()}
        exportAction={<button type="button">Export Epic</button>}
      />
    );

    for (const provider of getInteractiveUiLaunchProvidersForContext("epic-next-ticket")) {
      expect(
        screen.getAllByRole("button", { name: provider.display.label }).length
      ).toBeGreaterThan(0);
    }

    for (const provider of getRalphAutonomousUiLaunchProvidersForContext("epic")) {
      const label = provider.display.label.replace("Ralph (", "").replace(")", "");
      expect(screen.getAllByRole("button", { name: label }).length).toBeGreaterThan(0);
    }

    expect(screen.getByRole("button", { name: "Export Epic" })).toBeInTheDocument();
  });

  it("omits the epic export action unless a caller provides it", () => {
    render(
      <LaunchProviderMenu
        interactiveContext="ticket"
        ralphContext="ticket"
        onInteractiveLaunch={vi.fn()}
        onRalphLaunch={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Export Epic" })).not.toBeInTheDocument();
  });
});
