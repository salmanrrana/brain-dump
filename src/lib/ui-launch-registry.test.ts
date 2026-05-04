import { describe, expect, it, vi } from "vitest";
import {
  INTERACTIVE_UI_LAUNCH_PROVIDERS,
  PROJECT_WORKING_METHOD_UI_PROVIDERS,
  RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS,
  getInteractiveUiLaunchProvidersForContext,
  getRalphAutonomousUiLaunchProvidersForContext,
} from "./ui-launch-registry";
import {
  dispatchInteractiveUiLaunch,
  dispatchRalphAutonomousUiLaunch,
  type InteractiveLaunchDependencies,
  type RalphLaunchDependencies,
} from "./ui-launch-dispatcher";
import {
  PROJECT_WORKING_METHOD_PROVIDER_IDS,
  type InteractiveLaunchProviderId,
  type RalphAutonomousProviderId,
} from "./launch-provider-contract";

const expectedInteractiveProviderIds: InteractiveLaunchProviderId[] = [
  "claude",
  "codex",
  "codex-cli",
  "codex-app",
  "vscode",
  "cursor",
  "cursor-agent",
  "copilot",
  "opencode",
  "pi",
];

const expectedRalphProviderIds: RalphAutonomousProviderId[] = [
  "ralph-native",
  "ralph-codex",
  "ralph-cursor-agent",
  "ralph-copilot",
  "ralph-opencode",
  "ralph-pi",
];

function makeInteractiveDependencies(): InteractiveLaunchDependencies & {
  calls: Record<string, ReturnType<typeof vi.fn>>;
} {
  const calls = {
    getTicketContext: vi.fn().mockResolvedValue({
      context: "# Ticket context",
      projectPath: "/repo/from-context",
      projectName: "Brain Dump",
      epicName: "Launch Epic",
      ticketTitle: "Unify providers",
    }),
    launchClaude: vi.fn().mockResolvedValue({ success: true, message: "claude" }),
    launchCodex: vi.fn().mockResolvedValue({ success: true, message: "codex" }),
    launchVSCode: vi.fn().mockResolvedValue({ success: true, message: "vscode" }),
    launchCursor: vi.fn().mockResolvedValue({ success: true, message: "cursor" }),
    launchCursorAgent: vi.fn().mockResolvedValue({ success: true, message: "cursor-agent" }),
    launchCopilot: vi.fn().mockResolvedValue({ success: true, message: "copilot" }),
    launchOpenCode: vi.fn().mockResolvedValue({ success: true, message: "opencode" }),
    launchPi: vi.fn().mockResolvedValue({ success: true, message: "pi" }),
  };

  return { ...calls, calls };
}

describe("shared UI launch registry", () => {
  it("exports every supported interactive provider exactly once in order", () => {
    expect(INTERACTIVE_UI_LAUNCH_PROVIDERS.map((provider) => provider.id)).toEqual(
      expectedInteractiveProviderIds
    );
  });

  it("exports every supported Ralph autonomous provider exactly once in order", () => {
    expect(RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS.map((provider) => provider.id)).toEqual(
      expectedRalphProviderIds
    );
  });

  it("keeps ticket and epic interactive launch surfaces on the full shared provider set", () => {
    for (const context of ["ticket", "epic-next-ticket"] as const) {
      expect(
        getInteractiveUiLaunchProvidersForContext(context).map((provider) => provider.id)
      ).toEqual(expectedInteractiveProviderIds);
    }
  });

  it("keeps ticket, epic, and focused review Ralph surfaces on the full shared provider set", () => {
    for (const context of ["ticket", "epic", "focused-review"] as const) {
      expect(
        getRalphAutonomousUiLaunchProvidersForContext(context).map((provider) => provider.id)
      ).toEqual(expectedRalphProviderIds);
    }
  });

  it("keeps project working methods aligned with the supported provider contract", () => {
    expect(PROJECT_WORKING_METHOD_UI_PROVIDERS.map((provider) => provider.id)).toEqual(
      PROJECT_WORKING_METHOD_PROVIDER_IDS
    );
  });
});

