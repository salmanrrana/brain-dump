/**
 * API for reading service discovery files from projects.
 *
 * This module provides server functions for reading `.ralph-services.json`
 * files that Ralph creates when starting dev servers in Docker containers.
 *
 * @see src/lib/service-discovery.ts for TypeScript types
 */

import { createServerFn } from "@tanstack/react-start";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import type { RalphServicesFile, RalphService, ServiceStatus } from "../lib/service-discovery";
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
      const parsed = safeJsonParse<RalphServicesFile | { __parseError: true }>(content, {
        __parseError: true,
      });

      if ("__parseError" in parsed) {
        // Log with content preview for debugging malformed service files
        const contentPreview = content.length > 100 ? content.slice(0, 100) + "..." : content;
        console.error(
          `[services] Malformed JSON in ${servicesFile}. Content preview: ${contentPreview}`
        );
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
      const parsed = safeJsonParse<RalphServicesFile | { __parseError: true }>(content, {
        __parseError: true,
      });

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

/**
 * Input validator for service update operations.
 */
interface UpdateServiceInput {
  projectPath: string;
  serviceName: string;
  servicePort: number;
}

function validateUpdateServiceInput(data: UpdateServiceInput): UpdateServiceInput {
  if (!data.projectPath || typeof data.projectPath !== "string") {
    throw new Error("projectPath is required and must be a string");
  }
  if (!data.serviceName || typeof data.serviceName !== "string") {
    throw new Error("serviceName is required and must be a string");
  }
  if (typeof data.servicePort !== "number" || data.servicePort <= 0) {
    throw new Error("servicePort is required and must be a positive number");
  }
  return data;
}

/**
 * Helper to read the services file and return parsed content.
 * Returns null if file doesn't exist or is invalid.
 */
function readServicesFile(projectPath: string): RalphServicesFile | null {
  const servicesFile = join(projectPath, SERVICES_FILENAME);

  if (!existsSync(servicesFile)) {
    return null;
  }

  try {
    const content = readFileSync(servicesFile, "utf-8");
    const parsed = safeJsonParse<RalphServicesFile | { __parseError: true }>(content, {
      __parseError: true,
    });

    if ("__parseError" in parsed || !Array.isArray(parsed.services)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Helper to write the services file.
 */
function writeServicesFile(projectPath: string, data: RalphServicesFile): void {
  const servicesFile = join(projectPath, SERVICES_FILENAME);
  writeFileSync(servicesFile, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Update a service's status in the services file.
 *
 * @param projectPath - Absolute path to the project root
 * @param serviceName - Name of the service to update
 * @param servicePort - Port of the service (used for identification)
 * @param newStatus - New status to set
 * @returns Updated service info or error
 */
export const updateServiceStatus = createServerFn({ method: "POST" })
  .inputValidator((data: UpdateServiceInput & { newStatus: ServiceStatus }) => {
    const validated = validateUpdateServiceInput(data);
    if (!["running", "stopped", "starting", "error"].includes(data.newStatus)) {
      throw new Error("newStatus must be a valid ServiceStatus");
    }
    return { ...validated, newStatus: data.newStatus };
  })
  .handler(
    async ({ data }): Promise<{ success: boolean; service?: RalphService; error?: string }> => {
      const { projectPath, serviceName, servicePort, newStatus } = data;

      // Check if project path exists
      if (!existsSync(projectPath)) {
        return { success: false, error: "Project path does not exist" };
      }

      const servicesData = readServicesFile(projectPath);

      if (!servicesData) {
        return { success: false, error: "Services file not found or invalid" };
      }

      // Find the service by name and port
      const service = servicesData.services.find(
        (s) => s.name === serviceName && s.port === servicePort
      );

      if (!service) {
        return { success: false, error: `Service "${serviceName}:${servicePort}" not found` };
      }

      // Update the service status
      service.status = newStatus;
      servicesData.updatedAt = new Date().toISOString();

      try {
        writeServicesFile(projectPath, servicesData);
        return { success: true, service };
      } catch (error) {
        console.error(`[services] Error writing services file:`, error);
        return { success: false, error: "Failed to write services file" };
      }
    }
  );

/**
 * Start a service (set status to "running").
 *
 * Note: This only updates the status in .ralph-services.json.
 * The actual service process must be started separately.
 *
 * @param projectPath - Absolute path to the project root
 * @param serviceName - Name of the service to start
 * @param servicePort - Port of the service
 * @returns Updated service info or error
 */
export const startService = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateServiceInput)
  .handler(
    async ({ data }): Promise<{ success: boolean; service?: RalphService; error?: string }> => {
      const { projectPath, serviceName, servicePort } = data;

      // Check if project path exists
      if (!existsSync(projectPath)) {
        return { success: false, error: "Project path does not exist" };
      }

      const servicesData = readServicesFile(projectPath);

      if (!servicesData) {
        return { success: false, error: "Services file not found or invalid" };
      }

      // Find the service by name and port
      const service = servicesData.services.find(
        (s) => s.name === serviceName && s.port === servicePort
      );

      if (!service) {
        return { success: false, error: `Service "${serviceName}:${servicePort}" not found` };
      }

      // Check if already running
      if (service.status === "running") {
        return { success: true, service };
      }

      // Update status to running with new start time
      service.status = "running";
      service.startedAt = new Date().toISOString();
      servicesData.updatedAt = new Date().toISOString();

      try {
        writeServicesFile(projectPath, servicesData);
        return { success: true, service };
      } catch (error) {
        console.error(`[services] Error starting service:`, error);
        return { success: false, error: "Failed to update services file" };
      }
    }
  );

/**
 * Stop a service (set status to "stopped").
 *
 * Note: This only updates the status in .ralph-services.json.
 * The actual service process must be stopped separately.
 *
 * @param projectPath - Absolute path to the project root
 * @param serviceName - Name of the service to stop
 * @param servicePort - Port of the service
 * @returns Updated service info or error
 */
export const stopService = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateServiceInput)
  .handler(
    async ({ data }): Promise<{ success: boolean; service?: RalphService; error?: string }> => {
      const { projectPath, serviceName, servicePort } = data;

      // Check if project path exists
      if (!existsSync(projectPath)) {
        return { success: false, error: "Project path does not exist" };
      }

      const servicesData = readServicesFile(projectPath);

      if (!servicesData) {
        return { success: false, error: "Services file not found or invalid" };
      }

      // Find the service by name and port
      const service = servicesData.services.find(
        (s) => s.name === serviceName && s.port === servicePort
      );

      if (!service) {
        return { success: false, error: `Service "${serviceName}:${servicePort}" not found` };
      }

      // Check if already stopped
      if (service.status === "stopped") {
        return { success: true, service };
      }

      // Update status to stopped
      service.status = "stopped";
      servicesData.updatedAt = new Date().toISOString();

      try {
        writeServicesFile(projectPath, servicesData);
        return { success: true, service };
      } catch (error) {
        console.error(`[services] Error stopping service:`, error);
        return { success: false, error: "Failed to update services file" };
      }
    }
  );

/**
 * Stop all running services in a project.
 *
 * After stopping all services, deletes the .ralph-services.json file
 * to prevent stale data from appearing in the UI.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Count of services stopped or error
 */
export const stopAllServices = createServerFn({ method: "POST" })
  .inputValidator(validateProjectPath)
  .handler(
    async ({ data }): Promise<{ success: boolean; stoppedCount: number; error?: string }> => {
      const { projectPath } = data;

      // Check if project path exists
      if (!existsSync(projectPath)) {
        return { success: false, stoppedCount: 0, error: "Project path does not exist" };
      }

      const servicesFile = join(projectPath, SERVICES_FILENAME);

      // If file doesn't exist, nothing to stop
      if (!existsSync(servicesFile)) {
        return { success: true, stoppedCount: 0 };
      }

      const servicesData = readServicesFile(projectPath);

      if (!servicesData) {
        return { success: false, stoppedCount: 0, error: "Services file not found or invalid" };
      }

      // Count running services
      const stoppedCount = servicesData.services.filter((s) => s.status === "running").length;

      if (stoppedCount === 0) {
        // No running services, but file exists - clean it up
        try {
          unlinkSync(servicesFile);
          console.log(`[services] Cleaned up stale services file: ${servicesFile}`);
        } catch {
          // Ignore deletion errors
        }
        return { success: true, stoppedCount: 0 };
      }

      // Delete the services file to clean up
      // (no point keeping a file with all stopped services)
      try {
        unlinkSync(servicesFile);
        console.log(`[services] Deleted services file after stopping ${stoppedCount} services`);
        return { success: true, stoppedCount };
      } catch (error) {
        console.error(`[services] Error deleting services file:`, error);
        return { success: false, stoppedCount: 0, error: "Failed to clean up services file" };
      }
    }
  );

// =============================================================================
// DOCKER CONTAINER LOGS
// =============================================================================

/**
 * List running Ralph containers.
 *
 * Ralph containers are named "ralph-{session-id}" and run the brain-dump-ralph-sandbox image.
 *
 * @returns Array of Ralph container info
 */
export const listRalphContainers = createServerFn({ method: "GET" }).handler(async () => {
  const { listContainers } = await import("./docker-utils");

  const containers = await listContainers("ralph-");

  // Filter to only include containers running our sandbox image
  return containers.filter(
    (c) => c.image === "brain-dump-ralph-sandbox:latest" || c.name.startsWith("ralph-")
  );
});

/**
 * Get logs from a Ralph container.
 *
 * @param containerName - Name of the Ralph container
 * @param since - Optional timestamp to get logs since
 * @returns Log content and container status
 */
export const getRalphContainerLogs = createServerFn({ method: "GET" })
  .inputValidator((data: { containerName: string; since?: string; tail?: number }) => {
    if (!data.containerName || typeof data.containerName !== "string") {
      throw new Error("containerName is required and must be a string");
    }
    return data;
  })
  .handler(
    async ({
      data,
    }): Promise<{
      logs: string;
      containerRunning: boolean;
      error?: string;
    }> => {
      const { containerName, since, tail = 500 } = data;
      const { getContainerLogs } = await import("./docker-utils");

      try {
        const result = await getContainerLogs(containerName, {
          tail,
          ...(since ? { since } : {}),
          timestamps: false,
        });
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
          logs: "",
          containerRunning: false,
          error: errorMessage,
        };
      }
    }
  );
