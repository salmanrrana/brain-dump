import { ValidationError } from "./errors.ts";

export type ProviderId =
  | "claude-code"
  | "vscode"
  | "cursor"
  | "cursor-agent"
  | "copilot-cli"
  | "codex"
  | "pi"
  | "opencode";

export type ProviderClass = "mcp" | "cli-only";
export type ProviderLaunchMode = "interactive" | "autonomous-ralph";
export type ProviderHookSupport = "full" | "optional" | "mcp-preconditions" | "none";
export type RalphAiBackend = "claude" | "opencode" | "codex" | "cursor-agent" | "pi";
export type RalphWorkingMethod = "auto" | ProviderId;

export type PricingProviderId =
  | "anthropic"
  | "openai"
  | "openai-codex"
  | "cursor"
  | "google"
  | "opensource"
  | "opencode-go";

export interface ProviderCliModelFlag {
  flag: "--model" | "-m";
  prefixWithProvider: boolean;
}

export interface ProviderModelCatalogDefinition {
  pricingProviders: readonly PricingProviderId[];
  modelNamesByProvider?: Partial<Record<PricingProviderId, readonly string[]>>;
  modelFlag?: ProviderCliModelFlag;
}

export interface ProviderCliDefinition {
  binary: string;
  versionArgs: readonly string[];
  modelFlag?: ProviderCliModelFlag;
}

export interface ProviderEnvironmentDefinition {
  explicitFlag?: string;
  envVars?: readonly string[];
  envPrefixes?: readonly string[];
}

export interface ProviderDefinition {
  id: ProviderId;
  displayName: string;
  providerClass: ProviderClass;
  launchModes: readonly ProviderLaunchMode[];
  hookSupport: ProviderHookSupport;
  ralphAiBackend: RalphAiBackend;
  workingMethodOverride?: ProviderId;
  cli?: ProviderCliDefinition;
  environment: ProviderEnvironmentDefinition;
  commentAuthor: string;
  modelCatalog: ProviderModelCatalogDefinition;
}

export interface UiInteractiveProviderDefinition {
  id:
    | "claude"
    | "codex"
    | "codex-cli"
    | "codex-app"
    | "vscode"
    | "cursor"
    | "cursor-agent"
    | "copilot"
    | "opencode"
    | "pi";
  providerId: ProviderId;
  label: string;
  description: string;
  iconKey: "sparkles" | "bot" | "code" | "terminal" | "monitor" | "github";
  iconColor: string;
  order: number;
  recommended?: boolean;
  launchMode:
    | "claude-terminal"
    | "codex-auto"
    | "codex-cli"
    | "codex-app"
    | "vscode-editor"
    | "cursor-editor"
    | "cursor-agent-terminal"
    | "copilot-cli"
    | "opencode-terminal"
    | "pi-terminal";
}

export interface UiRalphProviderDefinition {
  id:
    | "ralph-native"
    | "ralph-codex"
    | "ralph-cursor-agent"
    | "ralph-copilot"
    | "ralph-opencode"
    | "ralph-pi";
  providerId: ProviderId;
  label: string;
  description: string;
  iconKey: "sparkles" | "bot" | "code" | "terminal" | "monitor" | "github";
  iconColor: string;
  order: number;
  recommended?: boolean;
}

export interface CostModelLike {
  provider: string;
  modelName: string;
}

export interface ProviderModelChoice {
  provider: string;
  modelName: string;
  cliValue: string;
}

const NO_MODELS: ProviderModelCatalogDefinition = {
  pricingProviders: [],
};

const BARE_MODEL_FLAG: ProviderCliModelFlag = { flag: "--model", prefixWithProvider: false };
const PROVIDER_PREFIXED_MODEL_FLAG: ProviderCliModelFlag = {
  flag: "--model",
  prefixWithProvider: true,
};

export const OPENCODE_PRICING_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "opensource",
  "cursor",
  "opencode-go",
] as const satisfies readonly PricingProviderId[];

export const PI_PRICING_PROVIDERS = [
  "openai-codex",
  "opencode-go",
] as const satisfies readonly PricingProviderId[];

