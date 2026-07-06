import { Bot, Code2, Github, Loader2, Monitor, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { CostModel } from "../../core/types";
import type {
  InteractiveUiLaunchProvider,
  LaunchProviderRuntimeAvailability,
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
    modelSelection: LaunchModelSelection,
    reviewerProvider?: RalphAutonomousUiLaunchProvider,
    reviewerModelSelection?: LaunchModelSelection
  ) => void;
  exportAction?: ReactNode;
  disabled?: boolean;
  loadingProviderId?: UiLaunchProviderId | null;
  showInteractive?: boolean;
  showRalph?: boolean;
  costModels?: readonly CostModel[];
  modelCatalogLoading?: boolean;
  modelCatalogError?: unknown;
  availabilityByProviderId?: Partial<Record<UiLaunchProviderId, LaunchProviderRuntimeAvailability>>;
  availabilityLoading?: boolean;
  availabilityError?: string | null;
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

  return `Only Default is available for ${providerLabel} because Brain Dump does not have pricing-backed model choices for this provider yet.`;
}

function getAvailabilityLabel(
  availability: LaunchProviderRuntimeAvailability | undefined,
  loading: boolean
): string {
  if (loading && !availability) {
    return "Checking";
  }

  if (!availability) {
    return "Ready";
  }

  if (!availability.installed) {
    return "Not installed";
  }

  if (availability.mode === "app") {
    return "App detected";
  }

  return "CLI detected";
}

function getAvailabilityDescription(
  availability: LaunchProviderRuntimeAvailability | undefined,
  providerLabel: string,
  loading: boolean
): string {
  if (loading && !availability) {
    return `Checking ${providerLabel} availability. The menu remains usable while this runs.`;
  }

  if (!availability) {
    return `${providerLabel} availability has not been checked yet.`;
  }

  if (availability.installed) {
    return `${providerLabel} is available${availability.detail ? ` at ${availability.detail}` : ""}.`;
  }

  return availability.error ?? `${providerLabel} is not installed.`;
}

