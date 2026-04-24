#!/usr/bin/env npx tsx

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

type AssetKind = "script" | "style" | "other";

type AssetSummary = {
  path: string;
  name: string;
  kind: AssetKind;
  bytes: number;
  gzipBytes: number;
  risk: string;
};

type RiskRule = {
  pattern: RegExp;
  label: string;
};

const ROOT = resolve(import.meta.dirname, "..");
const ASSETS_DIR = resolve(ROOT, ".output/public/assets");
const REPORT_DIR = resolve(ROOT, "docs/performance");
const REPORT_PATH = resolve(REPORT_DIR, "bundle-baseline.md");
const LARGE_CHUNK_BYTES = 500 * 1024;
const INITIAL_ROUTE_BUDGET_BYTES = 300 * 1024;

const RISK_RULES: RiskRule[] = [
  {
    pattern:
      /costtreemap|generatecategoricalchart|aiusage|velocity|cycle|piechart|areachart|ychart/i,
    label: "chart library chunk",
  },
  { pattern: /dashboard/i, label: "dashboard charts and analytics" },
  { pattern: /board/i, label: "Kanban drag and drop" },
  { pattern: /ticketmodal|ticket-form/i, label: "ticket form modal" },
  { pattern: /ticket\._id/i, label: "ticket detail route" },
  { pattern: /epic\._id/i, label: "epic detail route" },
  { pattern: /relatedtickets/i, label: "related-ticket graph" },
  { pattern: /telemetry|aiusage|ralphmetrics/i, label: "telemetry charts" },
  { pattern: /main|index/i, label: "initial/root application" },
];

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function getAssetKind(path: string): AssetKind {
  const extension = extname(path);
  if (extension === ".js") return "script";
  if (extension === ".css") return "style";
  return "other";
}

function getRisk(name: string): string {
  return RISK_RULES.find((rule) => rule.pattern.test(name))?.label ?? "general async asset";
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function summarizeAssets(): AssetSummary[] {
  if (!existsSync(ASSETS_DIR)) {
    throw new Error(
      `Client assets not found at ${relative(ROOT, ASSETS_DIR)}. Run pnpm build first.`
    );
  }

  return walkFiles(ASSETS_DIR)
    .map((path) => {
      const content = readFileSync(path);
      const name = basename(path);
      return {
        path: relative(ROOT, path),
        name,
        kind: getAssetKind(path),
        bytes: statSync(path).size,
        gzipBytes: gzipSync(content).length,
        risk: getRisk(name),
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

function renderAssetTable(assets: AssetSummary[]): string[] {
  return assets.map((asset) => {
    const warning = asset.bytes > LARGE_CHUNK_BYTES ? "over 500 kB" : "";
    return `| \`${asset.path}\` | ${asset.kind} | ${formatBytes(asset.bytes)} | ${formatBytes(asset.gzipBytes)} | ${asset.risk} | ${warning} |`;
  });
}

function renderObservations(scripts: AssetSummary[]): string[] {
  const largestScript = scripts[0];
  const overBudgetScripts = scripts.filter((asset) => asset.bytes > LARGE_CHUNK_BYTES);
  const chartScripts = scripts.filter((asset) => asset.risk === "chart library chunk");

  const lines = [
    largestScript
      ? `- The largest current script is \`${largestScript.name}\` at ${formatBytes(largestScript.bytes)} uncompressed (${formatBytes(largestScript.gzipBytes)} gzip).`
      : "- No client scripts were found in the production assets.",
    overBudgetScripts.length === 0
      ? `- No client scripts exceed the ${formatBytes(LARGE_CHUNK_BYTES)} chunk budget.`
      : `- Scripts over ${formatBytes(LARGE_CHUNK_BYTES)}: ${overBudgetScripts.map((asset) => `\`${asset.name}\``).join(", ")}.`,
    "- `board-*`, `ticket._id-*`, `epic._id-*`, and route-specific dashboard assets are separated from root assets, making route-level regressions visible in this report.",
    "- `TicketModal-*`, `SettingsModal-*`, `ProjectModal-*`, `EpicModal-*`, `ImportModal-*`, and other modal assets appear as separate client chunks when present.",
  ];

  if (chartScripts.length > 0) {
    lines.push(
      `- Chart-heavy assets are split from root assets: ${chartScripts
        .slice(0, 4)
        .map((asset) => `\`${asset.name}\``)
        .join(", ")}.`
    );
  }

  lines.push(
    "- Any future `@tanstack/*devtools*` or chart library code showing up in `main-*` should be treated as an initial-load regression."
  );

  return lines;
}

function renderReport(assets: AssetSummary[]): string {
  const scripts = assets.filter((asset) => asset.kind === "script");
  const styles = assets.filter((asset) => asset.kind === "style");
  const initialAssets = assets.filter((asset) => /^(main|index|styles)-/i.test(asset.name));
  const initialBytes = initialAssets.reduce((total, asset) => total + asset.bytes, 0);
  const initialGzipBytes = initialAssets.reduce((total, asset) => total + asset.gzipBytes, 0);
  const largeScripts = scripts.filter((asset) => asset.bytes > LARGE_CHUNK_BYTES);
  const topScripts = scripts.slice(0, 12);

  const lines = [
    "# Frontend Bundle Baseline",
    "",
    `Generated by \`pnpm analyze:bundle\` on ${new Date().toISOString()}.`,
    "",
    "## How To Regenerate",
    "",
    "```bash",
    "pnpm build:analyze",
    "```",
    "",
    "Use `pnpm analyze:bundle` when `.output/public/assets` already exists and you only need to refresh this report.",
    "",
    "## Budget Guidance",
    "",
    `- Keep route/application chunks below ${formatBytes(LARGE_CHUNK_BYTES)} uncompressed unless there is a documented exception.`,
    `- Treat initial/root assets above ${formatBytes(INITIAL_ROUTE_BUDGET_BYTES)} uncompressed as a regression risk.`,
    "- Charting, drag-and-drop, form-heavy modals, and devtools should stay in route-specific or lazy chunks instead of the root chunk.",
    "- Compare gzip size for network impact, but use uncompressed size to spot parse/compile cost.",
    "",
    "## Summary",
    "",
    `- Client scripts: ${scripts.length}`,
    `- Client stylesheets: ${styles.length}`,
    `- Initial/root candidate assets: ${formatBytes(initialBytes)} uncompressed, ${formatBytes(initialGzipBytes)} gzip`,
    `- Chunks over ${formatBytes(LARGE_CHUNK_BYTES)}: ${largeScripts.length === 0 ? "none" : largeScripts.map((asset) => `\`${asset.name}\``).join(", ")}`,
    "",
    "## Initial Route Payload Risks",
    "",
    "| Asset | Kind | Size | Gzip | Risk | Warning |",
    "| --- | --- | ---: | ---: | --- | --- |",
    ...renderAssetTable(initialAssets),
    "",
    "## Top Client Scripts",
    "",
    "| Asset | Kind | Size | Gzip | Risk | Warning |",
    "| --- | --- | ---: | ---: | --- | --- |",
    ...renderAssetTable(topScripts),
    "",
    "## Observations",
    "",
    ...renderObservations(scripts),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function main(): void {
  const assets = summarizeAssets();
  const report = renderReport(assets);
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, report);
  console.log(`Wrote ${relative(ROOT, REPORT_PATH)}`);
}

main();
