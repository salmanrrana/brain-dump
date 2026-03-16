/**
 * Hollywood-grade summary stat cards for the Cost Explorer.
 *
 * Features:
 * - Animated count-up on numbers
 * - Gradient accent borders (top glow bar)
 * - Hover lift effect with subtle shadow
 * - Icon glow matching the accent color
 */

import { type FC, useEffect, useRef, useState } from "react";
import { DollarSign, TrendingDown, Trophy, Zap } from "lucide-react";
import { formatUsd } from "./chart-utils";

export interface CostSummaryData {
  totalSpend: number;
  avgPerTicket: number;
  mostExpensive: { name: string; costUsd: number; type: string } | null;
  cacheSavings: number;
  totalSessions: number;
}

interface CostSummaryCardsProps {
  data: CostSummaryData;
}

/** Animated count-up hook. */
function useCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, durationMs]);

  return value;
}

const AnimatedUsd: FC<{ value: number }> = ({ value }) => {
  const animated = useCountUp(value);
  return <>{formatUsd(animated)}</>;
};

export const CostSummaryCards: FC<CostSummaryCardsProps> = ({ data }) => {
  return (
    <div style={gridStyles}>
      {/* Total Spend */}
      <div style={cardStyles} className="cost-card">
        <div style={{ ...glowBarStyles, background: "linear-gradient(90deg, #f97316, #fb923c)" }} />
        <div style={cardInnerStyles}>
          <div style={cardHeaderStyles}>
            <div style={{ ...iconWrapStyles, background: "rgba(249,115,22,0.1)" }}>
              <DollarSign size={16} aria-hidden="true" style={{ color: "#f97316" }} />
            </div>
            <span style={cardLabelStyles}>Total Spend</span>
          </div>
          <div style={cardValueStyles}>
            <AnimatedUsd value={data.totalSpend} />
          </div>
          <div style={cardSubtextStyles}>{data.totalSessions} sessions</div>
        </div>
      </div>

      {/* Avg per Ticket */}
      <div style={cardStyles} className="cost-card">
        <div style={{ ...glowBarStyles, background: "linear-gradient(90deg, #14b8a6, #2dd4bf)" }} />
        <div style={cardInnerStyles}>
          <div style={cardHeaderStyles}>
            <div style={{ ...iconWrapStyles, background: "rgba(20,184,166,0.1)" }}>
              <TrendingDown size={16} aria-hidden="true" style={{ color: "#14b8a6" }} />
            </div>
            <span style={cardLabelStyles}>Avg per Ticket</span>
          </div>
          <div style={cardValueStyles}>
            <AnimatedUsd value={data.avgPerTicket} />
          </div>
        </div>
      </div>

      {/* Most Expensive */}
      <div style={cardStyles} className="cost-card">
        <div style={{ ...glowBarStyles, background: "linear-gradient(90deg, #eab308, #facc15)" }} />
        <div style={cardInnerStyles}>
          <div style={cardHeaderStyles}>
            <div style={{ ...iconWrapStyles, background: "rgba(234,179,8,0.1)" }}>
              <Trophy size={16} aria-hidden="true" style={{ color: "#eab308" }} />
            </div>
            <span style={cardLabelStyles}>Most Expensive</span>
          </div>
          <div style={cardValueStyles}>
            {data.mostExpensive ? <AnimatedUsd value={data.mostExpensive.costUsd} /> : "—"}
          </div>
          {data.mostExpensive && (
            <div style={cardSubtextStyles} title={data.mostExpensive.name}>
              {data.mostExpensive.name.length > 25
                ? data.mostExpensive.name.substring(0, 25) + "…"
                : data.mostExpensive.name}
            </div>
          )}
        </div>
      </div>

      {/* Cache Savings */}
      <div style={cardStyles} className="cost-card">
        <div style={{ ...glowBarStyles, background: "linear-gradient(90deg, #22c55e, #4ade80)" }} />
        <div style={cardInnerStyles}>
          <div style={cardHeaderStyles}>
            <div style={{ ...iconWrapStyles, background: "rgba(34,197,94,0.1)" }}>
              <Zap size={16} aria-hidden="true" style={{ color: "#22c55e" }} />
            </div>
            <span style={cardLabelStyles}>Cache Savings</span>
          </div>
          <div style={{ ...cardValueStyles, color: "#22c55e" }}>
            <AnimatedUsd value={data.cacheSavings} />
          </div>
          <div style={cardSubtextStyles}>est. from prompt caching</div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Styles
// ============================================

const gridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "var(--spacing-3)",
};

const cardStyles: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-primary)",
  overflow: "hidden",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
  cursor: "default",
};

const glowBarStyles: React.CSSProperties = {
  height: 3,
  width: "100%",
  flexShrink: 0,
};

const cardInnerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
  padding: "var(--spacing-3)",
};

const cardHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const iconWrapStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: "var(--radius-md)",
};

const cardLabelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-secondary)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  letterSpacing: "0.01em",
};

const cardValueStyles: React.CSSProperties = {
  fontSize: "var(--font-size-2xl)",
  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  lineHeight: 1.2,
  fontVariantNumeric: "tabular-nums",
};

const cardSubtextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-tertiary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