export const PI_MODEL_NAMES_BY_PROVIDER = {
  "openai-codex": [
    "gpt-5.1",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex-mini",
    "gpt-5.2",
    "gpt-5.2-codex",
    "gpt-5.3-codex",
    "gpt-5.3-codex-spark",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.5",
  ],
  "opencode-go": [
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "glm-5",
    "glm-5.1",
    "kimi-k2.5",
    "kimi-k2.6",
    "mimo-v2.5",
    "mimo-v2.5-pro",
    "minimax-m2.5",
    "minimax-m2.7",
    "qwen3.5-plus",
    "qwen3.6-plus",
  ],
} as const satisfies Partial<Record<PricingProviderId, readonly string[]>>;

const ANTHROPIC_MODELS: ProviderModelCatalogDefinition = {
  pricingProviders: ["anthropic"],
  modelFlag: BARE_MODEL_FLAG,
};

const OPENAI_MODELS: ProviderModelCatalogDefinition = {
  pricingProviders: ["openai"],
  modelFlag: BARE_MODEL_FLAG,
};

const CURSOR_MODELS: ProviderModelCatalogDefinition = {
  pricingProviders: ["cursor"],
  modelFlag: BARE_MODEL_FLAG,
};

const OPENCODE_MODELS: ProviderModelCatalogDefinition = {
  pricingProviders: OPENCODE_PRICING_PROVIDERS,
  modelFlag: PROVIDER_PREFIXED_MODEL_FLAG,
};

const PI_MODELS: ProviderModelCatalogDefinition = {
  pricingProviders: PI_PRICING_PROVIDERS,
  modelNamesByProvider: PI_MODEL_NAMES_BY_PROVIDER,
  modelFlag: PROVIDER_PREFIXED_MODEL_FLAG,
};

