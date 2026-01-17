/**
 * Docker availability messaging utilities.
 *
 * Provides user-friendly messages for Docker unavailability states.
 * Used by useDockerAvailability hook and UI components.
 */

import type { DockerStatus } from "./hooks";

/**
 * Get a user-friendly message explaining why Docker is unavailable.
 * Returns empty string if Docker is fully available.
 *
 * @param status - Docker status from getDockerStatus API
 * @returns Human-readable message for UI display
 */
export function getDockerUnavailableMessage(status: DockerStatus): string {
  if (!status.dockerAvailable) {
    return "Docker not installed";
  }
  if (!status.dockerRunning) {
    return "Docker not running - start Docker Desktop";
  }
  if (!status.imageBuilt) {
    return "Sandbox image not built - will build on first use";
  }
  return "";
}

/**
 * Get actionable help text for resolving Docker unavailability.
 * Returns null if Docker is available or no action is possible.
 *
 * @param status - Docker status from getDockerStatus API
 * @returns Actionable help text or null
 */
export function getDockerActionableHelp(status: DockerStatus): string | null {
  if (!status.dockerAvailable) {
    return "Install Docker from docker.com or use Lima/Colima";
  }
  if (!status.dockerRunning) {
    return "Run 'docker info' or start Docker Desktop";
  }
  return null;
}