describe("shared UI launch dispatcher", () => {
  it.each([
    ["claude", "launchClaude", undefined],
    ["codex", "launchCodex", "auto"],
    ["codex-cli", "launchCodex", "cli"],
    ["codex-app", "launchCodex", "app"],
    ["vscode", "launchVSCode", undefined],
    ["cursor", "launchCursor", undefined],
    ["cursor-agent", "launchCursorAgent", undefined],
    ["copilot", "launchCopilot", undefined],
    ["opencode", "launchOpenCode", undefined],
    ["pi", "launchPi", undefined],
  ] as const)(
    "maps %s to the shared interactive launcher",
    async (providerId, launcherName, launchMode) => {
      const dependencies = makeInteractiveDependencies();
      const provider = INTERACTIVE_UI_LAUNCH_PROVIDERS.find(
        (candidate) => candidate.id === providerId
      );

      expect(provider).toBeDefined();
      await dispatchInteractiveUiLaunch(
        provider!,
        {
          kind: "ticket",
          ticketId: "ticket-1",
          preferredTerminal: "ghostty",
        },
        dependencies
      );

      expect(dependencies.calls[launcherName]).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: "ticket-1",
          context: "# Ticket context",
          projectPath: "/repo/from-context",
          preferredTerminal: "ghostty",
        })
      );
      if (launchMode) {
        expect(dependencies.calls[launcherName]).toHaveBeenCalledWith(
          expect.objectContaining({ launchMode })
        );
      }
    }
  );

  it.each([
    ["ralph-native", "claude", undefined],
    ["ralph-codex", "codex", undefined],
    ["ralph-cursor-agent", "cursor-agent", undefined],
    ["ralph-copilot", "claude", "copilot-cli"],
    ["ralph-opencode", "opencode", undefined],
    ["ralph-pi", "pi", undefined],
  ] as const)(
    "maps %s to the shared Ralph ticket payload",
    async (providerId, aiBackend, workingMethodOverride) => {
      const provider = RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS.find(
        (candidate) => candidate.id === providerId
      );
      const dependencies: RalphLaunchDependencies = {
        startTicketWorkflow: vi.fn().mockResolvedValue({ success: true, message: "workflow" }),
        startEpicWorkflow: vi.fn().mockResolvedValue({ success: true, message: "epic workflow" }),
        launchTicketRalph: vi.fn().mockResolvedValue({ success: true, message: "ralph" }),
        launchEpicRalph: vi.fn().mockResolvedValue({ success: true, message: "epic" }),
      };

      expect(provider).toBeDefined();
      await dispatchRalphAutonomousUiLaunch(
        provider!,
        {
          kind: "ticket",
          ticketId: "ticket-1",
          projectPath: "/repo",
          preferredTerminal: "ghostty",
        },
        dependencies
      );

      expect(dependencies.startTicketWorkflow).toHaveBeenCalledWith({
        ticketId: "ticket-1",
        projectPath: "/repo",
      });
      expect(dependencies.launchTicketRalph).toHaveBeenCalledWith({
        ticketId: "ticket-1",
        preferredTerminal: "ghostty",
        useSandbox: false,
        aiBackend,
        ...(workingMethodOverride ? { workingMethodOverride } : {}),
      });
    }
  );

  it("maps focused review to the shared Ralph epic payload", async () => {
    const provider = RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS.find(
      (candidate) => candidate.id === "ralph-pi"
    );
    const dependencies: RalphLaunchDependencies = {
      startTicketWorkflow: vi.fn().mockResolvedValue({ success: true, message: "workflow" }),
      startEpicWorkflow: vi.fn().mockResolvedValue({ success: true, message: "epic workflow" }),
      launchTicketRalph: vi.fn().mockResolvedValue({ success: true, message: "ralph" }),
      launchEpicRalph: vi.fn().mockResolvedValue({ success: true, message: "epic" }),
    };

    expect(provider).toBeDefined();
    await dispatchRalphAutonomousUiLaunch(
      provider!,
      {
        kind: "focused-review",
        epicId: "epic-1",
        selectedTicketIds: ["ticket-1", "ticket-2"],
        steeringPrompt: "Check launch parity",
      },
      dependencies
    );

    expect(dependencies.launchEpicRalph).toHaveBeenCalledWith({
      epicId: "epic-1",
      preferredTerminal: null,
      useSandbox: false,
      aiBackend: "pi",
      launchProfile: {
        type: "review",
        selectedTicketIds: ["ticket-1", "ticket-2"],
        steeringPrompt: "Check launch parity",
      },
    });
    expect(dependencies.startEpicWorkflow).not.toHaveBeenCalled();
  });

  it("initializes epic workflow before launching Ralph for an epic", async () => {
    const provider = RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS.find(
      (candidate) => candidate.id === "ralph-pi"
    );
    const dependencies: RalphLaunchDependencies = {
      startTicketWorkflow: vi.fn().mockResolvedValue({ success: true, message: "workflow" }),
      startEpicWorkflow: vi.fn().mockResolvedValue({
        success: true,
        message: "epic workflow",
        warnings: ["Existing branch reused"],
      }),
      launchTicketRalph: vi.fn().mockResolvedValue({ success: true, message: "ralph" }),
      launchEpicRalph: vi.fn().mockResolvedValue({ success: true, message: "epic launched" }),
    };

    expect(provider).toBeDefined();
    const result = await dispatchRalphAutonomousUiLaunch(
      provider!,
      {
        kind: "epic",
        epicId: "epic-1",
        projectPath: "/repo",
        preferredTerminal: "ghostty",
      },
      dependencies
    );

    expect(dependencies.startEpicWorkflow).toHaveBeenCalledWith({
      epicId: "epic-1",
      projectPath: "/repo",
    });
    expect(dependencies.launchEpicRalph).toHaveBeenCalledWith({
      epicId: "epic-1",
      preferredTerminal: "ghostty",
      useSandbox: false,
      aiBackend: "pi",
    });
    expect(result).toEqual({
      success: true,
      message: "epic launched",
      warnings: ["Existing branch reused"],
    });
  });

  it("continues epic Ralph launch when workflow bootstrap warns or fails", async () => {
    const provider = RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS.find(
      (candidate) => candidate.id === "ralph-native"
    );
    const dependencies: RalphLaunchDependencies = {
      startTicketWorkflow: vi.fn().mockResolvedValue({ success: true, message: "workflow" }),
      startEpicWorkflow: vi.fn().mockResolvedValue({ success: false, message: "dirty worktree" }),
      launchTicketRalph: vi.fn().mockResolvedValue({ success: true, message: "ralph" }),
      launchEpicRalph: vi.fn().mockResolvedValue({ success: true, message: "epic launched" }),
    };

    expect(provider).toBeDefined();
    const result = await dispatchRalphAutonomousUiLaunch(
      provider!,
      { kind: "epic", epicId: "epic-1" },
      dependencies
    );

    expect(dependencies.launchEpicRalph).toHaveBeenCalled();
    expect(result.warnings).toEqual([
      "Branch setup skipped: dirty worktree. Launching on the current branch.",
    ]);
  });
});
