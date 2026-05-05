import { type FC, useCallback, useState } from "react";
import type { TicketStatus } from "../../api/tickets";
import type { UiLaunchProviderId } from "../../lib/launch-provider-contract";
import type { LaunchModelSelection } from "../../lib/launch-model-catalog";
import { useCostModels } from "../../lib/hooks";
import { LaunchProviderMenu } from "../LaunchProviderMenu";

export type LaunchType = UiLaunchProviderId;

export interface LaunchActionsProps {
  /** Current ticket status - used to determine if launch actions should be shown */
  ticketStatus: TicketStatus;
  /** Handler called when a launch option is selected */
  onLaunch: (type: LaunchType, modelSelection: LaunchModelSelection) => void | Promise<void>;
  /** Whether a launch is currently in progress */
  isLaunching?: boolean;
  /** Which launch type is currently in progress (for loading indicator) */
  launchingType?: LaunchType | null;
  /** Whether the component is disabled */
  disabled?: boolean;
}

const WORKABLE_STATUSES: TicketStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "ai_review",
  "human_review",
];

export const LaunchActions: FC<LaunchActionsProps> = ({
  ticketStatus,
  onLaunch,
  isLaunching = false,
  launchingType = null,
  disabled = false,
}) => {
  const [clickedType, setClickedType] = useState<LaunchType | null>(null);
  const {
    data: costModels,
    isLoading: modelCatalogLoading,
    error: modelCatalogError,
  } = useCostModels();
  const isWorkable = WORKABLE_STATUSES.includes(ticketStatus);

  const handleOptionClick = useCallback(
    (type: LaunchType, modelSelection: LaunchModelSelection) => {
      if (disabled || isLaunching) return;
      setClickedType(type);
      void onLaunch(type, modelSelection);
    },
    [disabled, isLaunching, onLaunch]
  );

  if (!isWorkable) {
    return null;
  }

  return (
    <div style={containerStyles}>
      <h3 style={headerStyles}>Start Work With</h3>

      <div className="overflow-hidden rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
        <LaunchProviderMenu
          interactiveContext="ticket"
          ralphContext="ticket"
          onInteractiveLaunch={(provider, modelSelection) =>
            handleOptionClick(provider.id, modelSelection)
          }
          onRalphLaunch={(provider, modelSelection) =>
            handleOptionClick(provider.id, modelSelection)
          }
          disabled={disabled || isLaunching}
          loadingProviderId={isLaunching ? (launchingType ?? clickedType) : null}
          costModels={costModels ?? []}
          modelCatalogLoading={modelCatalogLoading}
          modelCatalogError={modelCatalogError}
        />
      </div>
    </div>
  );
};

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const headerStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--tracking-wider)",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: "var(--spacing-2)",
};

export default LaunchActions;
