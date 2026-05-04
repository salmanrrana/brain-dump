import type {
  InteractiveUiLaunchProvider,
  LaunchProviderAvailability,
  RalphAutonomousUiLaunchProvider,
} from "./launch-provider-contract";

const ticketAndEpicNextAvailability: LaunchProviderAvailability = {
  supportedContexts: ["ticket", "epic-next-ticket"],
};

const ralphAvailability: LaunchProviderAvailability = {
  supportedContexts: ["ticket", "epic", "focused-review"],
};

export const INTERACTIVE_UI_LAUNCH_PROVIDERS: readonly InteractiveUiLaunchProvider[] = [
  {
    id: "claude",
    providerKind: "interactive",
    launchMode: "claude-terminal",
    display: {
      label: "Claude Code",
      description: "Open this ticket in Claude Code from a terminal session.",
      iconKey: "sparkles",
      iconColor: "var(--accent-primary)",
      group: "interactive",
      order: 10,
      recommended: true,
    },
    availability: ticketAndEpicNextAvailability,
  },
  {
    id: "codex",
    providerKind: "interactive",
    launchMode: "codex-auto",
    display: {
      label: "Codex Auto",
      description: "Launch Codex with automatic mode selection.",
      iconKey: "code",
      iconColor: "var(--success)",
      group: "interactive",
      order: 20,
    },
    availability: ticketAndEpicNextAvailability,
  },
  {
    id: "codex-cli",
    providerKind: "interactive",
    launchMode: "codex-cli",
    display: {
      label: "Codex CLI",
      description: "Launch Codex in CLI mode.",
      iconKey: "terminal",
      iconColor: "var(--success)",
      group: "interactive",
      order: 30,
    },
    availability: ticketAndEpicNextAvailability,
  },
  {
    id: "codex-app",
    providerKind: "interactive",
    launchMode: "codex-app",
    display: {
      label: "Codex App",
      description: "Launch Codex in the desktop app mode.",
      iconKey: "monitor",
      iconColor: "var(--success)",
      group: "interactive",
      order: 40,
    },
    availability: ticketAndEpicNextAvailability,
  },
  {
    id: "vscode",
    providerKind: "interactive",
    launchMode: "vscode-editor",
    display: {
      label: "VS Code",
      description: "Open the project and ticket context in VS Code.",
      iconKey: "monitor",
      iconColor: "var(--info)",
      group: "interactive",
      order: 50,
    },
    availability: ticketAndEpicNextAvailability,
  },
  {
    id: "cursor",
    providerKind: "interactive",
    launchMode: "cursor-editor",
    display: {
      label: "Cursor Editor",
      description: "Open the project and ticket context in Cursor.",
      iconKey: "monitor",
      iconColor: "var(--accent-secondary)",
      group: "interactive",
      order: 60,
    },
    availability: ticketAndEpicNextAvailability,
  },
  {
    id: "cursor-agent",
    providerKind: "interactive",
    launchMode: "cursor-agent-terminal",
    display: {
      label: "Cursor Agent",
      description: "Launch Cursor Agent from a terminal session.",
      iconKey: "bot",
      iconColor: "var(--accent-secondary)",
      group: "interactive",
      order: 70,
    },
    availability: ticketAndEpicNextAvailability,
  },
  {
    id: "copilot",
    providerKind: "interactive",
    launchMode: "copilot-cli",
    display: {
      label: "Copilot CLI",
      description: "Launch GitHub Copilot CLI with ticket context.",
      iconKey: "github",
      iconColor: "var(--text-secondary)",
      group: "interactive",
      order: 80,
    },
    availability: ticketAndEpicNextAvailability,
  },
  {
    id: "opencode",
    providerKind: "interactive",
    launchMode: "opencode-terminal",
    display: {
      label: "OpenCode",
      description: "Launch OpenCode with ticket context.",
      iconKey: "terminal",
      iconColor: "var(--success)",
      group: "interactive",
      order: 90,
    },
    availability: ticketAndEpicNextAvailability,
  },
  {
    id: "pi",
    providerKind: "interactive",
    launchMode: "pi-terminal",
    display: {
      label: "Pi",
      description: "Launch Pi with ticket context.",
      iconKey: "terminal",
      iconColor: "var(--accent-primary)",
      group: "interactive",
      order: 100,
    },
    availability: ticketAndEpicNextAvailability,
  },
] as const;

export const RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS: readonly RalphAutonomousUiLaunchProvider[] = [
  {
    id: "ralph-native",
    providerKind: "ralph-autonomous",
    aiBackend: "claude",
    display: {
      label: "Ralph (Claude)",
      description: "Launch autonomous Ralph using Claude Code.",
      iconKey: "bot",
      iconColor: "var(--accent-primary)",
      group: "autonomous",
      order: 10,
      recommended: true,
    },
    availability: ralphAvailability,
  },
  {
    id: "ralph-codex",
    providerKind: "ralph-autonomous",
    aiBackend: "codex",
    display: {
      label: "Ralph (Codex)",
      description: "Launch autonomous Ralph using Codex.",
      iconKey: "bot",
      iconColor: "var(--success)",
      group: "autonomous",
      order: 20,
    },
    availability: ralphAvailability,
  },
  {
    id: "ralph-cursor-agent",
    providerKind: "ralph-autonomous",
    aiBackend: "cursor-agent",
    display: {
      label: "Ralph (Cursor Agent)",
      description: "Launch autonomous Ralph using Cursor Agent.",
      iconKey: "bot",
      iconColor: "var(--accent-secondary)",
      group: "autonomous",
      order: 30,
    },
    availability: ralphAvailability,
  },
  {
    id: "ralph-copilot",
    providerKind: "ralph-autonomous",
    aiBackend: "claude",
    workingMethodOverride: "copilot-cli",
    display: {
      label: "Ralph (Copilot CLI)",
      description: "Launch autonomous Ralph using the Copilot CLI working method.",
      iconKey: "github",
      iconColor: "var(--text-secondary)",
      group: "autonomous",
      order: 40,
    },
    availability: ralphAvailability,
  },
  {
    id: "ralph-opencode",
    providerKind: "ralph-autonomous",
    aiBackend: "opencode",
    display: {
      label: "Ralph (OpenCode)",
      description: "Launch autonomous Ralph using OpenCode.",
      iconKey: "bot",
      iconColor: "var(--success)",
      group: "autonomous",
      order: 50,
    },
    availability: ralphAvailability,
  },
  {
    id: "ralph-pi",
    providerKind: "ralph-autonomous",
    aiBackend: "pi",
    display: {
      label: "Ralph (Pi)",
      description: "Launch autonomous Ralph using Pi.",
      iconKey: "bot",
      iconColor: "var(--accent-primary)",
      group: "autonomous",
      order: 60,
    },
    availability: ralphAvailability,
  },
] as const;

export function getInteractiveUiLaunchProvider(
  id: string
): InteractiveUiLaunchProvider | undefined {
  return INTERACTIVE_UI_LAUNCH_PROVIDERS.find((provider) => provider.id === id);
}

export function getRalphAutonomousUiLaunchProvider(
  id: string
): RalphAutonomousUiLaunchProvider | undefined {
  return RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS.find((provider) => provider.id === id);
}
