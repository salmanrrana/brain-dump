import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { devtools } from "@tanstack/devtools-vite";

// better-sqlite3 is a native Node addon. If it ever lands in the browser
// bundle Vite pre-bundles it and it explodes at runtime with the useless
// `TypeError: promisify is not a function`. This plugin intercepts resolution
// in the client environment and replaces these modules with a throw-stub that
// names the offending importer, so the error points at the real leak.
function serverOnlyNativeModules(): Plugin {
  const BLOCKED = new Set(["better-sqlite3", "drizzle-orm/better-sqlite3"]);
  const MARKER = "\0brain-dump:server-only:";
  return {
    name: "brain-dump:block-server-only-in-browser",
    enforce: "pre",
    resolveId(source, importer, options) {
      if (options?.ssr) return null;
      if (!BLOCKED.has(source)) return null;
      return `${MARKER}${source}|${importer ?? "<unknown>"}`;
    },
    load(id) {
      if (!id.startsWith(MARKER)) return null;
      const payload = id.slice(MARKER.length);
      const sep = payload.indexOf("|");
      const pkg = payload.slice(0, sep);
      const importer = payload.slice(sep + 1);
      const message =
        `[brain-dump] Server-only module "${pkg}" was pulled into the browser bundle by "${importer}". ` +
        `This usually means a top-level import or re-export in the client graph reaches core/db.ts or src/lib/db.ts. ` +
        `Move the usage behind a createServerFn handler (or import from a server-only module) instead of re-exporting it from a client-reachable file.`;
      return `throw new Error(${JSON.stringify(message)});`;
    },
  };
}

