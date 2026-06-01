/**
 * Shared ECharts setup for dashboard charts.
 *
 * Registers the tree-shaken ECharts modules used across the dashboard once,
 * exposes a small `EChart` wrapper component, and provides reusable helpers
 * (gradients, tooltip styling, axis defaults) so the simple bar/pie/area
 * charts can be expressed concisely without pulling in a second charting
 * library (recharts). Mirrors the import style already used by
 * `CostTreemapChart`.
 */

import { type CSSProperties } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, PieChart, LineChart } from "echarts/charts";
import { TooltipComponent, GridComponent, GraphicComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ChartColors } from "./chart-utils";

// Register every component the dashboard's bar/pie/area charts rely on.
echarts.use([
  BarChart,
  PieChart,
  LineChart,
  TooltipComponent,
  GridComponent,
  GraphicComponent,
  CanvasRenderer,
]);

export { echarts };

/** ECharts option object. The library types this loosely, so do we. */
export type EChartsOption = Record<string, unknown>;

/** Subset of the params object ECharts passes to tooltip/label formatters. */
export interface FormatterParam {
  dataIndex: number;
  name: string;
  value: number;
  percent?: number;
  color?: string;
  seriesName?: string;
  data?: unknown;
}

export interface EChartProps {
  /** Fully-formed ECharts option object. */
  option: EChartsOption;
  /** Chart height in pixels (or any CSS length). */
  height: number | string;
  /** Optional event handlers (e.g. `{ click: handler }`). */
  onEvents?: Record<string, (params: unknown) => void>;
  /** Accessible description of what the chart shows. */
  ariaLabel?: string;
  style?: CSSProperties;
}

/**
 * Thin wrapper around `echarts-for-react`'s core build.
 *
 * Uses `notMerge` so theme/data changes fully replace the previous option
 * (matches how the option is recomputed on theme change). Container resize is
 * handled automatically by echarts-for-react's built-in size sensor.
 */
export function EChart({ option, height, onEvents, ariaLabel, style }: EChartProps) {
  // Spread onEvents only when provided — exactOptionalPropertyTypes forbids
  // passing an explicit `undefined` to the underlying component's prop.
  const eventProps = onEvents ? { onEvents } : {};
  return (
    <div style={{ width: "100%", height, ...style }} role="img" aria-label={ariaLabel}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        lazyUpdate
        style={{ width: "100%", height: "100%" }}
        {...eventProps}
      />
    </div>
  );
}

// =============================================================================
// Color helpers
// =============================================================================

/**
 * Apply an alpha channel to a hex or rgb(a) color string.
 * Returns the input unchanged for unrecognized formats (e.g. CSS keywords).
 */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return c;
  }
  const rgbMatch = c.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch && rgbMatch[1]) {
    const parts = rgbMatch[1].split(",").map((p) => p.trim());
    const [r, g, b] = parts;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return c;
}

/**
 * Horizontal (left→right) bar gradient with the 0.85→0.55 opacity ramp used
 * by the recharts bars this replaces. Set `vertical` for top→bottom area fills.
 */
export function barGradient(
  color: string,
  opacityStart = 0.85,
  opacityEnd = 0.55,
  vertical = false
) {
  const [x2, y2] = vertical ? [0, 1] : [1, 0];
  return new echarts.graphic.LinearGradient(0, 0, x2, y2, [
    { offset: 0, color: withAlpha(color, opacityStart) },
    { offset: 1, color: withAlpha(color, opacityEnd) },
  ]);
}

/** Two-color gradient (left→right by default, top→bottom when `vertical`). */
export function twoColorGradient(start: string, end: string, vertical = false) {
  const [x2, y2] = vertical ? [0, 1] : [1, 0];
  return new echarts.graphic.LinearGradient(0, 0, x2, y2, [
    { offset: 0, color: start },
    { offset: 1, color: end },
  ]);
}

/** Vertical (top→bottom) area fill gradient used by the area charts. */
export function areaGradient(color: string, opacityTop = 0.28, opacityBottom = 0.02) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: withAlpha(color, opacityTop) },
    { offset: 1, color: withAlpha(color, opacityBottom) },
  ]);
}

// =============================================================================
// Shared option fragments
// =============================================================================

