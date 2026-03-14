"use client";

import { useState, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Clock,
  Wrench,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Monitor,
  Zap,
} from "lucide-react";
import {
  getTelemetryStats,
  getLatestTelemetrySession,
  type ParsedTelemetryEvent,
  type TelemetryStatsResult,
  type TelemetrySessionResult,
  type TelemetrySessionWithEvents,
  type TelemetryStatsAvailable,
  type TelemetryUnavailableState,
} from "../api/telemetry";
import { queryKeys } from "../lib/hooks";

interface TelemetryPanelProps {
  ticketId: string;
}

/** Style mapping for event types - visual distinction helps users scan the timeline */
const EVENT_TYPE_STYLES: Record<string, { icon: typeof Activity; color: string }> = {
  session_start: { icon: Activity, color: "text-[var(--success)]" },
  session_end: { icon: Activity, color: "text-[var(--text-secondary)]" },
  prompt: { icon: MessageSquare, color: "text-[var(--accent-ai)]" },
  mcp_call: { icon: Wrench, color: "text-[var(--accent-ai)]" },
  tool_start: { icon: Wrench, color: "text-[var(--warning)]" },
  tool_end: { icon: Wrench, color: "text-[var(--success)]" },
  context_loaded: { icon: Activity, color: "text-[var(--info)]" },
  error: { icon: AlertCircle, color: "text-[var(--error)]" },
};

/** Merged representation of a start/end event pair */
interface MergedTelemetryEvent {
  id: string;
  eventType: string;
  toolName: string | null;
  action: string | null;
  durationMs: number | null;
  success: boolean | undefined;
  isError: boolean;
  createdAt: string;
  errorMessage: string | undefined;
  message: string | undefined;
}

/**
 * Merge start/end event pairs by correlation_id into single rows.
 * Non-mcp_call events pass through as-is.
 */
function mergeStartEndEvents(events: ParsedTelemetryEvent[]): MergedTelemetryEvent[] {
  const correlationMap = new Map<string, ParsedTelemetryEvent[]>();
  const merged: MergedTelemetryEvent[] = [];

  for (const event of events) {
    if (event.correlationId && event.eventType === "mcp_call") {
      const group = correlationMap.get(event.correlationId) || [];
      group.push(event);
      correlationMap.set(event.correlationId, group);
    } else {
      const eventData = event.eventData || {};
      merged.push({
        id: event.id,
        eventType: event.eventType,
        toolName: event.toolName,
        action: null,
        durationMs: event.durationMs,
        success: undefined,
        isError: event.isError || false,
        createdAt: event.createdAt,
        errorMessage: eventData.error as string | undefined,
        message: eventData.message as string | undefined,
      });
    }
  }

  for (const [, group] of correlationMap) {
    const startEvent = group.find(
      (e) => (e.eventData as Record<string, unknown>)?.phase === "start"
    );
    const endEvent = group.find((e) => (e.eventData as Record<string, unknown>)?.phase === "end");
    const base = startEvent || group[0]!;
    const startData = startEvent?.eventData || {};
    const endData = endEvent?.eventData || {};
    const params = startData.params as Record<string, unknown> | undefined;

    merged.push({
      id: base.id,
      eventType: "mcp_call",
      toolName: base.toolName || (startData.toolName as string) || null,
      action: (params?.action as string) || null,
      durationMs: endEvent?.durationMs || null,
      success: endData.success as boolean | undefined,
      isError: group.some((e) => e.isError),
      createdAt: base.createdAt,
      errorMessage: (endData.error as string) || undefined,
      message: (startData.message as string) || undefined,
    });
  }

  merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return merged;
}

/** Format milliseconds as human-readable duration (e.g., "2m 30s") */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** Format ISO timestamp as localized time (e.g., "10:30:45 AM") */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function OutcomeIcon({ outcome }: { outcome: string | null }) {
  if (outcome === "success") {
    return <CheckCircle className="w-4 h-4 text-[var(--success)]" aria-label="Success" />;
  }
  if (outcome === "failure") {
    return <XCircle className="w-4 h-4 text-[var(--error)]" aria-label="Failed" />;
  }
  if (outcome === "timeout" || outcome === "cancelled") {
    return (
      <AlertCircle className="w-4 h-4 text-[var(--warning)]" aria-label="Cancelled or timed out" />
    );
  }
  return <Clock className="w-4 h-4 text-[var(--text-secondary)]" aria-label="In progress" />;
}

function TelemetryUnavailableNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-4 border border-[var(--warning)]/40 bg-[var(--warning)]/10 rounded-lg">
      <div className="flex items-start gap-2" role="alert">
        <AlertCircle className="w-4 h-4 text-[var(--warning)] mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{message}</p>
        </div>
      </div>
    </div>
  );
}

/** Memoized event item - renders a merged start/end pair as a single row */
const EventItem = memo(function EventItem({ event }: { event: MergedTelemetryEvent }) {
  const style = EVENT_TYPE_STYLES[event.eventType] || {
    icon: Activity,
    color: "text-[var(--text-secondary)]",
  };
  const Icon = style.icon;

  const displayLabel =
    event.toolName && event.action
      ? `${event.toolName}.${event.action}`
      : event.toolName || event.eventType.replace(/_/g, " ");

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${style.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-primary)]">{displayLabel}</span>
          {event.durationMs != null && (
            <span className="text-xs text-[var(--text-muted)]">
              {formatDuration(event.durationMs)}
            </span>
          )}
          {event.success !== undefined && (
            <span
              className={event.success ? "text-[var(--success)]" : "text-[var(--error)]"}
              aria-label={event.success ? "Succeeded" : "Failed"}
            >
              {event.success ? "✓" : "✗"}
            </span>
          )}
        </div>
        {event.message && (
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{event.message}</p>
        )}
        {(event.isError || event.success === false) && event.errorMessage && (
          <p className="text-xs text-[var(--error)] mt-0.5 truncate" role="alert">
            {event.errorMessage}
          </p>
        )}
      </div>
      <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
        {formatTimestamp(event.createdAt)}
      </span>
    </div>
  );
});

/** Memoized stats card - prevents re-renders when parent expands/collapses */
const StatsCard = memo(function StatsCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Activity;
}) {
  return (
    <div className="flex items-center gap-2 p-2 bg-[var(--bg-tertiary)] rounded">
      <Icon className="w-4 h-4 text-[var(--text-secondary)]" aria-hidden="true" />
      <div>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <p className="text-sm font-medium text-[var(--text-primary)]">{value}</p>
      </div>
    </div>
  );
});

function EventTimeline({
  isLoading,
  error,
  sessionResult,
}: {
  isLoading: boolean;
  error: Error | null;
  sessionResult: TelemetrySessionResult | undefined;
}) {
  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 text-[var(--text-secondary)] p-2"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        <span className="text-xs">Loading events...</span>
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-[var(--error)] p-2" role="alert">
        Failed to load events: {error.message || "Unknown error"}
      </p>
    );
  }

  if (!sessionResult) {
    return <p className="text-xs text-[var(--text-muted)] p-2">No session data available</p>;
  }

  if (sessionResult.status === "unavailable") {
    return (
      <p className="text-xs text-[var(--warning)] p-2" role="alert">
        {sessionResult.message}
      </p>
    );
  }

  const session: TelemetrySessionWithEvents | null = sessionResult.session;
  if (!session) {
    return <p className="text-xs text-[var(--text-muted)] p-2">No session data available</p>;
  }

  if (session.events.length === 0) {
    return <p className="text-xs text-[var(--text-muted)] p-2">No events recorded</p>;
  }

  const mergedEvents = mergeStartEndEvents(session.events);

  return (
    <div>
      <p className="text-xs text-[var(--text-muted)] mb-2">
        Latest session - {mergedEvents.length} calls
      </p>
      {mergedEvents.map((event) => (
        <EventItem key={event.id} event={event} />
      ))}
    </div>
  );
}