export const PROVIDER_IDS = [
  "claude-code",
  "vscode",
  "cursor",
  "cursor-agent",
  "copilot-cli",
  "codex",
  "pi",
  "opencode",
] as const satisfies readonly ProviderId[];

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderDefinition> = {
  "claude-code": {
    id: "claude-code",
    displayName: "Claude Code",
    providerClass: "mcp",
    launchModes: ["interactive", "autonomous-ralph"],
    hookSupport: "full",
    ralphAiBackend: "claude",
    cli: { binary: "claude", versionArgs: ["--version"], modelFlag: BARE_MODEL_FLAG },
    environment: {
      envVars: ["CLAUDE_CODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_TERMINAL_ID"],
    },
    commentAuthor: "claude",
    modelCatalog: ANTHROPIC_MODELS,
  },
  vscode: {
    id: "vscode",
    displayName: "VS Code",
    providerClass: "mcp",
    launchModes: ["interactive", "autonomous-ralph"],
    hookSupport: "mcp-preconditions",
    ralphAiBackend: "claude",
    workingMethodOverride: "vscode",
    environment: {
      envVars: [
        "VSCODE_GIT_ASKPASS_NODE",
        "VSCODE_GIT_ASKPASS_MAIN",
        "VSCODE_GIT_IPC_HANDLE",
        "VSCODE_INJECTION",
        "VSCODE_CLI",
        "VSCODE_PID",
        "VSCODE_CWD",
        "VSCODE_NLS_CONFIG",
        "VSCODE_IPC_HOOK",
      ],
    },
    commentAuthor: "vscode",
    modelCatalog: NO_MODELS,
  },
  cursor: {
    id: "cursor",
    displayName: "Cursor Editor",
    providerClass: "mcp",
    launchModes: ["interactive", "autonomous-ralph"],
    hookSupport: "mcp-preconditions",
    ralphAiBackend: "claude",
    workingMethodOverride: "cursor",
    environment: {
      explicitFlag: "CURSOR",
      envVars: ["CURSOR_TRACE_ID", "CURSOR_SESSION", "CURSOR_PID", "CURSOR_CWD"],
      envPrefixes: ["CURSOR_"],
    },
    commentAuthor: "cursor",
    modelCatalog: NO_MODELS,
  },
  "cursor-agent": {
    id: "cursor-agent",
    displayName: "Cursor Agent",
    providerClass: "mcp",
    launchModes: ["interactive", "autonomous-ralph"],
    hookSupport: "optional",
    ralphAiBackend: "cursor-agent",
    cli: { binary: "agent", versionArgs: ["--help"], modelFlag: BARE_MODEL_FLAG },
    environment: { explicitFlag: "CURSOR_AGENT" },
    commentAuthor: "cursor-agent",
    modelCatalog: CURSOR_MODELS,
  },
  "copilot-cli": {
    id: "copilot-cli",
    displayName: "Copilot CLI",
    providerClass: "mcp",
    launchModes: ["interactive", "autonomous-ralph"],
    hookSupport: "full",
    ralphAiBackend: "claude",
    workingMethodOverride: "copilot-cli",
    environment: {
      explicitFlag: "COPILOT_CLI",
      envVars: ["COPILOT_TRACE_ID", "COPILOT_SESSION", "COPILOT_CLI_VERSION"],
    },
    commentAuthor: "copilot",
    modelCatalog: NO_MODELS,
  },
  codex: {
    id: "codex",
    displayName: "Codex",
    providerClass: "mcp",
    launchModes: ["interactive", "autonomous-ralph"],
    hookSupport: "none",
    ralphAiBackend: "codex",
    cli: { binary: "codex", versionArgs: ["--version"], modelFlag: BARE_MODEL_FLAG },
    environment: {
      explicitFlag: "CODEX",
      envVars: [
        "CODEX_HOME",
        "CODEX_SANDBOX_NETWORK_DISABLED",
        "CODEX_EXECUTOR",
        "CODEX_PROFILE",
        "CODEX_APPROVAL_POLICY",
      ],
      envPrefixes: ["CODEX_"],
    },
    commentAuthor: "codex",
    modelCatalog: OPENAI_MODELS,
  },
  pi: {
    id: "pi",
    displayName: "Pi",
    providerClass: "cli-only",
    launchModes: ["interactive", "autonomous-ralph"],
    hookSupport: "none",
    ralphAiBackend: "pi",
    workingMethodOverride: "pi",
    cli: { binary: "pi", versionArgs: ["--help"], modelFlag: PROVIDER_PREFIXED_MODEL_FLAG },
    environment: {
      explicitFlag: "PI",
      envVars: ["BRAIN_DUMP_PROVIDER"],
    },
    commentAuthor: "pi",
    modelCatalog: PI_MODELS,
  },
  opencode: {
    id: "opencode",
    displayName: "OpenCode",
    providerClass: "mcp",
    launchModes: ["interactive", "autonomous-ralph"],
    hookSupport: "mcp-preconditions",
    ralphAiBackend: "opencode",
    cli: {
      binary: "opencode",
      versionArgs: ["--version"],
      modelFlag: PROVIDER_PREFIXED_MODEL_FLAG,
    },
    environment: {
      explicitFlag: "OPENCODE",
      envVars: [
        "OPENCODE_EXPERIMENTAL",
        "OPENCODE_EXPERIMENTAL_LSP_TOOL",
        "OPENCODE_DEV_DEBUG",
        "OPENCODE_SERVER_PASSWORD",
        "OPENCODE_SERVER_USERNAME",
      ],
      envPrefixes: ["OPENCODE_"],
    },
    commentAuthor: "opencode",
    modelCatalog: OPENCODE_MODELS,
  },
};

