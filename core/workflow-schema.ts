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
  if (builtSource.includes(WORKFLOW_SCHEMA_VERSION)) {
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
