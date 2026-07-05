import {
  INTERACTIVE_PROVIDER_DEFINITIONS,
  PROJECT_WORKING_METHOD_PROVIDER_IDS,
  PROVIDER_REGISTRY,
  RALPH_AUTONOMOUS_PROVIDER_DEFINITIONS,
} from "../../core/providers.ts";
import type {
  InteractiveUiLaunchProvider,
  LaunchProviderAvailability,
  ProjectWorkingMethodProvider,
  RalphAutonomousUiLaunchProvider,
  UiLaunchContextKind,
} from "./launch-provider-contract";

const ticketAndEpicNextAvailability: LaunchProviderAvailability = {
  supportedContexts: ["ticket", "epic-next-ticket"],
};

const ralphAvailability: LaunchProviderAvailability = {
  supportedContexts: ["ticket", "epic", "focused-review"],
};

export const INTERACTIVE_UI_LAUNCH_PROVIDERS: readonly InteractiveUiLaunchProvider[] =
  INTERACTIVE_PROVIDER_DEFINITIONS.map((provider) => ({
    id: provider.id,
    providerKind: "interactive",
    launchMode: provider.launchMode,
    display: {
      label: provider.label,
      description: provider.description,
      iconKey: provider.iconKey,
      iconColor: provider.iconColor,
      group: "interactive",
      order: provider.order,
      ...("recommended" in provider && provider.recommended ? { recommended: true } : {}),
    },
    availability: ticketAndEpicNextAvailability,
  }));

export const PROJECT_WORKING_METHOD_UI_PROVIDERS: readonly ProjectWorkingMethodProvider[] = [
  {
    id: "auto",
    display: {
      label: "Auto-detect",
      description: "Detect from environment",
      iconKey: "sparkles",
      iconColor: "var(--accent-primary)",
      group: "project-environment",
      order: 10,
    },
  },
  ...PROJECT_WORKING_METHOD_PROVIDER_IDS.filter((providerId) => providerId !== "auto").map(
    (providerId, index) => {
      const provider = PROVIDER_REGISTRY[providerId];
      const interactive = INTERACTIVE_PROVIDER_DEFINITIONS.find(
        (candidate) => candidate.providerId === providerId
      );
      return {
        id: providerId,
        display: {
          label: provider.displayName,
          description:
            provider.providerClass === "cli-only"
              ? "CLI-only coding agent"
              : "MCP-capable AI environment",
          iconKey: interactive?.iconKey ?? "terminal",
          iconColor: interactive?.iconColor ?? "var(--text-secondary)",
          group: "project-environment" as const,
          order: (index + 2) * 10,
        },
      };
    }
  ),
] as const;

export const RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS: readonly RalphAutonomousUiLaunchProvider[] =
  RALPH_AUTONOMOUS_PROVIDER_DEFINITIONS.map((provider) => {
    const coreProvider = PROVIDER_REGISTRY[provider.providerId];
    return {
      id: provider.id,
      providerKind: "ralph-autonomous",
      aiBackend: coreProvider.ralphAiBackend,
      ...(coreProvider.workingMethodOverride
        ? { workingMethodOverride: coreProvider.workingMethodOverride }
        : {}),
      display: {
        label: provider.label,
        description: provider.description,
        iconKey: provider.iconKey,
        iconColor: provider.iconColor,
        group: "autonomous",
        order: provider.order,
        ...("recommended" in provider && provider.recommended ? { recommended: true } : {}),
      },
      availability: ralphAvailability,
    };
  });

export function getInteractiveUiLaunchProvidersForContext(
  context: UiLaunchContextKind
): readonly InteractiveUiLaunchProvider[] {
  return INTERACTIVE_UI_LAUNCH_PROVIDERS.filter((provider) =>
    provider.availability.supportedContexts.includes(context)
  );
}

export function getRalphAutonomousUiLaunchProvidersForContext(
  context: UiLaunchContextKind
): readonly RalphAutonomousUiLaunchProvider[] {
  return RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS.filter((provider) =>
    provider.availability.supportedContexts.includes(context)
  );
}

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