export const INTERACTIVE_PROVIDER_DEFINITIONS = [
  {
    id: "claude",
    providerId: "claude-code",
    label: "Claude Code",
    description: "Open this ticket in Claude Code from a terminal session.",
    iconKey: "sparkles",
    iconColor: "var(--accent-primary)",
    order: 10,
    recommended: true,
    launchMode: "claude-terminal",
  },
  {
    id: "codex",
    providerId: "codex",
    label: "Codex Auto",
    description: "Launch Codex with automatic mode selection.",
    iconKey: "code",
    iconColor: "var(--success)",
    order: 20,
    launchMode: "codex-auto",
  },
  {
    id: "codex-cli",
    providerId: "codex",
    label: "Codex CLI",
    description: "Launch Codex in CLI mode.",
    iconKey: "terminal",
    iconColor: "var(--success)",
    order: 30,
    launchMode: "codex-cli",
  },
  {
    id: "codex-app",
    providerId: "codex",
    label: "Codex App",
    description: "Launch Codex in the desktop app mode.",
    iconKey: "monitor",
    iconColor: "var(--success)",
    order: 40,
    launchMode: "codex-app",
  },
  {
    id: "vscode",
    providerId: "vscode",
    label: "VS Code",
    description: "Open the project and ticket context in VS Code.",
    iconKey: "monitor",
    iconColor: "var(--info)",
    order: 50,
    launchMode: "vscode-editor",
  },
  {
    id: "cursor",
    providerId: "cursor",
    label: "Cursor Editor",
    description: "Open the project and ticket context in Cursor.",
    iconKey: "monitor",
    iconColor: "var(--accent-secondary)",
    order: 60,
    launchMode: "cursor-editor",
  },
  {
    id: "cursor-agent",
    providerId: "cursor-agent",
    label: "Cursor Agent",
    description: "Launch Cursor Agent from a terminal session.",
    iconKey: "bot",
    iconColor: "var(--accent-secondary)",
    order: 70,
    launchMode: "cursor-agent-terminal",
  },
  {
    id: "copilot",
    providerId: "copilot-cli",
    label: "Copilot CLI",
    description: "Launch GitHub Copilot CLI with ticket context.",
    iconKey: "github",
    iconColor: "var(--text-secondary)",
    order: 80,
    launchMode: "copilot-cli",
  },
  {
    id: "opencode",
    providerId: "opencode",
    label: "OpenCode",
    description: "Launch OpenCode with ticket context.",
    iconKey: "terminal",
    iconColor: "var(--success)",
    order: 90,
    launchMode: "opencode-terminal",
  },
  {
    id: "pi",
    providerId: "pi",
    label: "Pi",
    description: "Launch Pi with ticket context.",
    iconKey: "terminal",
    iconColor: "var(--accent-primary)",
    order: 100,
    launchMode: "pi-terminal",
  },
] as const satisfies readonly UiInteractiveProviderDefinition[];

export const RALPH_AUTONOMOUS_PROVIDER_DEFINITIONS = [
  {
    id: "ralph-native",
    providerId: "claude-code",
    label: "Ralph (Claude)",
    description: "Launch autonomous Ralph using Claude Code.",
    iconKey: "bot",
    iconColor: "var(--accent-primary)",
    order: 10,
    recommended: true,
  },
  {
    id: "ralph-codex",
    providerId: "codex",
    label: "Ralph (Codex)",
    description: "Launch autonomous Ralph using Codex.",
    iconKey: "bot",
    iconColor: "var(--success)",
    order: 20,
  },
  {
    id: "ralph-cursor-agent",
    providerId: "cursor-agent",
    label: "Ralph (Cursor Agent)",
    description: "Launch autonomous Ralph using Cursor Agent.",
    iconKey: "bot",
    iconColor: "var(--accent-secondary)",
    order: 30,
  },
  {
    id: "ralph-copilot",
    providerId: "copilot-cli",
    label: "Ralph (Copilot CLI)",
    description: "Launch autonomous Ralph using the Copilot CLI working method.",
    iconKey: "github",
    iconColor: "var(--text-secondary)",
    order: 40,
  },
  {
    id: "ralph-opencode",
    providerId: "opencode",
    label: "Ralph (OpenCode)",
    description: "Launch autonomous Ralph using OpenCode.",
    iconKey: "bot",
    iconColor: "var(--success)",
    order: 50,
  },
  {
    id: "ralph-pi",
    providerId: "pi",
    label: "Ralph (Pi)",
    description: "Launch autonomous Ralph using Pi.",
    iconKey: "bot",
    iconColor: "var(--accent-primary)",
    order: 60,
  },
] as const satisfies readonly UiRalphProviderDefinition[];

export type InteractiveLaunchProviderId = (typeof INTERACTIVE_PROVIDER_DEFINITIONS)[number]["id"];
export type RalphAutonomousLaunchProviderId =
  (typeof RALPH_AUTONOMOUS_PROVIDER_DEFINITIONS)[number]["id"];
export type UiLaunchProviderId = InteractiveLaunchProviderId | RalphAutonomousLaunchProviderId;

export const INTERACTIVE_LAUNCH_PROVIDER_IDS = INTERACTIVE_PROVIDER_DEFINITIONS.map(
  (provider) => provider.id
) as readonly InteractiveLaunchProviderId[];

