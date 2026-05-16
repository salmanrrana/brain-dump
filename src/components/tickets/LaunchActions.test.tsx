import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LaunchActions } from "./LaunchActions";
import {
  getInteractiveUiLaunchProvidersForContext,
  getRalphAutonomousUiLaunchProvidersForContext,
} from "../../lib/ui-launch-registry";

vi.mock("../../lib/hooks", () => ({
  useCostModels: () => ({
    data: [
      {
        id: "openai-gpt-5.4",
        provider: "openai",
        modelName: "gpt-5.4",
        inputCostPerMtok: 1,
        outputCostPerMtok: 5,
        cacheReadCostPerMtok: null,
        cacheCreateCostPerMtok: null,
        isDefault: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

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

  it("launches with Default while model picking is unchecked", async () => {
    const user = userEvent.setup();
    const onLaunch = vi.fn();

    render(<LaunchActions ticketStatus="ready" onLaunch={onLaunch} />);

    await user.click(screen.getByRole("button", { name: "Codex CLI" }));

    expect(onLaunch).toHaveBeenCalledWith("codex-cli", { kind: "default" });
  });

  it("launches with a scoped concrete model when model picking is checked", async () => {
    const user = userEvent.setup();
    const onLaunch = vi.fn();

    render(<LaunchActions ticketStatus="ready" onLaunch={onLaunch} />);

    await user.click(screen.getByRole("checkbox", { name: /pick your model/i }));
    await user.hover(screen.getByRole("button", { name: "Codex CLI" }));
    await user.selectOptions(screen.getByLabelText(/model for codex cli/i), ["openai:gpt-5.4"]);
    await user.click(screen.getByRole("button", { name: "Codex CLI" }));

    expect(onLaunch).toHaveBeenCalledWith("codex-cli", {
      kind: "concrete",
      provider: "openai",
      modelName: "gpt-5.4",
    });
  });
});
