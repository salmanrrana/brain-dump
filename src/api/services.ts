/**
 * API for reading service discovery files from projects.
 *
 * This module provides server functions for reading `.ralph-services.json`
 * files that Ralph creates when starting dev servers in Docker containers.
 *
 * @see src/lib/service-discovery.ts for TypeScript types
 */

import { createServerFn } from "@tanstack/react-start";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { RalphServicesFile } from "../lib/service-discovery";
import { SERVICES_FILENAME, createEmptyServicesFile } from "../lib/service-discovery";
import { safeJsonParse } from "../lib/utils";

/**
 * Shared input validator for projectPath parameter.
 * Validates that projectPath is a non-empty string.
 */
function validateProjectPath(data: { projectPath: string }): { projectPath: string } {
  if (!data.projectPath || typeof data.projectPath !== "string") {
    throw new Error("projectPath is required and must be a string");
  }
  return data;
}

/**
 * Read the service discovery file from a project.
 *
 * Returns an empty services array if:
 * - The file doesn't exist
 * - The file is malformed JSON
 * - The project path is invalid
 *
 * @param projectPath - Absolute path to the project root
 * @returns The parsed services file, or an empty services array on error
 */
export const getProjectServices = createServerFn({ method: "GET" })
  .inputValidator(validateProjectPath)
  .handler(async ({ data }): Promise<RalphServicesFile> => {
    const { projectPath } = data;

    // Check if project path exists
    if (!existsSync(projectPath)) {
      console.log(`[services] Project path does not exist: ${projectPath}`);
      return createEmptyServicesFile();
    }

    const servicesFile = join(projectPath, SERVICES_FILENAME);

    // Check if services file exists
    if (!existsSync(servicesFile)) {
      // This is normal - file only exists when Ralph has started dev servers
      return createEmptyServicesFile();
    }

    try {
      const content = readFileSync(servicesFile, "utf-8");

      // Use safeJsonParse to handle malformed JSON gracefully
      // We use a sentinel value to detect parse failures
      const parsed = safeJsonParse<RalphServicesFile | { __parseError: true }>(content, { __parseError: true });

      if ("__parseError" in parsed) {
        // Log with content preview for debugging malformed service files
        const contentPreview = content.length > 100 ? content.slice(0, 100) + "..." : content;
        console.error(`[services] Malformed JSON in ${servicesFile}. Content preview: ${contentPreview}`);
        return createEmptyServicesFile();
      }

      // Validate the structure has the expected shape
      if (!Array.isArray(parsed.services)) {
        console.warn(`[services] Invalid structure in ${servicesFile}: services is not an array`);
        return createEmptyServicesFile();
      }

      return parsed;
    } catch (error) {
      // Handle file read errors (permissions, etc.)
      console.error(`[services] Error reading ${servicesFile}:`, error);
      return createEmptyServicesFile();
    }
  });

/**
 * Check if a project has any running services.
 *
 * This is a convenience function for quick checks without fetching full details.
 *
 * @param projectPath - Absolute path to the project root
 * @returns true if the project has at least one running service
 */
export const hasRunningServices = createServerFn({ method: "GET" })
  .inputValidator(validateProjectPath)
  .handler(async ({ data }): Promise<{ hasServices: boolean; count: number }> => {
    const { projectPath } = data;
    const servicesFile = join(projectPath, SERVICES_FILENAME);

    if (!existsSync(servicesFile)) {
      return { hasServices: false, count: 0 };
    }

    try {
      const content = readFileSync(servicesFile, "utf-8");
      const parsed = safeJsonParse<RalphServicesFile | { __parseError: true }>(content, { __parseError: true });

      if ("__parseError" in parsed || !Array.isArray(parsed.services)) {
        return { hasServices: false, count: 0 };
      }

      // Only count services with "running" status
      const runningServices = parsed.services.filter((s) => s.status === "running");
      return {
        hasServices: runningServices.length > 0,
        count: runningServices.length,
      };
    } catch (error) {
      console.error(`[services] Error checking for running services in ${servicesFile}:`, error);
      return { hasServices: false, count: 0 };
    }
  });
