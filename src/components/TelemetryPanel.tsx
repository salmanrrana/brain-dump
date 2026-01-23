"use client";

import { useState } from "react";
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
} from "lucide-react";
import {
  getTelemetryStats,
  getLatestTelemetrySession,
  type ParsedTelemetryEvent,
  type TelemetrySessionWithEvents,
} from "../api/telemetry";

interface TelemetryPanelProps {
  ticketId: string;
}

// Query keys for telemetry data
const telemetryQueryKeys = {
  stats: (ticketId: string) => ["telemetry", "stats", ticketId] as const,
  latestSession: (ticketId: string) => ["telemetry", "latestSession", ticketId] as const,
};

// Event type icons and colors
const EVENT_TYPE_STYLES: Record<string, { icon: typeof Activity; color: string }> = {
  session_start: { icon: Activity, color: "text-[var(--success)]" },
  session_end: { icon: Activity, color: "text-[var(--text-secondary)]" },
  prompt: { icon: MessageSquare, color: "text-[var(--accent-ai)]" },
  tool_start: { icon: Wrench, color: "text-[var(--warning)]" },
  tool_end: { icon: Wrench, color: "text-[var(--success)]" },
  context_loaded: { icon: Activity, color: "text-[var(--info)]" },
  error: { icon: AlertCircle, color: "text-[var(--error)]" },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

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
    return <CheckCircle className="w-4 h-4 text-[var(--success)]" />;
  }
  if (outcome === "failure") {
    return <XCircle className="w-4 h-4 text-[var(--error)]" />;
  }
  if (outcome === "timeout" || outcome === "cancelled") {
    return <AlertCircle className="w-4 h-4 text-[var(--warning)]" />;
  }
  return <Clock className="w-4 h-4 text-[var(--text-secondary)]" />;
}

function EventItem({ event }: { event: ParsedTelemetryEvent }) {
  const style = EVENT_TYPE_STYLES[event.eventType] || {
    icon: Activity,
    color: "text-[var(--text-secondary)]",
  };
  const Icon = style.icon;

  const eventData = event.eventData || {};
  const toolName = event.toolName || (eventData.toolName as string);
  const message = eventData.message as string | undefined;
  const promptLength = eventData.promptLength as number | undefined;
  const success = eventData.success as boolean | undefined;

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${style.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-primary)]">
            {event.eventType.replace(/_/g, " ")}
          </span>
          {toolName && (
            <span className="text-xs px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]">
              {toolName}
            </span>
          )}
          {event.durationMs && (
            <span className="text-xs text-[var(--text-muted)]">
              {formatDuration(event.durationMs)}
            </span>
          )}
          {success !== undefined && (
            <span className={success ? "text-[var(--success)]" : "text-[var(--error)]"}>
              {success ? "✓" : "✗"}
            </span>
          )}
        </div>
        {message && (
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{message}</p>
        )}
        {promptLength && (
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {promptLength.toLocaleString()} chars
          </p>
        )}
      </div>
      <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
        {formatTimestamp(event.createdAt)}
      </span>
    </div>
  );
}

function StatsCard({
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
      <Icon className="w-4 h-4 text-[var(--text-secondary)]" />
      <div>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <p className="text-sm font-medium text-[var(--text-primary)]">{value}</p>
      </div>
    </div>
  );
}

function EventTimeline({
  isLoading,
  error,
  session,
}: {
  isLoading: boolean;
  error: Error | null;
  session: TelemetrySessionWithEvents | null;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[var(--text-secondary)] p-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span className="text-xs">Loading events...</span>
      </div>
    );
  }

  if (error || !session) {
    return <p className="text-xs text-[var(--text-muted)] p-2">Failed to load events</p>;
  }

  if (session.events.length === 0) {
    return <p className="text-xs text-[var(--text-muted)] p-2">No events recorded</p>;
  }

  return (
    <div>
      <p className="text-xs text-[var(--text-muted)] mb-2">
        Latest session - {session.eventCount} events
      </p>
      {session.events.map((event: ParsedTelemetryEvent) => (
        <EventItem key={event.id} event={event} />
      ))}
    </div>
  );
}

export function TelemetryPanel({ ticketId }: TelemetryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  // Fetch telemetry stats
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: telemetryQueryKeys.stats(ticketId),
    queryFn: () => getTelemetryStats({ data: ticketId }),
    staleTime: 30000, // 30 seconds
  });

  // Fetch latest session with events (only when expanded)
  const {
    data: latestSession,
    isLoading: sessionLoading,
    error: sessionError,
  } = useQuery({
    queryKey: telemetryQueryKeys.latestSession(ticketId),
    queryFn: () => getLatestTelemetrySession({ data: ticketId }),
    enabled: isExpanded,
    staleTime: 30000,
  });

  if (statsLoading) {
    return (
      <div className="p-4 border border-[var(--border-subtle)] rounded-lg">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading telemetry...</span>
        </div>
      </div>
    );
  }

  if (statsError || !stats) {
    return null; // Silently fail if telemetry not available
  }

  if (stats.totalSessions === 0) {
    return (
      <div className="p-4 border border-[var(--border-subtle)] rounded-lg">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <Activity className="w-4 h-4" />
          <span className="text-sm">No AI telemetry recorded for this ticket yet.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--accent-ai)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">AI Telemetry</span>
          <span className="text-xs px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]">
            {stats.totalSessions} session{stats.totalSessions !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {stats.latestSession && (
            <div className="flex items-center gap-1.5">
              <OutcomeIcon outcome={stats.latestSession.outcome} />
              <span className="text-xs text-[var(--text-secondary)]">
                {formatDuration(stats.latestSession.totalDurationMs || 0)}
              </span>
            </div>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3 space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2">
            <StatsCard label="Prompts" value={stats.totalPrompts} icon={MessageSquare} />
            <StatsCard label="Tool Calls" value={stats.totalToolCalls} icon={Wrench} />
            <StatsCard
              label="Total Time"
              value={formatDuration(stats.totalDurationMs)}
              icon={Clock}
            />
            <StatsCard
              label="Success Rate"
              value={`${stats.successRate.toFixed(0)}%`}
              icon={CheckCircle}
            />
          </div>

          {/* Most Used Tools */}
          {stats.mostUsedTools.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                Most Used Tools
              </h4>
              <div className="flex flex-wrap gap-1">
                {stats.mostUsedTools.slice(0, 5).map(({ toolName, count }) => (
                  <span
                    key={toolName}
                    className="text-xs px-2 py-1 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]"
                  >
                    {toolName.replace("mcp__brain-dump__", "")} ({count})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Timeline Toggle */}
          <div>
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className="flex items-center gap-1 text-xs text-[var(--accent-ai)] hover:underline"
            >
              {showTimeline ? "Hide" : "Show"} Event Timeline
              {showTimeline ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>

            {/* Event Timeline */}
            {showTimeline && (
              <div className="mt-2 max-h-64 overflow-y-auto border border-[var(--border-subtle)] rounded p-2">
                <EventTimeline
                  isLoading={sessionLoading}
                  error={sessionError}
                  session={latestSession ?? null}
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