function serverOnlyImplementationModules(): Plugin {
  const MARKER = "\0brain-dump:server-only-implementation:";
  type ServerOnlyModuleConfig = { exports: string[] };
  const serverOnlyModules: Array<[string, ServerOnlyModuleConfig]> = [
    ["src/lib/db.ts", { exports: ["db", "sqlite"] }],
    [
      "src/lib/xdg.ts",
      {
        exports: [
          "getDataDir",
          "getConfigDir",
          "getCacheDir",
          "getStateDir",
          "getLegacyDir",
          "getDatabasePath",
          "getBackupsDir",
          "getLogsDir",
          "ensureDirectories",
          "ensureDirectoriesSync",
        ],
      },
    ],
    ["src/lib/logger.ts", { exports: ["createLogger", "log"] }],
    ["src/lib/migration.ts", { exports: ["migrateFromLegacySync", "migrateFromLegacy"] }],
    ["src/lib/backup.ts", { exports: ["performDailyBackupSync"] }],
    ["src/lib/lockfile.ts", { exports: ["initializeLockSync"] }],
    ["src/lib/db-watcher.ts", { exports: ["initializeWatcher", "stopWatching"] }],
    ["src/lib/integrity.ts", { exports: ["startupIntegrityCheck"] }],
    [
      "src/lib/docker-runtime.ts",
      {
        exports: [
          "detectDockerRuntime",
          "getDockerSocketPath",
          "getDockerRuntimeName",
          "getDockerRuntimeSocketPath",
        ],
      },
    ],
    [
      "src/api/docker-utils.ts",
      {
        exports: [
          "getEffectiveDockerSocketPath",
          "getEffectiveDockerRuntime",
          "getDockerCommandPrefix",
          "getDockerHostEnvValue",
          "execDockerCommand",
          "isDockerAccessible",
          "checkDockerAvailability",
          "getDockerVersion",
          "listContainers",
          "getContainerStats",
          "getContainerLogs",
        ],
      },
    ],
    [
      "src/api/ship-core.ts",
      {
        exports: [
          "getErrorMessage",
          "commitAndShip",
          "generatePrBody",
          "pushBranch",
          "getShipPrepData",
          "defaultShipPrepDeps",
          "defaultCommitAndShipDeps",
          "defaultPushBranchDeps",
        ],
      },
    ],
    [
      "core/index.ts",
      {
        exports: [
          "CoreError",
          "TicketNotFoundError",
          "EpicNotFoundError",
          "ProjectNotFoundError",
          "FindingNotFoundError",
          "SessionNotFoundError",
          "InvalidStateError",
          "InvalidActionError",
          "ValidationError",
          "GitError",
          "PathNotFoundError",
          "TransferError",
          "InvalidArchiveError",
          "ArchiveTooLargeError",
          "initDatabase",
          "createTestDatabase",
          "runMigrations",
          "getDataDir",
          "getStateDir",
          "getBackupsDir",
          "getLegacyDir",
          "getDbPath",
          "silentLogger",
          "consoleLogger",
          "createTicket",
          "listTickets",
          "getTicket",
          "updateTicketStatus",
          "updateTicket",
          "updateAcceptanceCriterion",
          "deleteTicket",
          "updateAttachmentMetadata",
          "listTicketsByEpic",
          "listProjects",
          "findProjectByPath",
          "createProject",
          "deleteProject",
          "createEpic",
          "listEpics",
          "updateEpic",
          "deleteEpic",
          "submitFinding",
          "markFixed",
          "getFindings",
          "checkComplete",
          "generateDemo",
          "getDemo",
          "updateDemoStep",
          "submitFeedback",
          "createSession",
          "updateState",
          "completeSession",
          "getState",
          "listSessions",
          "emitEvent",
          "getEvents",
          "clearEvents",
          "clearActiveSessionsForProject",
          "writeRalphStateFile",
          "removeRalphStateFile",
          "VALID_STATES",
          "VALID_OUTCOMES",
          "VALID_EVENT_TYPES",
          "recordUsage",
          "getTicketCost",
          "getEpicCost",
          "getProjectCost",
          "getCostTrend",
          "computeCostFromTokens",
          "upsertCostModel",
          "listCostModels",
          "deleteCostModel",
          "seedCostModels",
          "recalculateCosts",
          "computeStageCosts",
          "getTicketCostDetail",
          "getCostExplorerData",
          "startTelemetrySession",
          "logPrompt",
          "logTool",
          "logContext",
          "endTelemetrySession",
          "getTelemetrySession",
          "listTelemetrySessions",
          "detectActiveTicket",
          "summarizeParams",
          "TELEMETRY_OUTCOMES",
          "TOOL_EVENTS",
          "searchTickets",
          "safeJsonParse",
          "slugify",
          "shortId",
          "generateBranchName",
          "generateEpicBranchName",
          "createRealGitOperations",
          "runGitCommand",
          "findBaseBranch",
          "DEMO_STEPS_SENTINEL",
          "execFileNoThrow",
          "resolveShipScope",
          "parseGitStatusShortOutput",
          "parseCommitHashFromOutput",
          "parsePullRequestRef",
          "replaceSentinelBlock",
          "renderDemoStepsMarkdown",
          "syncPrVerificationChecklist",
          "startWork",
          "completeWork",
          "startEpicWork",
          "linkCommit",
          "linkPr",
          "syncTicketLinks",
          "linkFiles",
          "getTicketsForFile",
          "saveTasks",
          "getTasks",
          "clearTasks",
          "getTaskSnapshots",
          "TASK_STATUSES",
          "getDatabaseHealth",
          "getEnvironment",
          "getProjectSettings",
          "updateProjectSettings",
          "reconcileLearnings",
          "getEpicLearnings",
          "autoExtractLearnings",
          "gatherEpicAnalysisContext",
          "saveEpicInsights",
          "getEpicInsights",
          "clearEpicLearnings",
          "startConversation",
          "logMessage",
          "endConversation",
          "listConversations",
          "exportComplianceLogs",
          "archiveOldSessions",
          "DATA_CLASSIFICATIONS",
          "MESSAGE_ROLES",
          "MANIFEST_VERSION",
          "MAX_ARCHIVE_SIZE_BYTES",
          "gatherEpicExportData",
          "gatherProjectExportData",
          "importData",
          "createBrainDumpArchive",
          "extractBrainDumpArchive",
          "previewBrainDumpArchive",
        ],
      },
    ],
    [
      "core/ship.ts",
      {
        exports: [
          "DEMO_STEPS_SENTINEL",
          "execFileNoThrow",
          "resolveShipScope",
          "parseGitStatusShortOutput",
          "parseCommitHashFromOutput",
          "parsePullRequestRef",
          "replaceSentinelBlock",
          "renderDemoStepsMarkdown",
          "syncPrVerificationChecklist",
        ],
      },
    ],
    [
      "core/git-utils.ts",
      {
        exports: [
          "slugify",
          "shortId",
          "generateBranchName",
          "generateEpicBranchName",
          "runGitCommand",
          "createRealGitOperations",
          "findBaseBranch",
        ],
      },
    ],
    ["core/workflow.ts", { exports: ["startWork", "completeWork", "startEpicWork"] }],
    [
      "core/cost.ts",
      {
        exports: [
          "computeCostFromTokens",
          "recordUsage",
          "getTicketCost",
          "getEpicCost",
          "getProjectCost",
          "getCostTrend",
          "upsertCostModel",
          "listCostModels",
          "deleteCostModel",
          "recalculateCosts",
          "computeStageCosts",
          "getTicketCostDetail",
          "getCostExplorerData",
          "seedCostModels",
          "syncDefaultCostModels",
        ],
      },
    ],
    [
      "core/errors.ts",
      {
        exports: [
          "CoreError",
          "TicketNotFoundError",
          "EpicNotFoundError",
          "ProjectNotFoundError",
          "FindingNotFoundError",
          "SessionNotFoundError",
          "InvalidStateError",
          "InvalidActionError",
          "ValidationError",
          "GitError",
          "PathNotFoundError",
          "TransferError",
          "InvalidArchiveError",
          "ArchiveTooLargeError",
        ],
      },
    ],
  ];
  const SERVER_ONLY_MODULES = new Map(
    serverOnlyModules.map(([file, config]) => [resolve(file), config])
  );

  return {
    name: "brain-dump:block-server-implementation-in-browser",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (options?.ssr || source.startsWith(MARKER)) return null;

      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || !SERVER_ONLY_MODULES.has(resolved.id)) return null;

      return `${MARKER}${resolved.id}`;
    },
    load(id) {
      if (!id.startsWith(MARKER)) return null;

      const originalId = id.slice(MARKER.length);
      const config = SERVER_ONLY_MODULES.get(originalId);
      if (!config) return null;

      const message =
        `[brain-dump] Server-only implementation module "${originalId}" was imported by the browser bundle. ` +
        `Only call it from createServerFn handlers or other server-only modules.`;
      const thrower = `function serverOnlyModuleError() { throw new Error(${JSON.stringify(message)}); }`;
      const namedExports = config.exports
        .map((name) => `export const ${name} = serverOnlyModuleError;`)
        .join("\n");

      return `${thrower}\n${namedExports}\nexport default serverOnlyModuleError;`;
    },
  };
}

const config = defineConfig({
  plugins: [
    serverOnlyImplementationModules(),
    serverOnlyNativeModules(),
    devtools(
      process.env.PLAYWRIGHT_E2E === "1"
        ? {
            // Playwright starts its own Vite dev server; the devtools event bus
            // binds a fixed port that conflicts with another local `vite dev`.
            eventBusConfig: { enabled: false },
          }
        : {}
    ),
    nitro({
      // Externalize native modules - they can't be bundled
      rollupConfig: {
        external: ["better-sqlite3"],
      },
    }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  // Keep the browser dep optimizer from eagerly pre-bundling native modules.
  optimizeDeps: {
    exclude: ["better-sqlite3", "drizzle-orm/better-sqlite3"],
  },
  // Native modules must stay external on the SSR side too.
  ssr: {
    external: ["better-sqlite3"],
  },
});

export default config;