export const RALPH_AUTONOMOUS_PROVIDER_IDS = RALPH_AUTONOMOUS_PROVIDER_DEFINITIONS.map(
  (provider) => provider.id
) as readonly RalphAutonomousLaunchProviderId[];

export const PROJECT_WORKING_METHOD_PROVIDER_IDS = [
  "auto",
  ...PROVIDER_IDS,
] as const satisfies readonly RalphWorkingMethod[];

export function getProviderDefinition(providerId: ProviderId): ProviderDefinition {
  return PROVIDER_REGISTRY[providerId];
}

export function translateProviderForRalph(providerId: ProviderId): {
  aiBackend: RalphAiBackend;
  workingMethodOverride?: ProviderId;
} {
  const provider = getProviderDefinition(providerId);
  return {
    aiBackend: provider.ralphAiBackend,
    ...(provider.workingMethodOverride
      ? { workingMethodOverride: provider.workingMethodOverride }
      : {}),
  };
}

export function getProviderIdForUiLaunchProviderId(providerId: UiLaunchProviderId): ProviderId {
  const interactive = INTERACTIVE_PROVIDER_DEFINITIONS.find(
    (provider) => provider.id === providerId
  );
  if (interactive) return interactive.providerId;

  const autonomous = RALPH_AUTONOMOUS_PROVIDER_DEFINITIONS.find(
    (provider) => provider.id === providerId
  );
  if (autonomous) return autonomous.providerId;

  throw new ValidationError(`Unknown launch provider: ${providerId}`);
}

export function getProviderModelCatalogDefinition(
  providerId: ProviderId
): ProviderModelCatalogDefinition {
  return getProviderDefinition(providerId).modelCatalog;
}

function allowsModel(model: CostModelLike, catalog: ProviderModelCatalogDefinition): boolean {
  if (!(catalog.pricingProviders as readonly string[]).includes(model.provider)) {
    return false;
  }

  const allowedNames = catalog.modelNamesByProvider?.[model.provider as PricingProviderId];
  return !allowedNames || allowedNames.includes(model.modelName);
}

export function getProviderModelChoices(
  providerId: ProviderId,
  costModels: readonly CostModelLike[]
): ProviderModelChoice[] {
  const catalog = getProviderModelCatalogDefinition(providerId);
  if (!catalog.modelFlag || catalog.pricingProviders.length === 0) {
    return [];
  }

  return costModels
    .filter((model) => allowsModel(model, catalog))
    .slice()
    .sort((a, b) => {
      const providerCompare = a.provider.localeCompare(b.provider);
      if (providerCompare !== 0) return providerCompare;
      return a.modelName.localeCompare(b.modelName);
    })
    .map((model) => ({
      provider: model.provider,
      modelName: model.modelName,
      cliValue: catalog.modelFlag?.prefixWithProvider
        ? `${model.provider}/${model.modelName}`
        : model.modelName,
    }));
}

export function resolveProviderModelSelection(
  providerId: ProviderId,
  modelValue: string,
  costModels: readonly CostModelLike[]
): { provider: string; modelName: string } {
  const provider = getProviderDefinition(providerId);
  const choices = getProviderModelChoices(providerId, costModels);
  if (choices.length === 0) {
    throw new ValidationError(`${provider.displayName} does not currently support --model.`);
  }

  const exact = choices.find((choice) => choice.cliValue === modelValue);
  if (exact) {
    return { provider: exact.provider, modelName: exact.modelName };
  }

  const bareMatches = choices.filter((choice) => choice.modelName === modelValue);
  if (bareMatches.length === 1) {
    const match = bareMatches[0]!;
    return { provider: match.provider, modelName: match.modelName };
  }

  if (bareMatches.length > 1) {
    throw new ValidationError(
      `Ambiguous value for --model: "${modelValue}". Use one of: ${bareMatches
        .map((choice) => choice.cliValue)
        .join(", ")}`
    );
  }

  throw new ValidationError(
    `Invalid value for --model: "${modelValue}" for ${provider.displayName}. Allowed: ${choices
      .map((choice) => choice.cliValue)
      .join(", ")}`
  );
}
