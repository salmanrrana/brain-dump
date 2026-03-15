"use client";

import { memo } from "react";
import { DollarSign, Loader2, AlertCircle } from "lucide-react";
import { useEpicCost } from "../../lib/hooks/cost";

interface EpicCostPanelProps {
  epicId: string;
}

function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

const TicketRow = memo(function TicketRow({ title, costUsd }: { title: string; costUsd: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      <span className="text-xs text-[var(--text-primary)] truncate min-w-0 mr-3">{title}</span>
      <span className="text-xs font-medium text-[var(--text-primary)] flex-shrink-0">
        {formatUsd(costUsd)}
      </span>
    </div>
  );
});

export function EpicCostPanel({ epicId }: EpicCostPanelProps) {
  const { data: costData, isLoading, error } = useEpicCost(epicId);

  if (isLoading) {
    return (
      <div className="p-4 border border-[var(--border-subtle)] rounded-lg">
        <div
          className="flex items-center gap-2 text-[var(--text-secondary)]"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading cost data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-[var(--border-subtle)] rounded-lg">
        <div className="flex items-center gap-2 text-[var(--error)]" role="alert">
          <AlertCircle className="w-4 h-4" aria-hidden="true" />
          <span className="text-sm">Failed to load cost data</span>
        </div>
      </div>
    );
  }

  if (!costData || costData.byTicket.length === 0) {
    return (
      <div className="p-4 border border-[var(--border-subtle)] rounded-lg">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <DollarSign className="w-4 h-4" aria-hidden="true" />
          <span className="text-sm">No cost data recorded for this epic yet.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[var(--success)]" aria-hidden="true" />
          <span className="text-sm font-medium text-[var(--text-primary)]">Epic Cost</span>
        </div>
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {formatUsd(costData.totalCostUsd)}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* Token summary */}
        <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
          <span>{formatTokenCount(costData.totalInputTokens)} input tokens</span>
          <span>{formatTokenCount(costData.totalOutputTokens)} output tokens</span>
          {costData.ticketCount > 0 && (
            <span>
              {costData.ticketCount} ticket{costData.ticketCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Per-ticket cost breakdown */}
        <div>
          <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            Cost by Ticket
          </h4>
          <div role="list" aria-label="Cost breakdown by ticket">
            {costData.byTicket.map((entry) => (
              <div key={entry.ticketId} role="listitem">
                <TicketRow title={entry.title} costUsd={entry.costUsd} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EpicCostPanel;
