/**
 * Integration tests for Ralph Docker sandbox functionality.
 *
 * These tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior, not implementation details
 * - Use real functions where possible, mock only at boundaries
 * - Tests should break when user-facing behavior breaks
 *
 * Note: execSync is used here for test assertions only with hardcoded commands.
 * This is safe because tests don't process untrusted user input.
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

// Import the function we're testing
// Note: We test the generated script output, not internal implementation
import { generateRalphScript } from "./ralph";

describe("Ralph Docker Sandbox", () => {
  const testProjectPath = join(tmpdir(), "ralph-docker-test");

  beforeAll(() => {
    // Create a test project directory
    if (!existsSync(testProjectPath)) {
      mkdirSync(testProjectPath, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup
    rmSync(testProjectPath, { recursive: true, force: true });
  });

  describe("generateRalphScript with Docker sandbox", () => {
    it("generates script with correct Claude config mounts for macOS", () => {
      // This tests what users will experience: the generated script has correct mounts
      const script = generateRalphScript(
        testProjectPath,
        5, // maxIterations
        true, // useSandbox
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600, // timeoutSeconds
        "unix:///Users/test/.lima/docker/sock/docker.sock" // dockerHostEnv
      );

      // Verify the script uses bash arrays for mounts (user-facing behavior)
      expect(script).toContain("EXTRA_MOUNTS=()");

      // Verify it checks for ~/.claude/ directory
      expect(script).toContain('if [ -d "$HOME/.claude" ]');
      expect(script).toContain("EXTRA_MOUNTS+=(-v");
      expect(script).toContain("/.claude:/home/ralph/.claude:ro");

      // Verify it checks for ~/.claude.json file
      expect(script).toContain('if [ -f "$HOME/.claude.json" ]');
      expect(script).toContain("/.claude.json:/home/ralph/.claude.json:ro");

      // Verify fallback for Linux XDG path
      expect(script).toContain('if [ "$CLAUDE_CONFIG_FOUND" = "false" ]');
      expect(script).toContain("/.config/claude-code:/home/ralph/.config/claude-code:ro");

      // Verify docker run uses the array correctly
      expect(script).toContain('"${EXTRA_MOUNTS[@]}"');
    });

    it("generates script with DOCKER_HOST export when non-default socket", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        true,
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        "unix:///Users/test/.lima/docker/sock/docker.sock"
      );

      // User expects DOCKER_HOST to be set for Lima/Colima
      expect(script).toContain(
        'export DOCKER_HOST="unix:///Users/test/.lima/docker/sock/docker.sock"'
      );
    });

    it("does not include DOCKER_HOST when using default socket", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        true,
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        null // No custom docker host
      );

      // When no custom socket, DOCKER_HOST shouldn't be set
      expect(script).not.toContain("export DOCKER_HOST=");
    });

    it("generates native script without Docker mounts", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        false, // NOT using sandbox
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        null
      );

      // Native mode shouldn't have Docker-specific code
      expect(script).not.toContain("EXTRA_MOUNTS");
      expect(script).not.toContain("docker run");
      expect(script).toContain("claude --dangerously-skip-permissions");
    });

    it("includes SSH agent forwarding setup", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        true,
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        null
      );

      // Users need SSH forwarding for git operations
      expect(script).toContain("SSH_AUTH_SOCK");
      expect(script).toContain("SSH_MOUNT_ARGS");
    });

    it("includes cleanup of .ralph-services.json on exit", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        true,
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        null
      );

      // Cleanup prevents stale service data in UI
      expect(script).toContain(".ralph-services.json");
      expect(script).toContain("rm -f");
    });
  });

  describe("Docker mount syntax validation", () => {
    it("generated script has valid bash syntax", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        true,
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        "unix:///test/docker.sock"
      );

      // Write to temp file and check syntax
      const scriptPath = join(testProjectPath, "test-script.sh");
      writeFileSync(scriptPath, script);

      // Use bash -n for syntax check (doesn't execute)
      // Safe: uses hardcoded path, no user input
      try {
        execSync(`bash -n "${scriptPath}"`, { encoding: "utf-8" });
      } catch (error) {
        const err = error as { stderr?: string; message?: string };
        throw new Error(
          `Script has invalid bash syntax: ${err.stderr || err.message || "Unknown error"}`
        );
      }
    });
  });
});

describe("Docker availability integration", () => {
  // These tests check if Docker is actually available on the system
  // They're skipped in CI where Docker might not be installed

  const isDockerAvailable = (): boolean => {
    try {
      // Safe: hardcoded command with no user input
      execSync("docker version", { encoding: "utf-8", stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  };

  it.skipIf(!isDockerAvailable())("can run a simple Docker container with Lima socket", () => {
    // This tests real Docker functionality
    // Safe: hardcoded command with no user input
    const result = execSync(`docker run --rm alpine:latest echo "Docker works"`, {
      encoding: "utf-8",
    });
    expect(result.trim()).toBe("Docker works");
  });

  it.skipIf(!isDockerAvailable())("ralph-net Docker network exists or can be created", () => {
    // Ensure the network exists
    // Safe: hardcoded commands with no user input
    try {
      execSync("docker network inspect ralph-net", { stdio: "pipe" });
    } catch {
      // Create if doesn't exist
      execSync("docker network create ralph-net");
    }

    // Verify it exists now
    const networks = execSync("docker network ls --format '{{.Name}}'", {
      encoding: "utf-8",
    });
    expect(networks).toContain("ralph-net");
  });
});
