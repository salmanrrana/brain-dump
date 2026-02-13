/**
 * Thin JSZip adapter for Brain Dump .braindump archives.
 *
 * Handles zip creation, extraction, and preview.
 * The actual business logic lives in transfer.ts.
 */

import JSZip from "jszip";
import type { BrainDumpManifest, ExportResult, ManifestPreview } from "./transfer-types.ts";
import { MANIFEST_VERSION } from "./transfer-types.ts";
import { InvalidArchiveError } from "./errors.ts";

/**
 * Create a .braindump zip archive from export data.
 */
export async function createBrainDumpArchive(data: ExportResult): Promise<Buffer> {
  const zip = new JSZip();

  // Add manifest
  zip.file("manifest.json", JSON.stringify(data.manifest, null, 2));

  // Add attachment files
  for (const [archivePath, buffer] of data.attachmentBuffers) {
    zip.file(archivePath, buffer);
  }

  const result = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return result;
}

/**
 * Extract a .braindump zip archive into manifest + attachment buffers.
 */
export async function extractBrainDumpArchive(
  zipBuffer: Buffer
): Promise<{ manifest: BrainDumpManifest; attachmentBuffers: Map<string, Buffer> }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    throw new InvalidArchiveError("File is not a valid zip archive.");
  }

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new InvalidArchiveError("Archive is missing manifest.json. Not a valid .braindump file.");
  }

  let manifest: BrainDumpManifest;
  try {
    const manifestText = await manifestFile.async("text");
    manifest = JSON.parse(manifestText);
  } catch {
    throw new InvalidArchiveError("manifest.json is corrupted or not valid JSON.");
  }

  if (manifest.version !== MANIFEST_VERSION) {
    throw new InvalidArchiveError(
      `Incompatible manifest version: ${manifest.version}. This Brain Dump supports version ${MANIFEST_VERSION}. Please upgrade Brain Dump.`
    );
  }

  // Extract attachment buffers
  const attachmentBuffers = new Map<string, Buffer>();
  for (const [path, file] of Object.entries(zip.files)) {
    if (path.startsWith("attachments/") && !file.dir) {
      const buffer = await file.async("nodebuffer");
      attachmentBuffers.set(path, buffer);
    }
  }

  return { manifest, attachmentBuffers };
}

/**
 * Preview a .braindump archive by reading only the manifest.
 * Fast operation — does not extract attachments.
 */
export async function previewBrainDumpArchive(zipBuffer: Buffer): Promise<ManifestPreview> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    throw new InvalidArchiveError("File is not a valid zip archive.");
  }

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new InvalidArchiveError("Archive is missing manifest.json. Not a valid .braindump file.");
  }

  let manifest: BrainDumpManifest;
  try {
    const manifestText = await manifestFile.async("text");
    manifest = JSON.parse(manifestText);
  } catch {
    throw new InvalidArchiveError("manifest.json is corrupted or not valid JSON.");
  }

  if (manifest.version !== MANIFEST_VERSION) {
    throw new InvalidArchiveError(
      `Incompatible manifest version: ${manifest.version}. This Brain Dump supports version ${MANIFEST_VERSION}. Please upgrade Brain Dump.`
    );
  }

  return {
    version: manifest.version,
    exportType: manifest.exportType,
    exportedAt: manifest.exportedAt,
    exportedBy: manifest.exportedBy,
    appVersion: manifest.appVersion,
    sourceProject: manifest.sourceProject,
    epicNames: manifest.epics.map((e) => e.title),
    ticketCount: manifest.tickets.length,
    commentCount: manifest.comments.length,
    findingCount: manifest.reviewFindings.length,
    demoScriptCount: manifest.demoScripts.length,
    attachmentCount: manifest.attachmentFiles.length,
  };
}
