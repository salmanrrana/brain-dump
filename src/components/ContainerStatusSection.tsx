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

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Copy, Check, AlertTriangle, Loader2 } from "lucide-react";
import { useProjectServices } from "../lib/hooks";
import type { RalphService, ServiceStatus } from "../lib/service-discovery";
import { useAutoClearState } from "../lib/hooks";

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

/**
 * Get connection string for a service based on its type.
 */
function getConnectionString(service: RalphService): string | null {
  const host = "localhost";
  const port = service.port;

  switch (service.type) {
    case "frontend":
    case "backend":
    case "storybook":
    case "docs":
      return `http://${host}:${port}`;
    case "database":
      // Database services might have specific connection formats
      // For now, just return the host:port
      return `${host}:${port}`;
    default:
      return `${host}:${port}`;
  }
}

/**
 * Individual container row component.
 */
function ContainerRow({
  service,
  onCopy,
  isCopied,
}: {
  service: RalphService;
  onCopy: (text: string) => void;
  isCopied: boolean;
}) {
  const { color, pulseClass, label } = getStatusIndicator(service.status);
  const connectionString = getConnectionString(service);

  return (
    <div className="py-2 px-2 hover:bg-slate-800/50 rounded transition-colors">
      {/* Top row: status + name + port */}
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

        {/* Port */}
        {service.status === "running" && (
          <span className="text-xs text-slate-400">:{service.port}</span>
        )}
      </div>

      {/* Bottom row: connection string + copy button (only for running services) */}
      {service.status === "running" && connectionString && (
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

  // Fetch services with 5s polling
  const { services, runningServices, loading, error } = useProjectServices(projectPath, {
    enabled: Boolean(projectPath),
    pollingInterval: 5000, // 5 seconds
  });

  // Handle copy to clipboard
  const handleCopy = useCallback(
    async (text: string, serviceId: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(serviceId);
      } catch (err) {
        console.error("Failed to copy to clipboard:", err);
      }
    },
    [setCopiedId]
  );

  // Don't render if no project selected or no services configured
  if (!projectPath || (services.length === 0 && !loading)) {
    return null;
  }

  const runningCount = runningServices.length;
  const hasServices = services.length > 0;

  return (
    <div className="mt-6">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full mb-2 group"
        aria-expanded={isExpanded}
        aria-controls="container-status-list"
      >
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Containers
        </h2>
        <div className="flex items-center gap-2">
          {/* Running count badge (always visible) */}
          {runningCount > 0 && (
            <span className="text-xs bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded">
              {runningCount}
            </span>
          )}
          {/* Expand/collapse icon */}
          <span className="text-slate-400 group-hover:text-gray-100 transition-colors">
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </button>

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
        {!loading && !error && services.length === 0 && (
          <div className="text-xs text-slate-500 py-2">No containers configured</div>
        )}

        {/* Service list */}
        {services.length > 0 && (
          <div className="space-y-0.5">
            {services.map((service) => (
              <ContainerRow
                key={`${service.name}-${service.port}`}
                service={service}
                onCopy={(text) => handleCopy(text, `${service.name}-${service.port}`)}
                isCopied={copiedId === `${service.name}-${service.port}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