/**
 * Themed tooltip styling matching the recharts `tooltipStyle`
 * (var(--bg-secondary) surface, soft shadow, no border).
 */
export function tooltipBox(colors: ChartColors) {
  return {
    backgroundColor: colors.bg,
    borderWidth: 0,
    padding: 8,
    textStyle: { color: colors.text, fontSize: 13 },
    extraCssText: "border-radius: 8px; box-shadow: var(--shadow-lg); outline: none;",
  };
}

export interface HBarOptionConfig {
  /** Y-axis category labels (already truncated for display). */
  categories: string[];
  /** Bar values aligned to `categories`. */
  values: number[];
  /** Per-bar colors, cycled by index. */
  palette: string[];
  colors: ChartColors;
  barWidth?: number;
  /** Gradient end opacity (default 0.55). */
  gradientEnd?: number;
  /** Color token used for the category (Y-axis) labels. */
  yAxisLabelColor?: string;
  /** Formats X-axis (value) tick labels. */
  xAxisLabelFormatter?: (value: number) => string;
  /** Tooltip title line (defaults to the category value). */
  tooltipTitle?: (index: number, name: string) => string;
  /** Tooltip value line. */
  tooltipValue: (value: number) => string;
  /** Optional vertical reference line at this X value. */
  avg?: number;
  avgLabel?: string;
}

/**
 * Build a horizontal multi-color bar chart option matching the dashboard's
 * recharts horizontal `BarChart` usage (per-bar gradient, rounded right edge,
 * shadow cursor, top-to-bottom order). Shared by the cost/tool/state bars.
 */
export function buildHBarOption(config: HBarOptionConfig): EChartsOption {
  const {
    categories,
    values,
    palette,
    colors,
    barWidth = 22,
    gradientEnd = 0.55,
    yAxisLabelColor = colors.text,
    xAxisLabelFormatter,
    tooltipTitle,
    tooltipValue,
    avg,
    avgLabel,
  } = config;

  return {
    grid: { top: 5, right: avg && avg > 0 ? 60 : 10, bottom: 5, left: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...tooltipBox(colors),
      formatter: (params: FormatterParam[]) => {
        const p = params[0];
        if (!p) return "";
        const title = tooltipTitle ? tooltipTitle(p.dataIndex, p.name) : p.name;
        return `<div style="font-weight:500">${title}</div><div style="color:var(--text-secondary)">${tooltipValue(p.value)}</div>`;
      },
    },
    xAxis: {
      type: "value",
      axisLabel: {
        fontSize: 10,
        color: colors.textSecondary,
        ...(xAxisLabelFormatter ? { formatter: xAxisLabelFormatter } : {}),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: categories,
      axisLabel: { fontSize: 11, color: yAxisLabelColor },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        barWidth,
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: barGradient(palette[i % palette.length]!, 0.85, gradientEnd),
            borderRadius: [0, 6, 6, 0],
          },
        })),
        markLine:
          avg && avg > 0
            ? {
                silent: true,
                symbol: "none",
                lineStyle: { color: colors.textSecondary, type: "dashed", width: 1.5 },
                label: avgLabel
                  ? {
                      formatter: avgLabel,
                      position: "end",
                      color: colors.textSecondary,
                      fontSize: 10,
                    }
                  : { show: false },
                data: [{ xAxis: avg }],
              }
            : undefined,
      },
    ],
  };
}

export interface DonutOptionConfig {
  data: Array<{ name: string; value: number; color: string }>;
  colors: ChartColors;
  /** Big centered text (e.g. total or success rate). */
  centerText?: string | undefined;
  /** Small centered caption beneath `centerText`. */
  centerSubtext?: string | undefined;
  /** Color of the centered big text (default theme text color). */
  centerColor?: string | undefined;
  /** ECharts label template, e.g. "{b}: {d}%" or "{b}: {c}". */
  labelFormatter: string;
  /** Unit word used in the tooltip (e.g. "comments", "sessions"). */
  tooltipUnit: string;
}

/**
 * Build a donut (inner-radius pie) option with an optional centered statistic,
 * matching the dashboard's recharts donut usage.
 */
