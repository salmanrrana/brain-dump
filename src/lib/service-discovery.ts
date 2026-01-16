/**
 * Service Discovery Schema for Ralph
 *
 * This module defines the TypeScript types for `.ralph-services.json`,
 * a file that Ralph uses to report which services/ports are running
 * in a Docker container.
 *
 * Brain Dump UI reads this file to display clickable links to running
 * dev servers (e.g., Vite at localhost:8100).
 *
 * @file Location: `/workspace/.ralph-services.json` (in project root)
 * @see docs/docker-git-push.md for port conventions
 */

/**
 * Type of service for categorization and icon display.
 */
export type ServiceType = "frontend" | "backend" | "storybook" | "docs" | "database" | "other";

/**
 * Service status indicating whether the service is currently active.
 */
export type ServiceStatus = "running" | "stopped" | "starting" | "error";

/**
 * Represents a single running service reported by Ralph.
 *
 * @example
 * ```json
 * {
 *   "name": "vite-dev-server",
 *   "type": "frontend",
 *   "port": 8100,
 *   "status": "running",
 *   "healthEndpoint": "/",
 *   "startedAt": "2024-01-15T10:30:00Z"
 * }
 * ```
 */
export interface RalphService {
  /**
   * Human-readable name of the service (e.g., "vite-dev-server", "express-api").
   */
  name: string;

  /**
   * Category of the service for UI display purposes.
   *
   * Port conventions by type:
   * - frontend: 8100-8110 (Vite, Next.js, React)
   * - backend: 8200-8210 (Express, Fastify, NestJS)
   * - storybook/docs: 8300-8310 (Storybook, Docusaurus)
   * - database: 8400-8410 (PostgreSQL GUI, Redis Commander)
   */
  type: ServiceType;

  /**
   * Port number the service is listening on.
   * Must be within the exposed Docker port ranges (8100-8410).
   */
  port: number;

  /**
   * Current status of the service.
   */
  status: ServiceStatus;

  /**
   * Optional endpoint for health checks (e.g., "/", "/health", "/api/health").
   * Used by Brain Dump UI to verify the service is responding.
   */
  healthEndpoint?: string;

  /**
   * ISO 8601 timestamp of when the service was started.
   */
  startedAt?: string;

  /**
   * Optional description or additional context about the service.
   */
  description?: string;
}

/**
 * Root schema for `.ralph-services.json` file.
 *
 * This file is created and updated by Ralph when starting/stopping dev servers.
 * Brain Dump UI polls this file to display service links in the TicketModal.
 *
 * @example
 * ```json
 * {
 *   "services": [
 *     {
 *       "name": "vite-dev-server",
 *       "type": "frontend",
 *       "port": 8100,
 *       "status": "running",
 *       "healthEndpoint": "/",
 *       "startedAt": "2024-01-15T10:30:00Z"
 *     },
 *     {
 *       "name": "express-api",
 *       "type": "backend",
 *       "port": 8200,
 *       "status": "running",
 *       "healthEndpoint": "/health"
 *     }
 *   ],
 *   "updatedAt": "2024-01-15T10:35:00Z"
 * }
 * ```
 */
export interface RalphServicesFile {
  /**
   * List of services currently running or recently stopped.
   */
  services: RalphService[];

  /**
   * ISO 8601 timestamp of when this file was last updated.
   */
  updatedAt: string;
}

/**
 * Default empty services file for initialization.
 */
export const EMPTY_SERVICES_FILE: RalphServicesFile = {
  services: [],
  updatedAt: new Date().toISOString(),
};

/**
 * The filename for service discovery (relative to project root).
 */
export const SERVICES_FILENAME = ".ralph-services.json";

/**
 * Port ranges by service type, matching Docker port exposure.
 * @see src/api/ralph.ts for Docker port mapping
 */
export const PORT_RANGES: Record<Exclude<ServiceType, "other">, { min: number; max: number }> = {
  frontend: { min: 8100, max: 8110 },
  backend: { min: 8200, max: 8210 },
  storybook: { min: 8300, max: 8310 },
  docs: { min: 8300, max: 8310 },
  database: { min: 8400, max: 8410 },
};

/**
 * Get the recommended port range for a service type.
 */
export function getPortRangeForType(type: ServiceType): { min: number; max: number } | null {
  if (type === "other") return null;
  return PORT_RANGES[type];
}

/**
 * Infer service type from port number.
 */
export function inferTypeFromPort(port: number): ServiceType {
  if (port >= 8100 && port <= 8110) return "frontend";
  if (port >= 8200 && port <= 8210) return "backend";
  if (port >= 8300 && port <= 8310) return "storybook"; // or docs
  if (port >= 8400 && port <= 8410) return "database";
  return "other";
}

/**
 * Validate that a port is within the allowed Docker port ranges.
 */
export function isValidServicePort(port: number): boolean {
  return (port >= 8100 && port <= 8110) ||
         (port >= 8200 && port <= 8210) ||
         (port >= 8300 && port <= 8310) ||
         (port >= 8400 && port <= 8410);
}
