import { Bot, Code2, Github, Loader2, Monitor, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { CostModel } from "../../core/types";
import type {
  InteractiveUiLaunchProvider,
  LaunchProviderIconKey,
  RalphAutonomousUiLaunchProvider,
  UiLaunchContextKind,
  UiLaunchProviderId,
} from "../lib/launch-provider-contract";
import {
  getInteractiveUiLaunchProvidersForContext,
  getRalphAutonomousUiLaunchProvidersForContext,
} from "../lib/ui-launch-registry";
import {
  DEFAULT_LAUNCH_MODEL_SELECTION,
  getLaunchModelCatalog,
  type LaunchModelSelection,
} from "../lib/launch-model-catalog";

const ICONS_BY_KEY: Record<LaunchProviderIconKey, LucideIcon> = {
  sparkles: Terminal,
  bot: Bot,
  code: Code2,
  terminal: Terminal,
  monitor: Monitor,
  github: Github,
};

interface LaunchProviderMenuProps {
  interactiveContext: UiLaunchContextKind;
  ralphContext: UiLaunchContextKind;
  onInteractiveLaunch: (
    provider: InteractiveUiLaunchProvider,
    modelSelection: LaunchModelSelection
  ) => void;
  onRalphLaunch: (
    provider: RalphAutonomousUiLaunchProvider,
    modelSelection: LaunchModelSelection
  ) => void;
  exportAction?: ReactNode;
  disabled?: boolean;
  loadingProviderId?: UiLaunchProviderId | null;
  showInteractive?: boolean;
  showRalph?: boolean;
  costModels?: readonly CostModel[];
  modelCatalogLoading?: boolean;
  modelCatalogError?: unknown;
}

function getRalphDisplayLabel(label: string): string {
  return label.replace("Ralph (", "").replace(")", "");
}

function getProviderDisplayLabel(
  provider: InteractiveUiLaunchProvider | RalphAutonomousUiLaunchProvider
): string {
  return provider.providerKind === "ralph-autonomous"
    ? getRalphDisplayLabel(provider.display.label)
    : provider.display.label;
}

function getDefaultOnlyMessage(reason: string | undefined, providerLabel: string): string {
  if (reason === "no-rows") {
    return `Only Default is available for ${providerLabel} because no matching pricing rows were found.`;
  }

  return `Only Default is available for ${providerLabel} because this provider does not have pricing-backed model choices yet.`;
}

export function LaunchProviderMenu({
  interactiveContext,
  ralphContext,
  onInteractiveLaunch,
  onRalphLaunch,
  exportAction,
  disabled = false,
  loadingProviderId = null,
  showInteractive = true,
  showRalph = true,
  costModels = [],
  modelCatalogLoading = false,
  modelCatalogError = null,
}: LaunchProviderMenuProps) {
  const [modelPickerEnabled, setModelPickerEnabled] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<UiLaunchProviderId | null>(null);
  const [selectedChoiceIds, setSelectedChoiceIds] = useState<
    Partial<Record<UiLaunchProviderId, string>>
  >({});
  const interactiveProviders = getInteractiveUiLaunchProvidersForContext(interactiveContext);
  const ralphProviders = getRalphAutonomousUiLaunchProvidersForContext(ralphContext);
  const visibleSectionCount = [showInteractive, showRalph].filter(Boolean).length;
  const visibleProviders = [
    ...(showInteractive ? interactiveProviders : []),
    ...(showRalph ? ralphProviders : []),
  ];
  const activeProvider =
    visibleProviders.find((provider) => provider.id === activeProviderId) ?? visibleProviders[0];
  const activeCatalog = activeProvider
    ? getLaunchModelCatalog(activeProvider.id, costModels)
    : undefined;
  const selectedChoiceId = activeProvider
    ? (selectedChoiceIds[activeProvider.id] ?? "default")
    : "default";

  function getSelectedModelSelection(providerId: UiLaunchProviderId): LaunchModelSelection {
    if (!modelPickerEnabled) {
      return DEFAULT_LAUNCH_MODEL_SELECTION;
    }

    const catalog = getLaunchModelCatalog(providerId, costModels);
    const selectedId = selectedChoiceIds[providerId] ?? "default";
    return (
      catalog.choices.find((choice) => choice.id === selectedId)?.selection ??
      DEFAULT_LAUNCH_MODEL_SELECTION
    );
  }

  function setActiveProvider(providerId: UiLaunchProviderId): void {
    setActiveProviderId(providerId);
  }

  return (
    <>
      <div className="border-b border-[var(--border-primary)] px-3 py-2">
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={modelPickerEnabled}
            disabled={disabled}
            onChange={(event) => setModelPickerEnabled(event.target.checked)}
            className="h-4 w-4 accent-[var(--accent-primary)]"
          />
          <span>Pick your model</span>
        </label>
      </div>

      <div
        className={
          visibleSectionCount > 1
            ? "grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-primary)]"
            : "grid grid-cols-1"
        }
      >
        {showInteractive && (
          <div className="min-w-0">
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] border-b border-[var(--border-primary)]">
              <Terminal size={14} className="text-[var(--success)]" />
              <span className="text-xs font-semibold text-[var(--success)] uppercase tracking-wider">
                Interactive
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              {interactiveProviders.map((provider) => {
                const Icon = ICONS_BY_KEY[provider.display.iconKey];

                return (
                  <button
                    key={provider.id}
                    onFocus={() => setActiveProvider(provider.id)}
                    onMouseEnter={() => setActiveProvider(provider.id)}
                    onClick={() =>
                      onInteractiveLaunch(provider, getSelectedModelSelection(provider.id))
                    }
                    disabled={disabled}
                    title={provider.display.description}
                    className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingProviderId === provider.id ? (
                      <Loader2
                        size={14}
                        color={provider.display.iconColor}
                        className="flex-shrink-0 animate-spin"
                      />
                    ) : (
                      <Icon
                        size={14}
                        color={provider.display.iconColor}
                        className="flex-shrink-0"
                      />
                    )}
                    <span className="text-sm text-[var(--text-primary)]">
                      {provider.display.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {showRalph && (
          <div className="min-w-0">
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] border-b border-[var(--border-primary)]">
              <Bot size={14} className="text-[var(--accent-ai)]" />
              <span className="text-xs font-semibold text-[var(--accent-ai)] uppercase tracking-wider">
                Ralph
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              {ralphProviders.map((provider) => {
                const Icon = ICONS_BY_KEY[provider.display.iconKey];

                return (
                  <button
                    key={provider.id}
                    onFocus={() => setActiveProvider(provider.id)}
                    onMouseEnter={() => setActiveProvider(provider.id)}
                    onClick={() => onRalphLaunch(provider, getSelectedModelSelection(provider.id))}
                    disabled={disabled}
                    title={provider.display.description}
                    className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingProviderId === provider.id ? (
                      <Loader2
                        size={14}
                        color={provider.display.iconColor}
                        className="flex-shrink-0 animate-spin"
                      />
                    ) : (
                      <Icon
                        size={14}
                        color={provider.display.iconColor}
                        className="flex-shrink-0"
                      />
                    )}
                    <span className="text-sm text-[var(--text-primary)]">
                      {getRalphDisplayLabel(provider.display.label)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {modelPickerEnabled && activeProvider && activeCatalog && (
        <div className="border-t border-[var(--border-primary)] p-3">
          <label
            htmlFor={`launch-model-${activeProvider.id}`}
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
          >
            Model for {getProviderDisplayLabel(activeProvider)}
          </label>
          <select
            id={`launch-model-${activeProvider.id}`}
            value={selectedChoiceId}
            disabled={disabled || modelCatalogLoading}
            onChange={(event) =>
              setSelectedChoiceIds((current) => ({
                ...current,
                [activeProvider.id]: event.target.value,
              }))
            }
            className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`Model for ${getProviderDisplayLabel(activeProvider)}`}
          >
            {activeCatalog.choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.detail ? `${choice.label} (${choice.detail})` : choice.label}
              </option>
            ))}
          </select>
          {modelCatalogLoading && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Loading model choices...</p>
          )}
          {modelCatalogError ? (
            <p className="mt-2 text-xs text-[var(--error)]">
              Model choices could not be loaded. Default remains available.
            </p>
          ) : activeCatalog.defaultOnly ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {getDefaultOnlyMessage(
                activeCatalog.defaultOnlyReason,
                getProviderDisplayLabel(activeProvider)
              )}
            </p>
          ) : null}
        </div>
      )}

      {exportAction && (
        <div className="border-t border-[var(--border-primary)] p-3">{exportAction}</div>
      )}
    </>
  );
}
