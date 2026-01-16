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
import { SERVICES_FILENAME, EMPTY_SERVICES_FILE } from "../lib/service-discovery";
import { safeJsonParse } from "../lib/utils";

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
  .inputValidator((data: { projectPath: string }) => {
    if (!data.projectPath || typeof data.projectPath !== "string") {
      throw new Error("projectPath is required and must be a string");
    }
    return data;
  })
  .handler(async ({ data }): Promise<RalphServicesFile> => {
    const { projectPath } = data;

    // Check if project path exists
    if (!existsSync(projectPath)) {
      console.log(`[services] Project path does not exist: ${projectPath}`);
      return { ...EMPTY_SERVICES_FILE, updatedAt: new Date().toISOString() };
    }

    const servicesFile = join(projectPath, SERVICES_FILENAME);

    // Check if services file exists
    if (!existsSync(servicesFile)) {
      // This is normal - file only exists when Ralph has started dev servers
      return { ...EMPTY_SERVICES_FILE, updatedAt: new Date().toISOString() };
    }

    try {
      const content = readFileSync(servicesFile, "utf-8");

      // Use safeJsonParse to handle malformed JSON gracefully
      // We use a sentinel value to detect parse failures
      const emptyResult = { ...EMPTY_SERVICES_FILE, updatedAt: new Date().toISOString() };
      const parsed = safeJsonParse<RalphServicesFile | { __parseError: true }>(content, { __parseError: true });

      if ("__parseError" in parsed) {
        console.warn(`[services] Malformed JSON in ${servicesFile}`);
        return emptyResult;
      }

      // Validate the structure has the expected shape
      if (!Array.isArray(parsed.services)) {
        console.warn(`[services] Invalid structure in ${servicesFile}: services is not an array`);
        return { ...EMPTY_SERVICES_FILE, updatedAt: new Date().toISOString() };
      }

      return parsed;
    } catch (error) {
      // Handle file read errors (permissions, etc.)
      console.error(`[services] Error reading ${servicesFile}:`, error);
      return { ...EMPTY_SERVICES_FILE, updatedAt: new Date().toISOString() };
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
  .inputValidator((data: { projectPath: string }) => {
    if (!data.projectPath || typeof data.projectPath !== "string") {
      throw new Error("projectPath is required and must be a string");
    }
    return data;
  })
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
    } catch {
      return { hasServices: false, count: 0 };
    }
  });
