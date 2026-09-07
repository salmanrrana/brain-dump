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

/** Caps the menu below the viewport so a bottom-anchored dropdown never escapes the top edge. */
const MENU_MAX_HEIGHT = "max-h-[min(70vh,34rem)]";

type AvailabilityTone = "detected" | "checking" | "missing" | "unknown";

const DOT_CLASS_BY_TONE: Record<AvailabilityTone, string> = {
  detected: "bg-[var(--success)]",
  checking: "bg-[var(--text-muted)] animate-pulse motion-reduce:animate-none",
  missing: "bg-[var(--warning)]",
  unknown: "bg-transparent ring-1 ring-inset ring-[var(--border-secondary)]",
};

const STATUS_TEXT_CLASS_BY_TONE: Record<AvailabilityTone, string> = {
  detected: "text-[var(--text-secondary)]",
  checking: "text-[var(--text-secondary)]",
  missing: "text-[var(--warning)]",
  unknown: "text-[var(--text-secondary)]",
};

interface ProviderStatus {
  label: string;
  tone: AvailabilityTone;
  /** Actionable install guidance. Rendered only when the provider is unusable. */
  hint: string | null;
}

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

function getProviderStatus(
  availability: LaunchProviderRuntimeAvailability | undefined,
  providerLabel: string,
  loading: boolean
): ProviderStatus {
  if (!availability) {
    return loading
      ? { label: "Checking", tone: "checking", hint: null }
      : { label: "Ready", tone: "unknown", hint: null };
  }

  if (!availability.installed) {
    return {
      label: "Not installed",
      tone: "missing",
      hint: availability.error ?? `${providerLabel} is not installed.`,
    };
  }

  return {
    label: availability.mode === "app" ? "App detected" : "CLI detected",
    tone: "detected",
    hint: null,
  };
}

function getProviderTitle(description: string, status: ProviderStatus, detail?: string): string {
  if (status.hint) {
    return `${description}\n${status.hint}`;
  }

  return detail ? `${description}\nDetected at ${detail}` : description;
}

interface ProviderOptionProps {
  providerId: UiLaunchProviderId;
  label: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  availability: LaunchProviderRuntimeAvailability | undefined;
  availabilityLoading: boolean;
  disabled: boolean;
  isLaunching: boolean;
  /** Highlights the provider whose model the picker panel is currently editing. */
  isModelTarget: boolean;
  onActivate: () => void;
  onLaunch: () => void;
}

function ProviderOption({
  providerId,
  label,
  description,
  icon: Icon,
  iconColor,
  availability,
  availabilityLoading,
  disabled,
  isLaunching,
  isModelTarget,
  onActivate,
  onLaunch,
}: ProviderOptionProps) {
  const status = getProviderStatus(availability, label, availabilityLoading);
  const isUnavailable = availability?.installed === false;
  const statusId = `launch-provider-${providerId}-availability`;

  const stateClass = isUnavailable
    ? "border-[var(--border-primary)] bg-[var(--bg-primary)] opacity-60 cursor-not-allowed"
    : isModelTarget
      ? "border-[var(--accent-primary)] bg-[var(--accent-surface)]"
      : "border-[var(--border-primary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <button
      onFocus={onActivate}
      onMouseEnter={onActivate}
      onClick={onLaunch}
      disabled={disabled || isUnavailable}
      title={getProviderTitle(description, status, availability?.detail)}
      aria-label={label}
      aria-describedby={statusId}
      className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-tertiary)] ${stateClass}`}
    >
      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
        {isLaunching ? (
          <Loader2 size={14} color={iconColor} className="animate-spin" />
        ) : (
          <Icon size={14} color={iconColor} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-tight text-[var(--text-primary)]">
          {label}
        </span>
        <span
          id={statusId}
          className={`mt-1 flex items-center gap-1.5 text-[11px] leading-tight ${STATUS_TEXT_CLASS_BY_TONE[status.tone]}`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT_CLASS_BY_TONE[status.tone]}`}
          />
          <span className="truncate">{status.label}</span>
        </span>
        {status.hint && (
          <span className="mt-1 line-clamp-2 block text-[11px] leading-snug text-[var(--text-secondary)]">
            {status.hint}
          </span>
        )}
      </span>
    </button>
  );
}

