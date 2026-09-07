import { type FC, useCallback, useState } from "react";
import type { TicketStatus } from "../../api/tickets";
import type {
  RalphAutonomousUiLaunchProvider,
  UiLaunchProviderId,
} from "../../lib/launch-provider-contract";
import type { LaunchModelSelection } from "../../lib/launch-model-catalog";
import { useCostModels, useLaunchProviderAvailability } from "../../lib/hooks";
import { LaunchProviderMenu } from "../LaunchProviderMenu";
import { TICKET_STATUS_METADATA } from "../../../core/workflow-steps.ts";

export type LaunchType = UiLaunchProviderId;

export interface LaunchActionsProps {
  /** Current ticket status - used to determine if launch actions should be shown */
  ticketStatus: TicketStatus;
  /** Handler called when a launch option is selected */
  onLaunch: (
    type: LaunchType,
    modelSelection: LaunchModelSelection,
    reviewerProvider?: RalphAutonomousUiLaunchProvider,
    reviewerModelSelection?: LaunchModelSelection
  ) => void | Promise<void>;
  /** Whether a launch is currently in progress */
  isLaunching?: boolean;
  /** Which launch type is currently in progress (for loading indicator) */
  launchingType?: LaunchType | null;
  /** Whether the component is disabled */
  disabled?: boolean;
}

export const LaunchActions: FC<LaunchActionsProps> = ({
  ticketStatus,
  onLaunch,
  isLaunching = false,
  launchingType = null,
  disabled = false,
}) => {
  const [clickedType, setClickedType] = useState<LaunchType | null>(null);
  const [availabilityEnabled, setAvailabilityEnabled] = useState(false);
  const isWorkable = TICKET_STATUS_METADATA[ticketStatus].workable;
  const {
    data: costModels,
    isLoading: modelCatalogLoading,
    error: modelCatalogError,
  } = useCostModels();
  const {
    availabilityByProviderId,
    loading: availabilityLoading,
    error: availabilityError,
  } = useLaunchProviderAvailability({ enabled: availabilityEnabled && isWorkable });

  const handleOptionClick = useCallback(
    (
      type: LaunchType,
      modelSelection: LaunchModelSelection,
      reviewerProvider?: RalphAutonomousUiLaunchProvider,
      reviewerModelSelection?: LaunchModelSelection
    ) => {
      if (disabled || isLaunching) return;
      setClickedType(type);
      void onLaunch(type, modelSelection, reviewerProvider, reviewerModelSelection);
    },
    [disabled, isLaunching, onLaunch]
  );

  if (!isWorkable) {
    return null;
  }

  return (
    <div style={containerStyles}>
      <h3 style={headerStyles}>Start Work With</h3>

      <div
        className="overflow-hidden rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)]"
        onFocusCapture={() => setAvailabilityEnabled(true)}
        onPointerEnter={() => setAvailabilityEnabled(true)}
      >
        <LaunchProviderMenu
          interactiveContext="ticket"
          ralphContext="ticket"
          onInteractiveLaunch={(provider, modelSelection) =>
            handleOptionClick(provider.id, modelSelection)
          }
          onRalphLaunch={(provider, modelSelection, reviewerProvider, reviewerModelSelection) =>
            handleOptionClick(provider.id, modelSelection, reviewerProvider, reviewerModelSelection)
          }
          disabled={disabled || isLaunching}
          loadingProviderId={isLaunching ? (launchingType ?? clickedType) : null}
          costModels={costModels ?? []}
          modelCatalogLoading={modelCatalogLoading}
          modelCatalogError={modelCatalogError}
          availabilityByProviderId={availabilityByProviderId}
          availabilityLoading={availabilityLoading}
          availabilityError={availabilityError}
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
