import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ValidationError } from "../errors.ts";
import {
  WORKFLOW_SCHEMA_BUILD_MARKER,
  WORKFLOW_SCHEMA_VERSION,
  assertWorkflowSchemaSupportsCurrentFlow,
  getMcpRuntimeWorkflowSchemaDriftReport,
  getMcpServerWorkflowSchemaDriftReport,
  getWorkflowSchemaInfo,
} from "../workflow-schema.ts";

let tempDir: string | null = null;

function makeProjectRoot(distSource?: string): string {
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-schema-"));
  const distDir = join(tempDir, "mcp-server", "dist");
  mkdirSync(distDir, { recursive: true });
  if (distSource !== undefined) {
    writeFileSync(join(distDir, "index.js"), distSource, "utf8");
  }
  return tempDir;
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe("workflow schema", () => {
  it("exposes the current workflow schema capabilities", () => {
    expect(getWorkflowSchemaInfo()).toMatchObject({
      version: WORKFLOW_SCHEMA_VERSION,
      capabilities: {
        aiVerificationStatus: true,
        executableDemoAutomation: true,
        verificationQueue: true,
        legacyHumanReviewRepair: true,
      },
    });
  });

  it("rejects stale workflow schema information before handoff actions", () => {
    expect(() =>
      assertWorkflowSchemaSupportsCurrentFlow({
        version: "legacy-human-review-v1",
        capabilities: {
          aiVerificationStatus: false,
          executableDemoAutomation: false,
          verificationQueue: false,
          legacyHumanReviewRepair: false,
        },
      })
    ).toThrow(ValidationError);
  });

  it("detects current MCP server build output", () => {
    const projectRoot = makeProjectRoot(`const marker = "${WORKFLOW_SCHEMA_BUILD_MARKER}";`);

    expect(getMcpServerWorkflowSchemaDriftReport(projectRoot)).toMatchObject({
      status: "current",
      sourceVersion: WORKFLOW_SCHEMA_VERSION,
      builtVersion: WORKFLOW_SCHEMA_VERSION,
    });
  });

  it("detects current MCP server build output when bundling splits the marker", () => {
    const projectRoot = makeProjectRoot(`const marker = [
      "brain-dump-workflow-schema",
      "version=${WORKFLOW_SCHEMA_VERSION}",
      "status=ai_verification",
      "automation=executable-demo-specs",
      "queue=verification_jobs",
      "legacy=human_review-repair",
    ].join("|");`);

    expect(getMcpServerWorkflowSchemaDriftReport(projectRoot)).toMatchObject({
      status: "current",
      sourceVersion: WORKFLOW_SCHEMA_VERSION,
      builtVersion: WORKFLOW_SCHEMA_VERSION,
    });
  });

  it("does not treat a bare version string as a current MCP server build", () => {
    const projectRoot = makeProjectRoot(`const version = "${WORKFLOW_SCHEMA_VERSION}";`);
    const report = getMcpServerWorkflowSchemaDriftReport(projectRoot);

    expect(report.status).toBe("stale");
    expect(report.message).toContain("does not contain the current workflow schema version");
  });

  it("detects stale human_review-only MCP server builds", () => {
    const projectRoot = makeProjectRoot("const status = 'human_review';");
    const report = getMcpServerWorkflowSchemaDriftReport(projectRoot);

    expect(report.status).toBe("stale");
    expect(report.message).toContain("legacy human_review-only workflow");
    expect(report.remediation).toContain("pnpm build");
    expect(report.remediation).toContain("restart every Brain Dump MCP client");
  });

  it("detects missing MCP server build output", () => {
    tempDir = mkdtempSync(join(tmpdir(), "brain-dump-schema-"));
    const report = getMcpServerWorkflowSchemaDriftReport(tempDir);

    expect(report.status).toBe("missing");
    expect(report.message).toContain("MCP server build output is missing");
  });

  it("detects a current active MCP server runtime schema", () => {
    const report = getMcpRuntimeWorkflowSchemaDriftReport(
      {
        pid: 123,
        startedAt: "2026-07-06T00:00:00.000Z",
        type: "mcp-server",
        workflowSchemaVersion: WORKFLOW_SCHEMA_VERSION,
      },
      () => true
    );

    expect(report).toMatchObject({
      status: "current",
      runningVersion: WORKFLOW_SCHEMA_VERSION,
      pid: 123,
    });
  });

  it("detects a stale active MCP server runtime schema", () => {
    const report = getMcpRuntimeWorkflowSchemaDriftReport(
      {
        pid: 123,
        startedAt: "2026-07-06T00:00:00.000Z",
        type: "mcp-server",
        workflowSchemaVersion: "legacy-human-review-v1",
      },
      () => true
    );

    expect(report.status).toBe("stale");
    expect(report.message).toContain("legacy-human-review-v1");
    expect(report.remediation).toContain("restart every Brain Dump MCP client");
  });

  it("detects an active MCP server without runtime schema metadata", () => {
    const report = getMcpRuntimeWorkflowSchemaDriftReport(
      {
        pid: 123,
        startedAt: "2026-07-06T00:00:00.000Z",
        type: "mcp-server",
      },
      () => true
    );

    expect(report.status).toBe("missing");
    expect(report.message).toContain("did not publish a workflow schema version");
  });
});