interface ProviderSectionProps {
  title: string;
  icon: LucideIcon;
  accentClass: string;
  children: ReactNode;
}

function ProviderSection({ title, icon: Icon, accentClass, children }: ProviderSectionProps) {
  return (
    <div className="min-w-0">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-1.5">
        <Icon size={13} className={accentClass} />
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${accentClass}`}>
          {title}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-2">{children}</div>
    </div>
  );
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

  function isModelTarget(providerId: UiLaunchProviderId): boolean {
    return modelPickerEnabled && activeProvider?.id === providerId;
  }

  return (
    <div className={`@container flex ${MENU_MAX_HEIGHT} flex-col`}>
      <div className="flex-shrink-0 border-b border-[var(--border-primary)] px-3 py-2">
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
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${
          visibleSectionCount > 1
            ? "grid grid-cols-1 divide-y divide-[var(--border-primary)] @2xl:grid-cols-2 @2xl:divide-x @2xl:divide-y-0"
            : "grid grid-cols-1"
        }`}
      >
        {showInteractive && (
          <ProviderSection title="Interactive" icon={Terminal} accentClass="text-[var(--success)]">
            {interactiveProviders.map((provider) => (
              <ProviderOption
                key={provider.id}
                providerId={provider.id}
                label={provider.display.label}
                description={provider.display.description}
                icon={ICONS_BY_KEY[provider.display.iconKey]}
                iconColor={provider.display.iconColor}
                availability={availabilityByProviderId[provider.id]}
                availabilityLoading={availabilityLoading}
                disabled={disabled}
                isLaunching={loadingProviderId === provider.id}
                isModelTarget={isModelTarget(provider.id)}
                onActivate={() => setActiveProviderId(provider.id)}
                onLaunch={() =>
                  onInteractiveLaunch(provider, getSelectedModelSelection(provider.id))
                }
              />
            ))}
          </ProviderSection>
        )}

        {showRalph && (
          <ProviderSection title="Ralph" icon={Bot} accentClass="text-[var(--accent-ai)]">
            {ralphProviders.map((provider) => (
              <ProviderOption
                key={provider.id}
                providerId={provider.id}
                label={getRalphDisplayLabel(provider.display.label)}
                description={provider.display.description}
                icon={ICONS_BY_KEY[provider.display.iconKey]}
                iconColor={provider.display.iconColor}
                availability={availabilityByProviderId[provider.id]}
                availabilityLoading={availabilityLoading}
                disabled={disabled}
                isLaunching={loadingProviderId === provider.id}
                isModelTarget={isModelTarget(provider.id)}
                onActivate={() => setActiveProviderId(provider.id)}
                onLaunch={() =>
                  onRalphLaunch(
                    provider,
                    getSelectedModelSelection(provider.id),
                    reviewerPickerEnabled ? activeReviewerProvider : undefined,
                    reviewerPickerEnabled && activeReviewerProvider
                      ? getSelectedReviewerModelSelection(activeReviewerProvider.id)
                      : undefined
                  )
                }
              />
            ))}
          </ProviderSection>
        )}
      </div>

      <div className="flex-shrink-0">
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
          <div className="space-y-3 border-t border-[var(--border-primary)] p-3">
            <div>
              <label
                htmlFor="fresh-eyes-reviewer-provider"
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
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
            </div>

            {modelPickerEnabled && activeReviewerCatalog && (
              <div>
                <label
                  htmlFor={`fresh-eyes-reviewer-model-${activeReviewerProvider.id}`}
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
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
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
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
              <p className="mt-2 text-xs text-[var(--text-secondary)]">Loading model choices...</p>
            )}
            {modelCatalogError ? (
              <p className="mt-2 text-xs text-[var(--error)]">
                Model choices could not be loaded. Default remains available.
              </p>
            ) : activeCatalog.defaultOnly ? (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
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
      </div>
    </div>
  );
}
