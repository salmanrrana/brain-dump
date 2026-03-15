"use client";

import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Loader2, AlertCircle } from "lucide-react";
import { getTicketCost } from "../../api/cost";
import type { TicketCostResult } from "../../../core/types.ts";
import { queryKeys } from "../../lib/query-keys";

interface TicketCostPanelProps {
  ticketId: string;
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

const ModelRow = memo(function ModelRow({
  model,
  costUsd,
  inputTokens,
  outputTokens,
}: {
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium text-[var(--text-primary)] truncate">{model}</span>
        <span className="text-xs text-[var(--text-muted)]">
          {formatTokenCount(inputTokens)} in / {formatTokenCount(outputTokens)} out
        </span>
      </div>
      <span className="text-xs font-medium text-[var(--text-primary)] flex-shrink-0 ml-3">
        {formatUsd(costUsd)}
      </span>
    </div>
  );
});

export function TicketCostPanel({ ticketId }: TicketCostPanelProps) {
  const {
    data: costData,
    isLoading,
    error,
  } = useQuery<TicketCostResult, Error>({
    queryKey: queryKeys.cost.ticketCost(ticketId),
    queryFn: () => getTicketCost({ data: ticketId }),
    staleTime: 30_000,
  });

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

  if (!costData || costData.totalCostUsd === 0) {
    return (
      <div className="p-4 border border-[var(--border-subtle)] rounded-lg">
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <DollarSign className="w-4 h-4" aria-hidden="true" />
          <span className="text-sm">No cost data recorded for this ticket yet.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[var(--success)]" aria-hidden="true" />
          <span className="text-sm font-medium text-[var(--text-primary)]">Cost</span>
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
          {costData.sessionCount > 0 && (
            <span>
              {costData.sessionCount} session{costData.sessionCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Model breakdown */}
        {costData.byModel.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Cost by Model
            </h4>
            <div role="list" aria-label="Cost breakdown by model">
              {costData.byModel.map((entry) => (
                <div key={entry.model} role="listitem">
                  <ModelRow
                    model={entry.model}
                    costUsd={entry.costUsd}
                    inputTokens={entry.inputTokens}
                    outputTokens={entry.outputTokens}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TicketCostPanel;