export function TelemetryPanel({ ticketId }: TelemetryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery<TelemetryStatsResult, Error>({
    queryKey: queryKeys.telemetry.stats(ticketId),
    queryFn: () => getTelemetryStats({ data: ticketId }),
    staleTime: 30000,
  });

  const {
    data: latestSession,
    isLoading: sessionLoading,
    error: sessionError,
  } = useQuery<TelemetrySessionResult, Error>({
    queryKey: queryKeys.telemetry.latestSession(ticketId),
    queryFn: () => getLatestTelemetrySession({ data: ticketId }),
    enabled: isExpanded,
    staleTime: 30000,
  });

  const availableStats: TelemetryStatsAvailable | null =
    stats && stats.status === "available" ? stats : null;
  const statsUnavailable: TelemetryUnavailableState | null =
    stats && stats.status === "unavailable" ? stats : null;

  if (statsLoading) {
    return (
      <div className="p-4 border border-[var(--border-subtle)] rounded-lg">
        <div
          className="flex items-center gap-2 text-[var(--text-secondary)]"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading telemetry...</span>
        </div>
      </div>
    );
  }

  // Show error state instead of silently failing
  if (statsError) {
    return (
      <div className="p-4 border border-[var(--border-subtle)] rounded-lg">
        <div className="flex items-center gap-2 text-[var(--error)]" role="alert">
          <AlertCircle className="w-4 h-4" aria-hidden="true" />
          <span className="text-sm">Failed to load telemetry data</span>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  if (statsUnavailable) {
    return (
      <TelemetryUnavailableNotice
        title="Telemetry unavailable"
        message={statsUnavailable.message}
      />
    );
  }

  if (!availableStats || availableStats.totalSessions === 0) {
    return (
      <div className="p-4 border border-[var(--border-subtle)] rounded-lg">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <Activity className="w-4 h-4" aria-hidden="true" />
          <span className="text-sm">No AI telemetry recorded for this ticket yet.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        aria-expanded={isExpanded}
        aria-controls="telemetry-content"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--accent-ai)]" aria-hidden="true" />
          <span className="text-sm font-medium text-[var(--text-primary)]">AI Telemetry</span>
          <span
            className="text-xs px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]"
            aria-live="polite"
          >
            {availableStats.totalSessions} session{availableStats.totalSessions !== 1 ? "s" : ""}
          </span>
          {availableStats.latestSession?.environment &&
            availableStats.latestSession.environment !== "unknown" && (
              <span className="text-xs px-1.5 py-0.5 bg-[var(--accent-ai)]/15 rounded text-[var(--accent-ai)]">
                <Monitor className="w-3 h-3 inline-block mr-0.5" aria-hidden="true" />
                {availableStats.latestSession.environment}
              </span>
            )}
          {availableStats.latestSession?.totalTokens != null &&
            availableStats.latestSession.totalTokens > 0 && (
              <span className="text-xs px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-muted)]">
                <Zap className="w-3 h-3 inline-block mr-0.5" aria-hidden="true" />
                {availableStats.latestSession.totalTokens.toLocaleString()} tokens
              </span>
            )}
          {availableStats.errorCount > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 bg-[var(--error)]/15 rounded text-[var(--error)]"
              aria-label={`${availableStats.errorCount} error${availableStats.errorCount !== 1 ? "s" : ""}`}
            >
              <AlertCircle className="w-3 h-3 inline-block mr-0.5" aria-hidden="true" />
              {availableStats.errorCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {availableStats.latestSession && (
            <div className="flex items-center gap-1.5">
              <OutcomeIcon outcome={availableStats.latestSession.outcome} />
              <span className="text-xs text-[var(--text-secondary)]">
                {formatDuration(availableStats.latestSession.totalDurationMs || 0)}
              </span>
            </div>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" aria-hidden="true" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div id="telemetry-content" className="p-3 space-y-4">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Telemetry statistics">
            <StatsCard label="Prompts" value={availableStats.totalPrompts} icon={MessageSquare} />
            <StatsCard label="Tool Calls" value={availableStats.totalToolCalls} icon={Wrench} />
            <StatsCard
              label="Total Time"
              value={formatDuration(availableStats.totalDurationMs)}
              icon={Clock}
            />
            <StatsCard
              label="Success Rate"
              value={`${availableStats.successRate.toFixed(0)}%`}
              icon={CheckCircle}
            />
          </div>

          {availableStats.mostUsedTools.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                Most Used Tools
              </h4>
              <div className="flex flex-wrap gap-1" role="list" aria-label="Most used tools">
                {availableStats.mostUsedTools.slice(0, 5).map(({ toolName, count }) => (
                  <span
                    key={toolName}
                    role="listitem"
                    className="text-xs px-2 py-1 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]"
                  >
                    {toolName.replace("mcp__brain-dump__", "")} ({count})
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className="flex items-center gap-1 text-xs text-[var(--accent-ai)] hover:underline"
              aria-expanded={showTimeline}
              aria-controls="event-timeline"
            >
              {showTimeline ? "Hide" : "Show"} Event Timeline
              {showTimeline ? (
                <ChevronDown className="w-3 h-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-3 h-3" aria-hidden="true" />
              )}
            </button>

            {showTimeline && (
              <div
                id="event-timeline"
                className="mt-2 max-h-64 overflow-y-auto border border-[var(--border-subtle)] rounded p-2"
              >
                <EventTimeline
                  isLoading={sessionLoading}
                  error={sessionError}
                  sessionResult={latestSession}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TelemetryPanel;
