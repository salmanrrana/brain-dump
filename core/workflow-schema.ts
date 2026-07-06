import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { ValidationError } from "./errors.ts";

export const WORKFLOW_SCHEMA_VERSION = "2026-07-ai-verification-v1";

export const WORKFLOW_SCHEMA_CAPABILITIES = {
  aiVerificationStatus: true,
  executableDemoAutomation: true,
  verificationQueue: true,
  legacyHumanReviewRepair: true,
} as const;

export const WORKFLOW_SCHEMA_BUILD_MARKER = [
  "brain-dump-workflow-schema",
  `version=${WORKFLOW_SCHEMA_VERSION}`,
  "status=ai_verification",
  "automation=executable-demo-specs",
  "queue=verification_jobs",
  "legacy=human_review-repair",
].join("|");

const WORKFLOW_SCHEMA_BUILD_MARKER_PARTS = WORKFLOW_SCHEMA_BUILD_MARKER.split("|").filter(
  (part) => !part.startsWith("version=")
);

export interface WorkflowSchemaInfo {
  version: string;
  capabilities: Record<keyof typeof WORKFLOW_SCHEMA_CAPABILITIES, boolean>;
}

export type WorkflowSchemaDriftStatus = "current" | "missing" | "stale";

export interface WorkflowSchemaDriftReport {
  status: WorkflowSchemaDriftStatus;
  sourceVersion: string;
  builtVersion: string | null;
  distPath: string;
  message: string;
  remediation: string;
}

export type WorkflowSchemaRuntimeStatus = "current" | "missing" | "stale" | "not-running";

export interface WorkflowSchemaRuntimeLockInfo {
  pid: number;
  startedAt: string;
  type: string;
  workflowSchemaVersion?: string;
}

export interface WorkflowSchemaRuntimeReport {
  status: WorkflowSchemaRuntimeStatus;
  sourceVersion: string;
  runningVersion: string | null;
  pid: number | null;
  message: string;
  remediation: string;
}

export function getWorkflowSchemaInfo(): WorkflowSchemaInfo {
  return {
    version: WORKFLOW_SCHEMA_VERSION,
    capabilities: WORKFLOW_SCHEMA_CAPABILITIES,
  };
}

export function assertWorkflowSchemaSupportsCurrentFlow(info: WorkflowSchemaInfo): void {
  const missingCapabilities = Object.entries(WORKFLOW_SCHEMA_CAPABILITIES)
    .filter(
      ([key, required]) => required && !info.capabilities[key as keyof typeof info.capabilities]
    )
    .map(([key]) => key);

  if (info.version !== WORKFLOW_SCHEMA_VERSION || missingCapabilities.length > 0) {
    throw new ValidationError(
      `Workflow schema drift detected. Expected ${WORKFLOW_SCHEMA_VERSION}, got ${info.version}. Rebuild and restart the Brain Dump MCP server before continuing.`,
      {
        expectedVersion: WORKFLOW_SCHEMA_VERSION,
        actualVersion: info.version,
        missingCapabilities: missingCapabilities.join(", "),
      }
    );
  }
}

export function getMcpServerWorkflowSchemaDriftReport(
  projectRoot: string
): WorkflowSchemaDriftReport {
  const distPath = join(projectRoot, "mcp-server", "dist", "index.js");
  const remediation = `Run: cd "${projectRoot}/mcp-server" && pnpm build, then restart every Brain Dump MCP client.`;

  if (!existsSync(distPath)) {
    return {
      status: "missing",
      sourceVersion: WORKFLOW_SCHEMA_VERSION,
      builtVersion: null,
      distPath,
      message:
        "MCP server build output is missing; installed MCP clients cannot use the current workflow schema.",
      remediation,
    };
  }

  const builtSource = readFileSync(distPath, "utf8");
  if (
    builtSource.includes(WORKFLOW_SCHEMA_VERSION) &&
    WORKFLOW_SCHEMA_BUILD_MARKER_PARTS.every((part) => builtSource.includes(part))
  ) {
    return {
      status: "current",
      sourceVersion: WORKFLOW_SCHEMA_VERSION,
      builtVersion: WORKFLOW_SCHEMA_VERSION,
      distPath,
      message: "MCP server build contains the current workflow schema.",
      remediation,
    };
  }

  const legacyHumanReviewOnly =
    builtSource.includes("human_review") && !builtSource.includes("ai_verification");

  return {
    status: "stale",
    sourceVersion: WORKFLOW_SCHEMA_VERSION,
    builtVersion: null,
    distPath,
    message: legacyHumanReviewOnly
      ? "MCP server build appears to be a legacy human_review-only workflow and can strand tickets."
      : "MCP server build does not contain the current workflow schema version.",
    remediation,
  };
}

export function getMcpRuntimeWorkflowSchemaDriftReport(
  lockInfo: WorkflowSchemaRuntimeLockInfo | null,
  isProcessRunning: (pid: number) => boolean
): WorkflowSchemaRuntimeReport {
  const remediation = "Rebuild the MCP server, then restart every Brain Dump MCP client.";

  if (!lockInfo || lockInfo.type !== "mcp-server" || !isProcessRunning(lockInfo.pid)) {
    return {
      status: "not-running",
      sourceVersion: WORKFLOW_SCHEMA_VERSION,
      runningVersion: null,
      pid: lockInfo?.pid ?? null,
      message: "No active Brain Dump MCP server process was found in the lock file.",
      remediation,
    };
  }

  if (!lockInfo.workflowSchemaVersion) {
    return {
      status: "missing",
      sourceVersion: WORKFLOW_SCHEMA_VERSION,
      runningVersion: null,
      pid: lockInfo.pid,
      message:
        "Active Brain Dump MCP server did not publish a workflow schema version; it may be stale.",
      remediation,
    };
  }

  if (lockInfo.workflowSchemaVersion !== WORKFLOW_SCHEMA_VERSION) {
    return {
      status: "stale",
      sourceVersion: WORKFLOW_SCHEMA_VERSION,
      runningVersion: lockInfo.workflowSchemaVersion,
      pid: lockInfo.pid,
      message: `Active Brain Dump MCP server schema is ${lockInfo.workflowSchemaVersion}, expected ${WORKFLOW_SCHEMA_VERSION}.`,
      remediation,
    };
  }

  return {
    status: "current",
    sourceVersion: WORKFLOW_SCHEMA_VERSION,
    runningVersion: lockInfo.workflowSchemaVersion,
    pid: lockInfo.pid,
    message: "Active Brain Dump MCP server is running the current workflow schema.",
    remediation,
  };
}
