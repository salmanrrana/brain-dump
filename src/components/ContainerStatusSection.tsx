/**
 * Container Status Sidebar Section
 *
 * Displays running companion containers (dev servers) with real-time status.
 * Shows containers from the selected project's .ralph-services.json file.
 *
 * Features:
 * - Collapsible section with smooth animation
 * - Running count in header when collapsed
 * - Status indicators (running/stopped/starting/error)
 * - Copy connection string with visual feedback
 * - 5s polling for real-time updates
 *
 * @see src/lib/service-discovery.ts for service types
 */

import { useState, useCallback, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  Play,
  Square,
  Terminal,
} from "lucide-react";
import {
  useProjectServices,
  useStartService,
  useStopService,
  useStopAllServices,
  useRalphContainers,
  useAutoClearState,
} from "../lib/hooks";
import type { RalphService, ServiceStatus } from "../lib/service-discovery";
import { useToast } from "./Toast";
import ContainerLogsModal from "./ContainerLogsModal";

interface ContainerStatusSectionProps {
  /** Path to the selected project (null if none selected) */
  projectPath: string | null;
}

/**
 * Get status indicator styles and label.
 */
function getStatusIndicator(status: ServiceStatus): {
  color: string;
  pulseClass: string;
  label: string;
} {
  switch (status) {
    case "running":
      return {
        color: "bg-green-500",
        pulseClass: "animate-pulse",
        label: "Running",
      };
    case "starting":
      return {
        color: "bg-amber-500",
        pulseClass: "animate-pulse",
        label: "Starting",
      };
    case "stopped":
      return {
        color: "bg-slate-500",
        pulseClass: "",
        label: "Stopped",
      };
    case "error":
      return {
        color: "bg-red-500",
        pulseClass: "",
        label: "Error",
      };
  }
}

/** Service types that use HTTP protocol */
const HTTP_SERVICE_TYPES = new Set(["frontend", "backend", "storybook", "docs"]);

/**
 * Get connection string for a service based on its type.
 */
function getConnectionString(service: RalphService): string | null {
  const host = "localhost";
  const port = service.port;

  // Only web services get http:// prefix
  if (HTTP_SERVICE_TYPES.has(service.type)) {
    return `http://${host}:${port}`;
  }

  // Database and other services just get host:port
  return `${host}:${port}`;
}

/**
 * Individual container row component.
 */
