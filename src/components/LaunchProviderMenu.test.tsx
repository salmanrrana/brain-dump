import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CostModel } from "../../core/types";
import { LaunchProviderMenu } from "./LaunchProviderMenu";
import {
  getInteractiveUiLaunchProvidersForContext,
  getRalphAutonomousUiLaunchProvidersForContext,
} from "../lib/ui-launch-registry";

function makeCostModel(provider: string, modelName: string): CostModel {
  return {
    id: `${provider}-${modelName}`,
    provider,
    modelName,
    inputCostPerMtok: 1,
    outputCostPerMtok: 5,
    cacheReadCostPerMtok: null,
    cacheCreateCostPerMtok: null,
    isDefault: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const COST_MODELS: CostModel[] = [
  makeCostModel("anthropic", "claude-sonnet-4-6"),
  makeCostModel("openai", "gpt-5.4"),
  makeCostModel("google", "gemini-2.5-pro"),
  makeCostModel("opensource", "Qwen3 Coder 480B"),
];

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

  it("can render focused review Ralph providers without an empty interactive section", () => {
    render(
      <LaunchProviderMenu
        interactiveContext="focused-review"
        ralphContext="focused-review"
        onInteractiveLaunch={vi.fn()}
        onRalphLaunch={vi.fn()}
        showInteractive={false}
      />
    );

    expect(screen.queryByText("Interactive")).not.toBeInTheDocument();
    expect(screen.getByText("Ralph")).toBeInTheDocument();

    for (const provider of getRalphAutonomousUiLaunchProvidersForContext("focused-review")) {
      const label = provider.display.label.replace("Ralph (", "").replace(")", "");
      expect(screen.getAllByRole("button", { name: label }).length).toBeGreaterThan(0);
    }
  });

  it("keeps model choices hidden until the user opts into model picking", async () => {
    const user = userEvent.setup();

    render(
      <LaunchProviderMenu
        interactiveContext="ticket"
        ralphContext="ticket"
        onInteractiveLaunch={vi.fn()}
        onRalphLaunch={vi.fn()}
        costModels={COST_MODELS}
        showRalph={false}
      />
    );

    expect(screen.queryByLabelText(/model for claude code/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /pick your model/i }));

    expect(screen.getByLabelText(/model for claude code/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /default/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /claude-sonnet-4-6/i })).toBeInTheDocument();
  });

  it("passes Default when launching without enabling model picking", async () => {
    const user = userEvent.setup();
    const onInteractiveLaunch = vi.fn();

    render(
      <LaunchProviderMenu
        interactiveContext="ticket"
        ralphContext="ticket"
        onInteractiveLaunch={onInteractiveLaunch}
        onRalphLaunch={vi.fn()}
        costModels={COST_MODELS}
        showRalph={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "Claude Code" }));

    expect(onInteractiveLaunch).toHaveBeenCalledWith(expect.objectContaining({ id: "claude" }), {
      kind: "default",
    });
  });

  it("passes the selected concrete model only for the active launch action", async () => {
    const user = userEvent.setup();
    const onInteractiveLaunch = vi.fn();

    render(
      <LaunchProviderMenu
        interactiveContext="ticket"
        ralphContext="ticket"
        onInteractiveLaunch={onInteractiveLaunch}
        onRalphLaunch={vi.fn()}
        costModels={COST_MODELS}
        showRalph={false}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: /pick your model/i }));
    await user.selectOptions(screen.getByLabelText(/model for claude code/i), [
      "anthropic:claude-sonnet-4-6",
    ]);
    await user.click(screen.getByRole("button", { name: "Claude Code" }));

    expect(onInteractiveLaunch).toHaveBeenCalledWith(expect.objectContaining({ id: "claude" }), {
      kind: "concrete",
      provider: "anthropic",
      modelName: "claude-sonnet-4-6",
    });
  });

  it("changes model choices when focus moves between providers", async () => {
    const user = userEvent.setup();

    render(
      <LaunchProviderMenu
        interactiveContext="ticket"
        ralphContext="ticket"
        onInteractiveLaunch={vi.fn()}
        onRalphLaunch={vi.fn()}
        costModels={COST_MODELS}
        showRalph={false}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: /pick your model/i }));
    await user.hover(screen.getByRole("button", { name: "OpenCode" }));

    const selector = screen.getByLabelText(/model for opencode/i);
    expect(selector).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /openai\/gpt-5.4/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /google\/gemini-2.5-pro/i })).toBeInTheDocument();
  });

  it("explains providers that only support Default", async () => {
    const user = userEvent.setup();

    render(
      <LaunchProviderMenu
        interactiveContext="ticket"
        ralphContext="ticket"
        onInteractiveLaunch={vi.fn()}
        onRalphLaunch={vi.fn()}
        costModels={COST_MODELS}
        showRalph={false}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: /pick your model/i }));
    await user.hover(screen.getByRole("button", { name: "VS Code" }));

    expect(screen.getByLabelText(/model for vs code/i)).toHaveValue("default");
    expect(screen.getByText(/does not have pricing-backed model choices yet/i)).toBeInTheDocument();
  });
});
