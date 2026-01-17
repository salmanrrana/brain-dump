/**
 * Unit tests for Docker availability messaging utilities.
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (what message is displayed)
 * - Test different unavailability scenarios users might encounter
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect } from "vitest";
import { getDockerUnavailableMessage, getDockerActionableHelp } from "./docker-messages";
import type { DockerStatus } from "./hooks";

// Helper to create a DockerStatus with defaults
function createDockerStatus(overrides: Partial<DockerStatus> = {}): DockerStatus {
  return {
    dockerAvailable: true,
    dockerRunning: true,
    imageBuilt: true,
    imageTag: "brain-dump-ralph-sandbox:latest",
    runtimeType: "docker-desktop",
    socketPath: "/var/run/docker.sock",
    ...overrides,
  };
}

describe("getDockerUnavailableMessage", () => {
  it("returns empty string when Docker is fully available", () => {
    const status = createDockerStatus();
    expect(getDockerUnavailableMessage(status)).toBe("");
  });

  it("returns 'Docker not installed' when Docker is not available", () => {
    const status = createDockerStatus({ dockerAvailable: false });
    expect(getDockerUnavailableMessage(status)).toBe("Docker not installed");
  });

  it("returns 'Docker not running' message when daemon is stopped", () => {
    const status = createDockerStatus({ dockerAvailable: true, dockerRunning: false });
    expect(getDockerUnavailableMessage(status)).toBe("Docker not running - start Docker Desktop");
  });

  it("returns 'Sandbox image not built' when image is missing", () => {
    const status = createDockerStatus({
      dockerAvailable: true,
      dockerRunning: true,
      imageBuilt: false,
    });
    expect(getDockerUnavailableMessage(status)).toBe(
      "Sandbox image not built - will build on first use"
    );
  });

  it("prioritizes 'not installed' over 'not running'", () => {
    // When Docker is not installed, don't confuse user by saying it's not running
    const status = createDockerStatus({ dockerAvailable: false, dockerRunning: false });
    expect(getDockerUnavailableMessage(status)).toBe("Docker not installed");
  });

  it("prioritizes 'not running' over 'image not built'", () => {
    // When Docker is not running, don't tell user to build image
    const status = createDockerStatus({ dockerRunning: false, imageBuilt: false });
    expect(getDockerUnavailableMessage(status)).toBe("Docker not running - start Docker Desktop");
  });
});

describe("getDockerActionableHelp", () => {
  it("returns null when Docker is fully available", () => {
    const status = createDockerStatus();
    expect(getDockerActionableHelp(status)).toBeNull();
  });

  it("suggests installation when Docker is not available", () => {
    const status = createDockerStatus({ dockerAvailable: false });
    expect(getDockerActionableHelp(status)).toBe(
      "Install Docker from docker.com or use Lima/Colima"
    );
  });

  it("suggests starting Docker when daemon is not running", () => {
    const status = createDockerStatus({ dockerRunning: false });
    expect(getDockerActionableHelp(status)).toBe("Run 'docker info' or start Docker Desktop");
  });

  it("returns null when only image is missing (auto-builds on first use)", () => {
    // Image not built doesn't need actionable help - it builds automatically
    const status = createDockerStatus({ imageBuilt: false });
    expect(getDockerActionableHelp(status)).toBeNull();
  });

  it("prioritizes installation help over running help", () => {
    const status = createDockerStatus({ dockerAvailable: false, dockerRunning: false });
    expect(getDockerActionableHelp(status)).toBe(
      "Install Docker from docker.com or use Lima/Colima"
    );
  });
});
