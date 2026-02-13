import { describe, it, expect } from "vitest";
import {
  createBrainDumpArchive,
  extractBrainDumpArchive,
  previewBrainDumpArchive,
} from "../transfer-zip.ts";
import { InvalidArchiveError } from "../errors.ts";
import type { BrainDumpManifest, ExportResult } from "../transfer-types.ts";
import { MANIFEST_VERSION } from "../transfer-types.ts";

function buildTestExportData(overrides: Partial<BrainDumpManifest> = {}): ExportResult {
  const manifest: BrainDumpManifest = {
    version: MANIFEST_VERSION,
    exportType: "epic",
    exportedAt: new Date().toISOString(),
    exportedBy: "testuser",
    appVersion: "1.0.0",
    sourceProject: { name: "Test Project" },
    epics: [
      {
        id: "epic-1",
        title: "Test Epic",
        description: "Desc",
        color: "#ff0000",
        createdAt: new Date().toISOString(),
      },
    ],
    tickets: [
      {
        id: "ticket-1",
        title: "Test Ticket",
        description: "Ticket desc",
        status: "backlog",
        priority: "medium",
        position: 1,
        epicId: "epic-1",
        tags: ["test"],
        subtasks: [],
        isBlocked: false,
        blockedReason: null,
        attachments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
      },
    ],
    comments: [
      {
        id: "comment-1",
        ticketId: "ticket-1",
        content: "A test comment",
        author: "claude",
        type: "comment",
        createdAt: new Date().toISOString(),
      },
    ],
    reviewFindings: [],
    demoScripts: [],
    workflowStates: [],
    epicWorkflowStates: [],
    attachmentFiles: [],
    ...overrides,
  };

  return { manifest, attachmentBuffers: new Map() };
}

// ============================================
// Zip Round-trip
// ============================================

describe("zip round-trip", () => {
  it("creates a zip and extracts it back with matching manifest", async () => {
    const exportData = buildTestExportData();
    const zipBuffer = await createBrainDumpArchive(exportData);

    expect(zipBuffer).toBeInstanceOf(Buffer);
    expect(zipBuffer.length).toBeGreaterThan(0);

    const { manifest, attachmentBuffers } = await extractBrainDumpArchive(zipBuffer);

    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.exportType).toBe("epic");
    expect(manifest.exportedBy).toBe("testuser");
    expect(manifest.sourceProject.name).toBe("Test Project");
    expect(manifest.epics).toHaveLength(1);
    expect(manifest.epics[0]!.title).toBe("Test Epic");
    expect(manifest.tickets).toHaveLength(1);
    expect(manifest.tickets[0]!.title).toBe("Test Ticket");
    expect(manifest.comments).toHaveLength(1);
    expect(attachmentBuffers.size).toBe(0);
  });

  it("preserves attachment binary data through round-trip", async () => {
    const attachmentData = Buffer.from("Hello, this is attachment content! 🎉", "utf-8");
    const exportData = buildTestExportData({
      attachmentFiles: [
        {
          archivePath: "attachments/ticket-1/test-file.txt",
          originalTicketId: "ticket-1",
          filename: "test-file.txt",
        },
      ],
    });
    exportData.attachmentBuffers.set("attachments/ticket-1/test-file.txt", attachmentData);

    const zipBuffer = await createBrainDumpArchive(exportData);
    const { attachmentBuffers } = await extractBrainDumpArchive(zipBuffer);

    expect(attachmentBuffers.size).toBe(1);
    const extracted = attachmentBuffers.get("attachments/ticket-1/test-file.txt");
    expect(extracted).toBeDefined();
    expect(extracted!.equals(attachmentData)).toBe(true);
  });

  it("preserves binary attachment data (non-text)", async () => {
    // Create a buffer with random binary data
    const binaryData = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) binaryData[i] = i;

    const exportData = buildTestExportData({
      attachmentFiles: [
        {
          archivePath: "attachments/ticket-1/binary.bin",
          originalTicketId: "ticket-1",
          filename: "binary.bin",
        },
      ],
    });
    exportData.attachmentBuffers.set("attachments/ticket-1/binary.bin", binaryData);

    const zipBuffer = await createBrainDumpArchive(exportData);
    const { attachmentBuffers } = await extractBrainDumpArchive(zipBuffer);

    const extracted = attachmentBuffers.get("attachments/ticket-1/binary.bin");
    expect(extracted).toBeDefined();
    expect(extracted!.equals(binaryData)).toBe(true);
  });
});

// ============================================
// Invalid Archives
// ============================================

describe("invalid archives", () => {
  it("rejects non-zip data with InvalidArchiveError", async () => {
    const garbage = Buffer.from("this is not a zip file at all");

    await expect(extractBrainDumpArchive(garbage)).rejects.toThrow(InvalidArchiveError);
    await expect(extractBrainDumpArchive(garbage)).rejects.toThrow("not a valid zip archive");
  });

  it("rejects zip without manifest.json", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("random.txt", "no manifest here");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await expect(extractBrainDumpArchive(buffer)).rejects.toThrow(InvalidArchiveError);
    await expect(extractBrainDumpArchive(buffer)).rejects.toThrow("missing manifest.json");
  });

  it("rejects zip with invalid JSON manifest", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("manifest.json", "{ this is not valid json");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await expect(extractBrainDumpArchive(buffer)).rejects.toThrow(InvalidArchiveError);
    await expect(extractBrainDumpArchive(buffer)).rejects.toThrow("corrupted");
  });

  it("rejects zip with wrong manifest version", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ version: 999, exportType: "epic" }));
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await expect(extractBrainDumpArchive(buffer)).rejects.toThrow(InvalidArchiveError);
    await expect(extractBrainDumpArchive(buffer)).rejects.toThrow("Incompatible manifest version");
  });
});

// ============================================
// Preview
// ============================================

describe("previewBrainDumpArchive", () => {
  it("returns summary without extracting attachments", async () => {
    const exportData = buildTestExportData({
      attachmentFiles: [
        {
          archivePath: "attachments/ticket-1/file.txt",
          originalTicketId: "ticket-1",
          filename: "file.txt",
        },
      ],
    });
    exportData.attachmentBuffers.set("attachments/ticket-1/file.txt", Buffer.from("data"));

    const zipBuffer = await createBrainDumpArchive(exportData);
    const preview = await previewBrainDumpArchive(zipBuffer);

    expect(preview.version).toBe(MANIFEST_VERSION);
    expect(preview.exportType).toBe("epic");
    expect(preview.exportedBy).toBe("testuser");
    expect(preview.sourceProject.name).toBe("Test Project");
    expect(preview.epicNames).toEqual(["Test Epic"]);
    expect(preview.ticketCount).toBe(1);
    expect(preview.commentCount).toBe(1);
    expect(preview.findingCount).toBe(0);
    expect(preview.demoScriptCount).toBe(0);
    expect(preview.attachmentCount).toBe(1);
  });

  it("rejects invalid zip on preview", async () => {
    const garbage = Buffer.from("garbage data");
    await expect(previewBrainDumpArchive(garbage)).rejects.toThrow(InvalidArchiveError);
  });

  it("rejects wrong version on preview", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ version: 42, exportType: "epic" }));
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await expect(previewBrainDumpArchive(buffer)).rejects.toThrow(InvalidArchiveError);
    await expect(previewBrainDumpArchive(buffer)).rejects.toThrow("Incompatible manifest version");
  });
});