function ContainerRow({
  service,
  onCopy,
  isCopied,
  onStart,
  onStop,
  isLoading,
}: {
  service: RalphService;
  onCopy: (text: string) => void;
  isCopied: boolean;
  onStart: () => void;
  onStop: () => void;
  isLoading: boolean;
}) {
  const { color, pulseClass, label } = getStatusIndicator(service.status);
  const connectionString = getConnectionString(service);
  const isRunning = service.status === "running";
  const isStopped = service.status === "stopped";

  return (
    <div className="py-2 px-2 hover:bg-slate-800/50 rounded transition-colors">
      {/* Top row: status + name + action buttons */}
      <div className="flex items-center gap-2">
        {/* Status indicator */}
        <span
          className={`w-2 h-2 rounded-full ${color} ${pulseClass}`}
          title={label}
          aria-label={label}
        />

        {/* Service name */}
        <span className="text-sm text-gray-100 flex-1 truncate" title={service.name}>
          {service.name}
        </span>

        {/* Port (for running services) */}
        {isRunning && <span className="text-xs text-slate-400">:{service.port}</span>}

        {/* Action buttons */}
        {isLoading ? (
          <Loader2
            size={14}
            className="animate-spin text-slate-400"
            aria-label="Loading"
            aria-busy="true"
          />
        ) : isRunning ? (
          <button
            onClick={onStop}
            className="p-1 hover:bg-red-900/50 rounded transition-colors text-red-400 hover:text-red-300"
            title={`Stop ${service.name}`}
            aria-label={`Stop ${service.name}`}
          >
            <Square size={12} />
          </button>
        ) : isStopped ? (
          <button
            onClick={onStart}
            className="p-1 hover:bg-green-900/50 rounded transition-colors text-green-400 hover:text-green-300"
            title={`Start ${service.name}`}
            aria-label={`Start ${service.name}`}
          >
            <Play size={12} />
          </button>
        ) : null}
      </div>

      {/* Bottom row: connection string + copy button (only for running services) */}
      {isRunning && connectionString && (
        <div className="flex items-center gap-2 mt-1 ml-4">
          <span className="text-xs text-slate-500 truncate flex-1" title={connectionString}>
            {connectionString}
          </span>
          <button
            onClick={() => onCopy(connectionString)}
            className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-gray-100"
            title={isCopied ? "Copied!" : "Copy connection string"}
            aria-label={isCopied ? "Copied" : "Copy connection string"}
          >
            {isCopied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ContainerStatusSection({ projectPath }: ContainerStatusSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copiedId, setCopiedId] = useAutoClearState<string>(2000); // Clear after 2s
  const [loadingServiceId, setLoadingServiceId] = useState<string | null>(null);
  const [stopAllConfirming, setStopAllConfirming] = useState(false);
  const [stopAllLoading, setStopAllLoading] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const { showToast } = useToast();

  // Fetch services with 5s polling
  const { services, runningServices, loading, error } = useProjectServices(projectPath, {
    enabled: Boolean(projectPath),
    pollingInterval: 5000, // 5 seconds
  });

  // Fetch Ralph containers (Docker sandbox mode)
  const { runningContainer: ralphContainer, hasRunningContainer: hasRalphContainer } =
    useRalphContainers({
      enabled: Boolean(projectPath),
      pollingInterval: 3000,
    });

  // Mutation hooks for start/stop
  const startServiceMutation = useStartService();
  const stopServiceMutation = useStopService();
  const stopAllServicesMutation = useStopAllServices();

  // Handle copy to clipboard
  const handleCopy = useCallback(
    async (text: string, serviceId: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(serviceId);
      } catch (err) {
        console.error("Failed to copy to clipboard:", err);
        showToast("error", "Failed to copy to clipboard");
      }
    },
    [setCopiedId, showToast]
  );

  // Handle starting a service
  const handleStartService = useCallback(
    async (service: RalphService) => {
      if (!projectPath) return;

      const serviceId = `${service.name}-${service.port}`;
      setLoadingServiceId(serviceId);

      try {
        await startServiceMutation.mutateAsync({
          projectPath,
          serviceName: service.name,
          servicePort: service.port,
        });
        showToast("success", `Started ${service.name}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start service";
        showToast("error", message);
      } finally {
        setLoadingServiceId(null);
      }
    },
    [projectPath, startServiceMutation, showToast]
  );

  // Handle stopping a service
  const handleStopService = useCallback(
    async (service: RalphService) => {
      if (!projectPath) return;

      const serviceId = `${service.name}-${service.port}`;
      setLoadingServiceId(serviceId);

      try {
        await stopServiceMutation.mutateAsync({
          projectPath,
          serviceName: service.name,
          servicePort: service.port,
        });
        showToast("success", `Stopped ${service.name}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to stop service";
        showToast("error", message);
      } finally {
        setLoadingServiceId(null);
      }
    },
    [projectPath, stopServiceMutation, showToast]
  );

  // Handle stopping all services
  const handleStopAll = useCallback(async () => {
    if (!projectPath) return;

    setStopAllLoading(true);

    try {
      const result = await stopAllServicesMutation.mutateAsync({ projectPath });
      const count = result.stoppedCount;
      showToast("success", `Stopped ${count} container${count === 1 ? "" : "s"}`);
      setStopAllConfirming(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stop containers";
      showToast("error", message);
    } finally {
      setStopAllLoading(false);
    }
  }, [projectPath, stopAllServicesMutation, showToast]);

  // Handle escape key to cancel confirmation
  useEffect(() => {
    if (!stopAllConfirming) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStopAllConfirming(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [stopAllConfirming]);

  // Don't render if no project selected or no content to show
  if (!projectPath || (services.length === 0 && !loading && !hasRalphContainer)) {
    return null;
  }

  const runningCount = runningServices.length + (hasRalphContainer ? 1 : 0);
  const hasServices = services.length > 0 || hasRalphContainer;

  return (
    <div className="mt-6">
      {/* Header */}
      <div className="flex items-center justify-between w-full mb-2">
        {/* Left side: title (clickable to expand/collapse) */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 group"
          aria-expanded={isExpanded}
          aria-controls="container-status-list"
        >
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Containers
          </h2>
          {/* Expand/collapse icon */}
          <span className="text-slate-400 group-hover:text-gray-100 transition-colors">
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {/* Right side: Stop All + count */}
        <div className="flex items-center gap-2">
          {/* Stop All button/confirmation */}
          {runningCount > 0 && (
            <>
              {stopAllConfirming ? (
                <div
                  className="flex items-center gap-1 text-xs"
                  role="alertdialog"
                  aria-label="Confirmation required"
                >
                  {stopAllLoading ? (
                    <span className="text-slate-400 flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" />
                      Stopping...
                    </span>
                  ) : (
                    <>
                      <span className="text-slate-300">Stop all?</span>
                      <button
                        onClick={handleStopAll}
                        className="px-1.5 py-0.5 bg-red-900/50 hover:bg-red-900/70 text-red-300 rounded transition-colors"
                        aria-label="Confirm stop all containers"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setStopAllConfirming(false)}
                        className="px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                        aria-label="Cancel"
                      >
                        No
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setStopAllConfirming(true)}
                  className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/50 px-1.5 py-0.5 rounded transition-colors"
                  aria-label="Stop all running containers"
                >
                  Stop All
                </button>
              )}
            </>
          )}

          {/* Running count badge */}
          {runningCount > 0 && (
            <span className="text-xs bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded">
              {runningCount}
            </span>
          )}
        </div>
      </div>

      {/* Content with animation */}
      <div
        id="container-status-list"
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
        role="list"
        aria-live="polite"
      >
        {/* Loading state */}
        {loading && !hasServices && (
          <div className="flex items-center gap-2 py-2 text-slate-400">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Loading services...</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 py-2 text-amber-400" role="alert">
            <AlertTriangle size={14} />
            <span className="text-xs">{error}</span>
          </div>
        )}

        {/* Empty state (project has no services) */}
        {!loading && !error && services.length === 0 && !hasRalphContainer && (
          <div className="text-xs text-slate-500 py-2">No containers configured</div>
        )}

        {/* Service/container list */}
        {hasServices && (
          <div className="space-y-0.5">
            {/* Ralph container (Docker sandbox mode) */}
            {hasRalphContainer && ralphContainer && (
              <button
                onClick={() => setLogsModalOpen(true)}
                className="w-full py-2 px-2 hover:bg-slate-800/50 rounded transition-colors text-left"
                title="Click to view logs"
              >
                <div className="flex items-center gap-2">
                  {/* Status indicator */}
                  <span
                    className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"
                    title="Running"
                    aria-label="Running"
                  />

                  {/* Container name with terminal icon */}
                  <Terminal size={14} className="text-cyan-400" />
                  <span className="text-sm text-gray-100 flex-1 truncate">Ralph (Docker)</span>

                  {/* View logs hint */}
                  <span className="text-xs text-slate-500">View logs</span>
                </div>

                {/* Project origin info - show which project/epic started this container */}
                {ralphContainer.projectName && (
                  <div className="ml-6 mt-1 text-xs text-slate-500 truncate">
                    Started by: <span className="text-slate-400">{ralphContainer.projectName}</span>
                    {ralphContainer.epicTitle && (
                      <span className="text-slate-500"> ({ralphContainer.epicTitle})</span>
                    )}
                  </div>
                )}
                {/* Containers without labels show "Unknown" origin */}
                {!ralphContainer.projectName && (
                  <div className="ml-6 mt-1 text-xs text-slate-500">Started by: Unknown</div>
                )}
              </button>
            )}

            {/* Service containers */}
            {services.map((service) => {
              const serviceId = `${service.name}-${service.port}`;
              return (
                <ContainerRow
                  key={serviceId}
                  service={service}
                  onCopy={(text) => handleCopy(text, serviceId)}
                  isCopied={copiedId === serviceId}
                  onStart={() => handleStartService(service)}
                  onStop={() => handleStopService(service)}
                  isLoading={loadingServiceId === serviceId}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Container Logs Modal */}
      <ContainerLogsModal
        isOpen={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
        containerName={ralphContainer?.name ?? null}
      />
    </div>
  );
}
