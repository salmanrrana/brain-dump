import { Bot, Code2, Github, Loader2, Monitor, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
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
  onInteractiveLaunch: (provider: InteractiveUiLaunchProvider) => void;
  onRalphLaunch: (provider: RalphAutonomousUiLaunchProvider) => void;
  exportAction?: ReactNode;
  disabled?: boolean;
  loadingProviderId?: UiLaunchProviderId | null;
  showInteractive?: boolean;
  showRalph?: boolean;
}

function getRalphDisplayLabel(label: string): string {
  return label.replace("Ralph (", "").replace(")", "");
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
}: LaunchProviderMenuProps) {
  const interactiveProviders = getInteractiveUiLaunchProvidersForContext(interactiveContext);
  const ralphProviders = getRalphAutonomousUiLaunchProvidersForContext(ralphContext);
  const visibleSectionCount = [showInteractive, showRalph].filter(Boolean).length;

  return (
    <>
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
                    onClick={() => onInteractiveLaunch(provider)}
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
                    onClick={() => onRalphLaunch(provider)}
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

      {exportAction && (
        <div className="border-t border-[var(--border-primary)] p-3">{exportAction}</div>
      )}
    </>
  );
}