function getProviderButtonClass(isUnavailable: boolean): string {
  const baseClass =
    "group flex min-h-[4.5rem] items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-tertiary)]";

  if (isUnavailable) {
    return `${baseClass} border-[var(--border-primary)] bg-[var(--bg-primary)] opacity-60 disabled:cursor-not-allowed`;
  }

  return `${baseClass} border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50`;
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
  availabilityByProviderId = {},
  availabilityLoading = false,
  availabilityError = null,
}: LaunchProviderMenuProps) {
  const [modelPickerEnabled, setModelPickerEnabled] = useState(false);
  const [reviewerPickerEnabled, setReviewerPickerEnabled] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<UiLaunchProviderId | null>(null);
  const [activeReviewerProviderId, setActiveReviewerProviderId] =
    useState<UiLaunchProviderId | null>(null);
  const [selectedChoiceIds, setSelectedChoiceIds] = useState<
    Partial<Record<UiLaunchProviderId, string>>
  >({});
  const [selectedReviewerChoiceIds, setSelectedReviewerChoiceIds] = useState<
    Partial<Record<UiLaunchProviderId, string>>
  >({});
  const interactiveProviders = getInteractiveUiLaunchProvidersForContext(interactiveContext);
  const ralphProviders = getRalphAutonomousUiLaunchProvidersForContext(ralphContext);
  const reviewerProviders = ralphProviders.filter(
    (provider) => provider.workingMethodOverride !== "copilot-cli"
  );
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
  const activeReviewerProvider =
    reviewerProviders.find((provider) => provider.id === activeReviewerProviderId) ??
    reviewerProviders[0];
  const activeReviewerCatalog = activeReviewerProvider
    ? getLaunchModelCatalog(activeReviewerProvider.id, costModels)
    : undefined;
  const selectedReviewerChoiceId = activeReviewerProvider
    ? (selectedReviewerChoiceIds[activeReviewerProvider.id] ?? "default")
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

  function getSelectedReviewerModelSelection(providerId: UiLaunchProviderId): LaunchModelSelection {
    if (!modelPickerEnabled) {
      return DEFAULT_LAUNCH_MODEL_SELECTION;
    }

    const catalog = getLaunchModelCatalog(providerId, costModels);
    const selectedId = selectedReviewerChoiceIds[providerId] ?? "default";
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
                const availability = availabilityByProviderId[provider.id];
                const providerLabel = provider.display.label;
                const isUnavailable = availability?.installed === false;
                const descriptionId = `launch-provider-${provider.id}-availability`;

                return (
                  <button
                    key={provider.id}
                    onFocus={() => setActiveProvider(provider.id)}
                    onMouseEnter={() => setActiveProvider(provider.id)}
                    onClick={() =>
                      onInteractiveLaunch(provider, getSelectedModelSelection(provider.id))
                    }
                    disabled={disabled || isUnavailable}
                    title={provider.display.description}
                    aria-label={providerLabel}
                    aria-describedby={descriptionId}
                    className={getProviderButtonClass(isUnavailable)}
                  >
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
                      {loadingProviderId === provider.id ? (
                        <Loader2
                          size={14}
                          color={provider.display.iconColor}
                          className="animate-spin"
                        />
                      ) : (
                        <Icon size={14} color={provider.display.iconColor} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                        {providerLabel}
                      </span>
                      <span
                        id={descriptionId}
                        className={
                          isUnavailable
                            ? "mt-1 block text-xs leading-snug text-[var(--warning)]"
                            : "mt-1 block text-xs leading-snug text-[var(--text-tertiary)]"
                        }
                      >
                        {getAvailabilityDescription(
                          availability,
                          providerLabel,
                          availabilityLoading
                        )}
                      </span>
                      <span className="mt-1 inline-flex rounded-full bg-[var(--bg-active)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                        {getAvailabilityLabel(availability, availabilityLoading)}
                      </span>
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
                const providerLabel = getRalphDisplayLabel(provider.display.label);
                const availability = availabilityByProviderId[provider.id];
                const isUnavailable = availability?.installed === false;
                const descriptionId = `launch-provider-${provider.id}-availability`;

                return (
                  <button
                    key={provider.id}
                    onFocus={() => setActiveProvider(provider.id)}
                    onMouseEnter={() => setActiveProvider(provider.id)}
                    onClick={() =>
                      onRalphLaunch(
                        provider,
                        getSelectedModelSelection(provider.id),
                        reviewerPickerEnabled ? activeReviewerProvider : undefined,
                        reviewerPickerEnabled && activeReviewerProvider
                          ? getSelectedReviewerModelSelection(activeReviewerProvider.id)
                          : undefined
                      )
                    }
                    disabled={disabled || isUnavailable}
                    title={provider.display.description}
                    aria-label={providerLabel}
                    aria-describedby={descriptionId}
                    className={getProviderButtonClass(isUnavailable)}
                  >
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
                      {loadingProviderId === provider.id ? (
                        <Loader2
                          size={14}
                          color={provider.display.iconColor}
                          className="animate-spin"
                        />
                      ) : (
                        <Icon size={14} color={provider.display.iconColor} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                        {providerLabel}
                      </span>
                      <span
                        id={descriptionId}
                        className={
                          isUnavailable
                            ? "mt-1 block text-xs leading-snug text-[var(--warning)]"
                            : "mt-1 block text-xs leading-snug text-[var(--text-tertiary)]"
                        }
                      >
                        {getAvailabilityDescription(
                          availability,
                          providerLabel,
                          availabilityLoading
                        )}
                      </span>
                      <span className="mt-1 inline-flex rounded-full bg-[var(--bg-active)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                        {getAvailabilityLabel(availability, availabilityLoading)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showRalph && reviewerProviders.length > 0 && (
        <div className="border-t border-[var(--border-primary)] px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={reviewerPickerEnabled}
              disabled={disabled}
              onChange={(event) => setReviewerPickerEnabled(event.target.checked)}
              className="h-4 w-4 accent-[var(--accent-ai)]"
            />
            <span>Review with a different AI</span>
          </label>
        </div>
      )}

      {reviewerPickerEnabled && activeReviewerProvider && (
        <div className="border-t border-[var(--border-primary)] p-3 space-y-3">
          <label
            htmlFor="fresh-eyes-reviewer-provider"
            className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
          >
            Reviewer provider
          </label>
          <select
            id="fresh-eyes-reviewer-provider"
            value={activeReviewerProvider.id}
            disabled={disabled}
            onChange={(event) =>
              setActiveReviewerProviderId(event.target.value as UiLaunchProviderId)
            }
            className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Fresh-eyes reviewer provider"
          >
            {reviewerProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {getRalphDisplayLabel(provider.display.label)}
              </option>
            ))}
          </select>

          {modelPickerEnabled && activeReviewerCatalog && (
            <div>
              <label
                htmlFor={`fresh-eyes-reviewer-model-${activeReviewerProvider.id}`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Reviewer model
              </label>
              <select
                id={`fresh-eyes-reviewer-model-${activeReviewerProvider.id}`}
                value={selectedReviewerChoiceId}
                disabled={disabled || modelCatalogLoading}
                onChange={(event) =>
                  setSelectedReviewerChoiceIds((current) => ({
                    ...current,
                    [activeReviewerProvider.id]: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`Reviewer model for ${getRalphDisplayLabel(activeReviewerProvider.display.label)}`}
              >
                {activeReviewerCatalog.choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.detail ? `${choice.label} (${choice.detail})` : choice.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

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

      {availabilityError && (
        <div className="border-t border-[var(--border-primary)] px-3 py-2 text-xs text-[var(--warning)]">
          Provider availability could not be checked: {availabilityError}
        </div>
      )}

      {exportAction && (
        <div className="border-t border-[var(--border-primary)] p-3">{exportAction}</div>
      )}
    </>
  );
}
