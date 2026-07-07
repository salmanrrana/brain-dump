import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  assertUserWritableAttachmentMetadata,
  normalizeUserWritableAttachmentFilenames,
  writeAttachmentFromFile,
} from "../attachments.ts";
import { normalizeAttachments } from "../attachment-types.ts";
import { addVerificationReportComment, listComments } from "../comment.ts";
import { updateAttachmentMetadata } from "../ticket.ts";

let db: Database.Database;
let tempDir: string;
let previousXdgDataHome: string | undefined;

function seedProject(id = "proj-1") {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    "Test Project",
    tempDir,
    new Date().toISOString()
  );
}

function seedTicket(id = "ticket-1") {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, attachments, created_at, updated_at)
     VALUES (?, ?, 'ai_verification', 'medium', 1, 'proj-1', NULL, ?, ?)`
  ).run(id, "Verify ticket", now, now);
}

beforeEach(() => {
  previousXdgDataHome = process.env.XDG_DATA_HOME;
  tempDir = mkdtempSync(join(tmpdir(), "brain-dump-attachments-"));
  process.env.XDG_DATA_HOME = tempDir;
  db = createTestDatabase().db;
  seedProject();
  seedTicket();
});

afterEach(() => {
  if (previousXdgDataHome === undefined) {
    delete process.env.XDG_DATA_HOME;
  } else {
    process.env.XDG_DATA_HOME = previousXdgDataHome;
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe("core attachment evidence writes", () => {
  it("copies evidence into the XDG attachment directory and records provider Ralph attribution", () => {
    const sourceFile = join(tempDir, "step 1.png");
    writeFileSync(sourceFile, "fake screenshot");

    const attachment = writeAttachmentFromFile(db, {
      ticketId: "ticket-1",
      filePath: sourceFile,
      metadata: {
        type: "verification-screenshot",
        provider: "claude",
        description: "Step 1 screenshot",
      },
    });

    const storedFile = join(tempDir, "brain-dump", "attachments", "ticket-1", attachment.filename);
    expect(existsSync(storedFile)).toBe(true);
    expect(readFileSync(storedFile, "utf-8")).toBe("fake screenshot");
    expect(attachment.type).toBe("verification-screenshot");
    expect(attachment.uploadedBy).toBe("claude ralph");

    const row = db.prepare("SELECT attachments FROM tickets WHERE id = 'ticket-1'").get() as {
      attachments: string;
    };
    const attachments = normalizeAttachments(row.attachments);
    expect(attachments).toMatchObject([
      {
        id: attachment.id,
        filename: attachment.filename,
        uploadedBy: "claude ralph",
      },
    ]);
  });

  it("normalizes legacy Ralph uploader strings on read", () => {
    const attachments = normalizeAttachments([
      { id: "old-1", filename: "api.json", uploadedBy: "ralph:codex", type: "api-evidence" },
      { id: "old-2", filename: "legacy.png", uploadedBy: "ralph", type: "bug-screenshot" },
    ]);

    expect(attachments[0]!.uploadedBy).toBe("codex ralph");
    expect(attachments[1]!.uploadedBy).toBe("ralph");
  });

  it("rejects runner-only evidence metadata from user-writable paths", () => {
    expect(() => assertUserWritableAttachmentMetadata({ type: "verification-screenshot" })).toThrow(
      /runner-only/
    );
    expect(() => assertUserWritableAttachmentMetadata({ uploadedBy: "claude ralph" })).toThrow(
      /server-controlled/
    );
    expect(() => assertUserWritableAttachmentMetadata({ uploadedBy: "ralph:codex" })).toThrow(
      /server-controlled/
    );
  });

  it("rejects structured attachment metadata when creating user tickets", () => {
    expect(normalizeUserWritableAttachmentFilenames(["pending.png"])).toEqual(["pending.png"]);
    expect(() =>
      normalizeUserWritableAttachmentFilenames([
        { filename: "manifest.json", type: "verification-manifest", uploadedBy: "claude ralph" },
      ])
    ).toThrow(/pending attachment filename/);
  });

  it("rejects verification evidence types in attachment metadata updates", () => {
    const sourceFile = join(tempDir, "notes.txt");
    writeFileSync(sourceFile, "reference notes");
    const attachment = writeAttachmentFromFile(db, {
      ticketId: "ticket-1",
      filePath: sourceFile,
      metadata: { type: "reference" },
    });

    expect(() =>
      updateAttachmentMetadata(db, "ticket-1", attachment.id, {
        type: "api-evidence",
      })
    ).toThrow(/runner-only/);
  });

  it("rejects metadata updates on existing runner evidence attachments", () => {
    const sourceFile = join(tempDir, "manifest.json");
    writeFileSync(sourceFile, "{}");
    const attachment = writeAttachmentFromFile(db, {
      ticketId: "ticket-1",
      filePath: sourceFile,
      metadata: { type: "verification-manifest", provider: "claude" },
    });

    expect(() =>
      updateAttachmentMetadata(db, "ticket-1", attachment.id, {
        description: "edited outside runner",
      })
    ).toThrow(/runner-only/);
  });
});

describe("verification report comments", () => {
  it("stores exactly one verification_report comment per run with provider Ralph author", () => {
    addVerificationReportComment(db, {
      ticketId: "ticket-1",
      provider: "opencode",
      runId: "run-1",
      status: "passed",
      integrityStatus: "valid",
      manifestAttachmentId: "manifest-1",
      steps: [
        {
          order: 1,
          status: "passed",
          coverage: ["criterion:1", "subtask:ui-audit"],
          actual: "API assertions passed.",
        },
      ],
    });
    addVerificationReportComment(db, {
      ticketId: "ticket-1",
      provider: "opencode",
      runId: "run-1",
      status: "failed",
      integrityStatus: "uncertified",
      steps: [
        {
          order: 1,
          status: "failed",
          coverage: ["criterion:1", "subtask:ui-audit"],
          actual: "expected status 200, got 500",
        },
      ],
    });

    const reports = listComments(db, "ticket-1").filter(
      (comment) => comment.type === "verification_report"
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.author).toBe("opencode ralph");
    expect(reports[0]!.content).toContain("<!-- verification-run:run-1 -->");
    expect(reports[0]!.content).toContain("expected status 200, got 500");
    expect(reports[0]!.content).toContain("criterion:1, subtask:ui-audit");
    expect(reports[0]!.content).toContain("| Step | Status | Coverage | Result | Evidence |");
  });
});
