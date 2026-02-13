/**
 * Transfer commands: export-epic, export-project, import, preview.
 *
 * All operations are async because JSZip is promise-based.
 */

import { writeFileSync, readFileSync, statSync } from "fs";
import { resolve } from "path";
import {
  gatherEpicExportData,
  gatherProjectExportData,
  importData,
  createBrainDumpArchive,
  extractBrainDumpArchive,
  previewBrainDumpArchive,
  MAX_ARCHIVE_SIZE_BYTES,
  InvalidActionError,
  ArchiveTooLargeError,
} from "../../core/index.ts";
import type { ConflictResolution } from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag, optionalEnumFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["export-epic", "export-project", "import", "preview"];
const CONFLICT_MODES = ["create-new", "replace", "merge"] as const;

function defaultOutputPath(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}.braindump`;
}

async function handleExportEpic(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const epicId = requireFlag(flags, "epic");
  const { db } = getDb();

  const data = gatherEpicExportData(db, epicId);
  const outputPath = resolve(
    optionalFlag(flags, "output") ?? defaultOutputPath(data.manifest.epics[0]?.title ?? "export")
  );

  const zipBuffer = await createBrainDumpArchive(data);

  if (zipBuffer.length > MAX_ARCHIVE_SIZE_BYTES) {
    throw new ArchiveTooLargeError(zipBuffer.length, MAX_ARCHIVE_SIZE_BYTES);
  }

  writeFileSync(outputPath, zipBuffer);

  const result = {
    file: outputPath,
    sizeBytes: zipBuffer.length,
    exportType: data.manifest.exportType,
    epicCount: data.manifest.epics.length,
    ticketCount: data.manifest.tickets.length,
    commentCount: data.manifest.comments.length,
    findingCount: data.manifest.reviewFindings.length,
    attachmentCount: data.manifest.attachmentFiles.length,
  };

  if (pretty) {
    const sizeMB = (zipBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`\nExported epic to: ${outputPath}`);
    console.log(`  Size: ${sizeMB} MB`);
    console.log(`  Epics: ${result.epicCount}`);
    console.log(`  Tickets: ${result.ticketCount}`);
    console.log(`  Comments: ${result.commentCount}`);
    console.log(`  Findings: ${result.findingCount}`);
    console.log(`  Attachments: ${result.attachmentCount}\n`);
  } else {
    outputResult(result, false);
  }
}

async function handleExportProject(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const projectId = requireFlag(flags, "project");
  const { db } = getDb();

  const data = gatherProjectExportData(db, projectId);
  const outputPath = resolve(
    optionalFlag(flags, "output") ??
      defaultOutputPath(data.manifest.sourceProject.name ?? "project-export")
  );

  const zipBuffer = await createBrainDumpArchive(data);

  if (zipBuffer.length > MAX_ARCHIVE_SIZE_BYTES) {
    throw new ArchiveTooLargeError(zipBuffer.length, MAX_ARCHIVE_SIZE_BYTES);
  }

  writeFileSync(outputPath, zipBuffer);

  const result = {
    file: outputPath,
    sizeBytes: zipBuffer.length,
    exportType: data.manifest.exportType,
    epicCount: data.manifest.epics.length,
    ticketCount: data.manifest.tickets.length,
    commentCount: data.manifest.comments.length,
    findingCount: data.manifest.reviewFindings.length,
    attachmentCount: data.manifest.attachmentFiles.length,
  };

  if (pretty) {
    const sizeMB = (zipBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`\nExported project to: ${outputPath}`);
    console.log(`  Size: ${sizeMB} MB`);
    console.log(`  Epics: ${result.epicCount}`);
    console.log(`  Tickets: ${result.ticketCount}`);
    console.log(`  Comments: ${result.commentCount}`);
    console.log(`  Findings: ${result.findingCount}`);
    console.log(`  Attachments: ${result.attachmentCount}\n`);
  } else {
    outputResult(result, false);
  }
}

async function handleImport(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const filePath = resolve(requireFlag(flags, "file"));
  const targetProjectId = requireFlag(flags, "target-project");
  const resetStatuses = boolFlag(flags, "reset-statuses");
  const conflictResolution =
    optionalEnumFlag<ConflictResolution>(flags, "conflict", CONFLICT_MODES) ?? "create-new";
  const { db } = getDb();

  const stat = statSync(filePath);
  if (stat.size > MAX_ARCHIVE_SIZE_BYTES) {
    throw new ArchiveTooLargeError(stat.size, MAX_ARCHIVE_SIZE_BYTES);
  }

  const zipBuffer = readFileSync(filePath);
  const { manifest, attachmentBuffers } = await extractBrainDumpArchive(zipBuffer);

  const result = importData({
    db,
    manifest,
    attachmentBuffers,
    targetProjectId,
    resetStatuses,
    conflictResolution,
  });

  if (pretty) {
    console.log(`\nImported from: ${filePath}`);
    console.log(`  Epics: ${result.epicCount}`);
    console.log(`  Tickets: ${result.ticketCount}`);
    console.log(`  Comments: ${result.commentCount}`);
    console.log(`  Findings: ${result.findingCount}`);
    console.log(`  Attachments: ${result.attachmentCount}`);
    if (result.warnings.length > 0) {
      console.log(`\n  Warnings:`);
      for (const w of result.warnings) {
        console.log(`    - ${w}`);
      }
    }
    console.log();
  } else {
    outputResult(result, false);
  }
}

async function handlePreview(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const filePath = resolve(requireFlag(flags, "file"));

  const stat = statSync(filePath);
  if (stat.size > MAX_ARCHIVE_SIZE_BYTES) {
    throw new ArchiveTooLargeError(stat.size, MAX_ARCHIVE_SIZE_BYTES);
  }

  const zipBuffer = readFileSync(filePath);
  const preview = await previewBrainDumpArchive(zipBuffer);

  if (pretty) {
    console.log(`\nArchive Preview: ${filePath}`);
    console.log(`  Version: ${preview.version}`);
    console.log(`  Export Type: ${preview.exportType}`);
    console.log(`  Exported At: ${preview.exportedAt}`);
    console.log(`  Exported By: ${preview.exportedBy}`);
    console.log(`  App Version: ${preview.appVersion}`);
    console.log(`  Source Project: ${preview.sourceProject.name}`);
    console.log(`  Epics: ${preview.epicNames.join(", ") || "(none)"}`);
    console.log(`  Tickets: ${preview.ticketCount}`);
    console.log(`  Comments: ${preview.commentCount}`);
    console.log(`  Findings: ${preview.findingCount}`);
    console.log(`  Demo Scripts: ${preview.demoScriptCount}`);
    console.log(`  Attachments: ${preview.attachmentCount}\n`);
  } else {
    outputResult(preview, false);
  }
}

export async function handle(action: string, args: string[]): Promise<void> {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "transfer",
      ACTIONS,
      "Flags:\n" +
        "  --epic <id>              Epic ID (for export-epic)\n" +
        "  --project <id>           Project ID (for export-project)\n" +
        "  --output <path>          Output file path (for export)\n" +
        "  --file <path>            Input .braindump file (for import/preview)\n" +
        "  --target-project <id>    Target project ID (for import)\n" +
        "  --reset-statuses         Reset all imported tickets to backlog\n" +
        "  --conflict <mode>        Conflict resolution: create-new, replace, merge\n" +
        "  --pretty                 Human-readable output\n" +
        "\nExamples:\n" +
        "  brain-dump transfer export-epic --epic abc --pretty\n" +
        "  brain-dump transfer export-project --project abc --output my-project.braindump\n" +
        "  brain-dump transfer import --file export.braindump --target-project def\n" +
        "  brain-dump transfer preview --file export.braindump --pretty\n" +
        "\nBackward-compatible shortcuts:\n" +
        "  brain-dump export --epic abc\n" +
        "  brain-dump import --file export.braindump --target-project def"
    );
  }

  try {
    switch (action) {
      case "export-epic":
        await handleExportEpic(args);
        break;
      case "export-project":
        await handleExportProject(args);
        break;
      case "import":
        await handleImport(args);
        break;
      case "preview":
        await handlePreview(args);
        break;
      default:
        throw new InvalidActionError("transfer", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
