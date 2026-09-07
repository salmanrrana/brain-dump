/**
 * Cross-surface evidence read model tests.
 *
 * Seeds one ticket with verification evidence and a sealed run, then asserts
 * the UI read path (readTicketAttachments / listVerificationRunSummaries),
 * the CLI history source (listVerificationRunSummaries), and the MCP context
 * loader all agree on evidence IDs, uploader, type, integrity state, and
 * warning behavior — and that broken evidence degrades loudly, not fatally.
 */

import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import { writeAttachmentFromFile } from "../attachments.ts";
import {
  getTicketAttachmentsDirPath,
  readTicketAttachments,
  resolveTicketAttachmentFiles,
} from "../attachments-read.ts";
import { normalizeAttachments, type AttachmentType } from "../attachment-types.ts";
import { getTicket } from "../ticket.ts";
import {
  listVerificationRunSummaries,
  verificationTestInternals,
  type VerificationManifest,
} from "../verification/run.ts";
import { loadTicketAttachments } from "../../mcp-server/lib/attachment-loader.ts";

let db: Database.Database;
let tempDir: string;
let previousXdgDataHome: string | undefined;

const TICKET_ID = "ticket-1";
const RUN_ID = "run-1";

function seedProjectAndTicket(): void {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    "proj-1",
    "Test Project",
    tempDir,
    now
  );
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, attachments, created_at, updated_at)
     VALUES (?, ?, 'ai_verification', 'medium', 1, 'proj-1', NULL, ?, ?)`
  ).run(TICKET_ID, "Verify ticket", now, now);
}

function seedEvidenceAttachment(
  filename: string,
  type: AttachmentType
): { id: string; filename: string } {
  const sourceFile = join(tempDir, filename);
  writeFileSync(sourceFile, `evidence: ${filename}`);
  const attachment = writeAttachmentFromFile(db, {
    ticketId: TICKET_ID,
    filePath: sourceFile,
    metadata: { type, provider: "claude" },
  });
  return { id: attachment.id, filename: attachment.filename };
}

function seedSealedRun(): VerificationManifest {
  const startedAt = "2026-07-07T01:00:00.000Z";
  const finishedAt = "2026-07-07T01:01:00.000Z";
  const evidenceFiles = [{ path: join(tempDir, "step-1.png"), hash: "evidence-hash" }];
  const manifestBase = {
    runId: RUN_ID,
    ticketId: TICKET_ID,
    round: 1,
    status: "passed" as const,
    certified: true,
    gitSha: "abc123",
    dirty: false,
    port: 4242,
    bootCommand: ["pnpm", "dev"],
    bootLog: "ready",
    startedAt,
    finishedAt,
    stepVerdicts: [
      { order: 1, status: "passed" as const, message: "ok", durationMs: 5, evidenceFiles },
    ],
    evidenceFiles,
    verifier: {
      provider: "claude",
      actor: "claude ralph" as const,
      providerSource: "session" as const,
      executionSurface: "enqueue-drain" as const,
      workerId: "worker-1",
      codeGitSha: "abc123",
    },
  };
  const manifest = {
    ...manifestBase,
    manifestHash: verificationTestInternals.manifestHashFor(manifestBase, RUN_ID),
  } as VerificationManifest;

  db.prepare(
    `INSERT INTO verification_runs (
      id, ticket_id, round, status, certified, manifest, git_sha, started_at, finished_at
    ) VALUES (?, ?, 1, 'passed', 1, ?, ?, ?, ?)`
  ).run(RUN_ID, TICKET_ID, JSON.stringify(manifest), "abc123", startedAt, finishedAt);
  return manifest;
}

beforeEach(() => {
  previousXdgDataHome = process.env.XDG_DATA_HOME;
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-evidence-read-"));
  process.env.XDG_DATA_HOME = tempDir;
  db = createTestDatabase().db;
  seedProjectAndTicket();
});

afterEach(() => {
  if (previousXdgDataHome === undefined) {
    delete process.env.XDG_DATA_HOME;
  } else {
    process.env.XDG_DATA_HOME = previousXdgDataHome;
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe("evidence read model cross-surface agreement", () => {
  it("UI, CLI, and MCP surfaces report identical evidence metadata for a seeded run", () => {
    const screenshot = seedEvidenceAttachment("step-1.png", "verification-screenshot");
    const manifestFile = seedEvidenceAttachment("manifest.json", "verification-manifest");
    seedSealedRun();

    // UI/server surface: read model straight from the database.
    const uiModel = readTicketAttachments(db, TICKET_ID);
    // CLI `ticket get` / MCP start-work surface: core getTicket normalization.
    const cliTicket = getTicket(db, TICKET_ID);
    // MCP context surface: loader consumes the ticket's attachment list.
    const mcpResult = loadTicketAttachments(TICKET_ID, cliTicket.attachments as unknown[]);

    const uiByFilename = new Map(uiModel.attachments.map((a) => [a.filename, a]));
    const cliByFilename = new Map(
      normalizeAttachments(cliTicket.attachments as unknown[]).map((a) => [a.filename, a])
    );

    for (const evidence of [screenshot, manifestFile]) {
      const uiEntry = uiByFilename.get(evidence.filename);
      const cliEntry = cliByFilename.get(evidence.filename);
      expect(uiEntry, `UI entry for ${evidence.filename}`).toBeDefined();
      expect(cliEntry, `CLI entry for ${evidence.filename}`).toBeDefined();
      expect(uiEntry!.id).toBe(evidence.id);
      expect(cliEntry!.id).toBe(evidence.id);
      expect(uiEntry!.uploadedBy).toBe("claude ralph");
      expect(cliEntry!.uploadedBy).toBe("claude ralph");
      expect(uiEntry!.type).toBe(cliEntry!.type);
      expect(uiEntry!.fileStatus).toBe("ok");
      expect(mcpResult.telemetry.filenames).toContain(evidence.filename);
    }
    expect(mcpResult.telemetry.byType["verification-screenshot"]).toBe(1);
    expect(mcpResult.telemetry.byType["verification-manifest"]).toBe(1);
    expect(mcpResult.warnings).toEqual([]);
    expect(uiModel.warnings).toEqual([]);

    // Run history (UI panel + CLI `verify history` share this read model).
    const runs = listVerificationRunSummaries(db, TICKET_ID);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.integrityStatus).toBe("valid");
    expect(runs[0]!.certified).toBe(true);
    expect(runs[0]!.durationMs).toBe(60_000);
    expect(runs[0]!.verifier).toMatchObject({
      provider: "claude",
      actor: "claude ralph",
      executionSurface: "enqueue-drain",
    });
    expect(runs[0]!.manifest?.evidenceFiles).toHaveLength(1);
  });

  it("reports tampered manifests without crashing any reader", () => {
    seedEvidenceAttachment("step-1.png", "verification-screenshot");
    seedSealedRun();
    db.prepare("UPDATE verification_runs SET status = 'failed' WHERE id = ?").run(RUN_ID);

    const runs = listVerificationRunSummaries(db, TICKET_ID);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.integrityStatus).toBe("tampered");
  });

  it("reports corrupted manifest JSON as tampered instead of throwing", () => {
    seedSealedRun();
    db.prepare("UPDATE verification_runs SET manifest = '{bad json' WHERE id = ?").run(RUN_ID);

    const runs = listVerificationRunSummaries(db, TICKET_ID);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.integrityStatus).toBe("tampered");
    expect(runs[0]!.manifest).toBeNull();
    expect(runs[0]!.verifier).toBeNull();
  });

  it("surfaces missing evidence files as the same loud warning on UI and MCP surfaces", () => {
    const screenshot = seedEvidenceAttachment("step-1.png", "verification-screenshot");
    unlinkSync(join(getTicketAttachmentsDirPath(TICKET_ID), screenshot.filename));

    const uiModel = readTicketAttachments(db, TICKET_ID);
    const mcpResult = loadTicketAttachments(
      TICKET_ID,
      getTicket(db, TICKET_ID).attachments as unknown[]
    );

    const expectedWarning = `Attachment file missing on disk: ${screenshot.filename}`;
    expect(uiModel.warnings).toContain(expectedWarning);
    expect(mcpResult.warnings).toContain(expectedWarning);
    expect(uiModel.attachments[0]!.fileStatus).toBe("missing");
    expect(mcpResult.telemetry.failedFiles).toContain(screenshot.filename);
  });

  it("skips oversized evidence with a warning instead of loading it", () => {
    const screenshot = seedEvidenceAttachment("step-1.png", "verification-screenshot");

    const model = resolveTicketAttachmentFiles(
      TICKET_ID,
      normalizeAttachments(getTicket(db, TICKET_ID).attachments as unknown[]),
      { maxInlineSizeBytes: 4 }
    );

    expect(model.attachments[0]!.fileStatus).toBe("oversized");
    expect(model.warnings.some((warning) => warning.includes("exceeds"))).toBe(true);
    expect(model.attachments[0]!.filename).toBe(screenshot.filename);
  });

  it("rejects unsafe stored filenames on every surface without crashing", () => {
    db.prepare("UPDATE tickets SET attachments = ? WHERE id = ?").run(
      JSON.stringify([
        {
          id: "evil-1",
          filename: "../../etc/passwd",
          type: "verification-screenshot",
          priority: "primary",
          uploadedBy: "claude ralph",
          uploadedAt: new Date().toISOString(),
        },
      ]),
      TICKET_ID
    );
    // Directory must exist for per-file resolution to run.
    seedEvidenceAttachment("safe.png", "verification-screenshot");

    const uiModel = readTicketAttachments(db, TICKET_ID);
    const mcpResult = loadTicketAttachments(
      TICKET_ID,
      getTicket(db, TICKET_ID).attachments as unknown[]
    );

    const unsafeEntry = uiModel.attachments.find((a) => a.filename === "../../etc/passwd");
    expect(unsafeEntry!.fileStatus).toBe("unsafe-filename");
    expect(unsafeEntry!.filePath).toBeNull();
    const expectedWarning = "Skipped unsafe attachment filename: ../../etc/passwd";
    expect(uiModel.warnings).toContain(expectedWarning);
    expect(mcpResult.warnings).toContain(expectedWarning);
    expect(mcpResult.telemetry.failedFiles).toContain("../../etc/passwd");
  });

  it("warns loudly when the attachments metadata column is corrupted JSON", () => {
    db.prepare("UPDATE tickets SET attachments = ? WHERE id = ?").run("{not json", TICKET_ID);

    const model = readTicketAttachments(db, TICKET_ID);

    expect(model.attachments).toEqual([]);
    expect(model.warnings).toContain(
      `Ticket attachments metadata is corrupted JSON and was ignored: ${TICKET_ID}`
    );
  });

  it("normalizes legacy string attachments identically for core reads and MCP loading", () => {
    const legacyDir = getTicketAttachmentsDirPath(TICKET_ID);
    // Legacy rows stored raw filename strings in the attachments column.
    db.prepare("UPDATE tickets SET attachments = ? WHERE id = ?").run(
      JSON.stringify(["legacy.png"]),
      TICKET_ID
    );
    // Materialize dir + file so the read resolves cleanly.
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, "legacy.png"), "legacy bytes");

    const cliTicket = getTicket(db, TICKET_ID);
    const uiModel = readTicketAttachments(db, TICKET_ID);
    const mcpResult = loadTicketAttachments(TICKET_ID, cliTicket.attachments as unknown[]);

    const cliEntry = normalizeAttachments(cliTicket.attachments as unknown[])[0]!;
    const uiEntry = uiModel.attachments[0]!;
    expect(cliEntry.type).toBe("reference");
    expect(cliEntry.uploadedBy).toBe("human");
    expect(uiEntry.type).toBe("reference");
    expect(uiEntry.uploadedBy).toBe("human");
    expect(uiEntry.fileStatus).toBe("ok");
    expect(mcpResult.telemetry.loadedCount).toBe(1);
    expect(mcpResult.telemetry.byType.reference).toBe(1);
  });
});