export function buildDonutOption(config: DonutOptionConfig): EChartsOption {
  const { data, colors, centerText, centerSubtext, centerColor, labelFormatter, tooltipUnit } =
    config;

  return {
    tooltip: {
      trigger: "item",
      ...tooltipBox(colors),
      formatter: (p: FormatterParam) => {
        const pct = p.percent ?? 0;
        const plural = p.value !== 1 ? "s" : "";
        return `<div style="font-weight:500">${p.name}</div><div style="color:var(--text-secondary)">${p.value} ${tooltipUnit}${plural} (${pct.toFixed(0)}%)</div>`;
      },
    },
    title: centerText
      ? {
          text: centerText,
          subtext: centerSubtext,
          left: "center",
          top: "center",
          itemGap: 2,
          textAlign: "center",
          textStyle: { fontSize: 22, fontWeight: 700, color: centerColor ?? colors.text },
          subtextStyle: { fontSize: 9, color: colors.textSecondary, letterSpacing: 0.5 },
        }
      : undefined,
    series: [
      {
        type: "pie",
        radius: ["38%", "70%"],
        center: ["50%", "50%"],
        padAngle: 2,
        avoidLabelOverlap: true,
        itemStyle: { borderColor: colors.bg, borderWidth: 3 },
        label: { show: true, formatter: labelFormatter, color: colors.textSecondary, fontSize: 11 },
        labelLine: { show: true, length: 6, length2: 6 },
        data: data.map((d) => ({ name: d.name, value: d.value, itemStyle: { color: d.color } })),
      },
    ],
  };
}

export interface AreaOptionConfig {
  /** X-axis category values (dates). */
  categories: string[];
  /** Y-axis values aligned to `categories`. */
  values: number[];
  /** Line/area accent color (hex). */
  color: string;
  colors: ChartColors;
  /** Optional reference line drawn at this Y value (omit/0 = none). */
  avg?: number;
  /** Formats X-axis tick labels (e.g. date → "5/3"). */
  xAxisLabelFormatter?: (value: string) => string;
  /** Formats Y-axis tick labels. */
  yAxisLabelFormatter?: (value: number) => string;
  yAxisAllowDecimals?: boolean;
  /** Tooltip title line (defaults to the raw category value). */
  tooltipTitle?: (name: string) => string;
  /** Tooltip value line. */
  tooltipValue: (value: number) => string;
}

/**
 * Build a gradient-filled area chart option matching the dashboard's recharts
 * `AreaChart` usage (smooth line, gradient fill, optional average reference
 * line, no active dot clutter). Shared by the cost/velocity/session trends.
 */
export function buildAreaOption(config: AreaOptionConfig): EChartsOption {
  const {
    categories,
    values,
    color,
    colors,
    avg,
    xAxisLabelFormatter,
    yAxisLabelFormatter,
    yAxisAllowDecimals = true,
    tooltipTitle,
    tooltipValue,
  } = config;

  return {
    grid: { top: 10, right: 10, bottom: 5, left: 5, containLabel: true },
    tooltip: {
      trigger: "axis",
      ...tooltipBox(colors),
      formatter: (params: FormatterParam[]) => {
        const p = params[0];
        if (!p) return "";
        const title = tooltipTitle ? tooltipTitle(p.name) : p.name;
        return `<div style="font-weight:500">${title}</div><div style="color:var(--text-secondary)">${tooltipValue(p.value)}</div>`;
      },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: categories,
      axisLabel: {
        fontSize: 10,
        color: colors.textSecondary,
        ...(xAxisLabelFormatter ? { formatter: xAxisLabelFormatter } : {}),
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      ...(yAxisAllowDecimals ? {} : { minInterval: 1 }),
      axisLabel: {
        fontSize: 10,
        color: colors.textSecondary,
        ...(yAxisLabelFormatter ? { formatter: yAxisLabelFormatter } : {}),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.15 } },
    },
    series: [
      {
        type: "line",
        smooth: true,
        showSymbol: false,
        data: values,
        lineStyle: { color, width: 2.5 },
        itemStyle: { color },
        areaStyle: { color: areaGradient(color) },
        emphasis: { focus: "series" },
        markLine:
          avg && avg > 0
            ? {
                silent: true,
                symbol: "none",
                lineStyle: { color, type: "dashed", width: 1, opacity: 0.5 },
                label: { show: false },
                data: [{ yAxis: avg }],
              }
            : undefined,
      },
    ],
  };
}
