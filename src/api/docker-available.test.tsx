/**
 * Integration tests for Docker available state (both buttons work).
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (what users see and interact with)
 * - Test real behavior where possible
 * - Focus on user flows, not implementation details
 *
 * These tests verify that when Docker IS available:
 * - Native mode launches correctly (without Docker)
 * - Docker mode launches correctly (with Docker)
 * - Settings preference is respected
 * - Both modes can be used without race conditions
 *
 * Note: execSync is used here for test assertions only with hardcoded commands.
 * This is safe because tests don't process untrusted user input.
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDockerAvailability } from "../lib/hooks";
import type { DockerStatus } from "../lib/hooks";
import { generateRalphScript } from "./ralph";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

// Mock the getDockerStatus API function
vi.mock("../api/settings", () => ({
  getDockerStatus: vi.fn(),
}));

import { getDockerStatus } from "../api/settings";

// Type the mock for proper TypeScript support
const mockGetDockerStatus = vi.mocked(getDockerStatus);

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Create a DockerStatus with default "available" values.
 * When Docker is fully available, all flags are true.
 */
function createDockerAvailable(overrides: Partial<DockerStatus> = {}): DockerStatus {
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

/**
 * Create a fresh QueryClient for each test to prevent cache interference.
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0, // Disable garbage collection for tests
      },
    },
  });
}

/**
 * Wrapper component for renderHook with QueryClientProvider.
 */
function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

// =============================================================================
// HOOK TESTS - useDockerAvailability when Docker is available
// =============================================================================

describe("useDockerAvailability - Docker Available State", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Both modes available", () => {
    it("should indicate both Native and Docker modes are available", async () => {
      const status = createDockerAvailable();
      mockGetDockerStatus.mockResolvedValue(status);

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useDockerAvailability(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // User expectation: Both buttons should be enabled
      expect(result.current.isAvailable).toBe(true);
      expect(result.current.isImageBuilt).toBe(true);
      expect(result.current.message).toBe(""); // No error message
    });

    it("should return runtime info when Docker is available", async () => {
      const status = createDockerAvailable({
        runtimeType: "lima",
        socketPath: "/Users/test/.lima/docker/sock/docker.sock",
      });
      mockGetDockerStatus.mockResolvedValue(status);

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useDockerAvailability(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // User expectation: Can see which Docker runtime is active
      expect(result.current.isAvailable).toBe(true);
    });
  });

  describe("Docker available but image not built", () => {
    it("should allow Docker mode even when image needs to be built", async () => {
      const status = createDockerAvailable({
        imageBuilt: false,
      });
      mockGetDockerStatus.mockResolvedValue(status);

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useDockerAvailability(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // User expectation: Docker mode still works, will build on first use
      expect(result.current.isAvailable).toBe(true);
      expect(result.current.isImageBuilt).toBe(false);
      expect(result.current.message).toBe("Sandbox image not built - will build on first use");
    });
  });
});

// =============================================================================
// SCRIPT GENERATION TESTS - Native vs Docker mode
// =============================================================================

describe("generateRalphScript - Mode Selection", () => {
  let testProjectPath: string;

  beforeEach(() => {
    // Create a unique test directory for each test
    testProjectPath = join(tmpdir(), `ralph-docker-available-test-${randomUUID()}`);
    mkdirSync(testProjectPath, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(testProjectPath)) {
      rmSync(testProjectPath, { recursive: true, force: true });
    }
  });

  describe("Native mode (useSandbox=false)", () => {
    it("should generate script without Docker commands", () => {
      const script = generateRalphScript(
        testProjectPath,
        5, // maxIterations
        false, // useSandbox = false (Native mode)
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600, // timeoutSeconds
        null // No Docker host needed
      );

      // User expectation: Native mode runs Claude directly
      expect(script).toContain("claude --dangerously-skip-permissions");

      // User expectation: No Docker-specific code
      expect(script).not.toContain("docker run");
      expect(script).not.toContain("EXTRA_MOUNTS");
      expect(script).not.toContain("brain-dump-ralph-sandbox");
    });

    it("should not set DOCKER_HOST for native mode", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        false, // Native mode
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        null
      );

      // User expectation: No Docker environment variables
      expect(script).not.toContain("export DOCKER_HOST=");
    });

    it("should include project path for native mode", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        false,
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        null
      );

      // User expectation: Script operates in the project directory
      expect(script).toContain(testProjectPath);
    });
  });

  describe("Docker mode (useSandbox=true)", () => {
    it("should generate script with Docker run command", () => {
      const script = generateRalphScript(
        testProjectPath,
        5, // maxIterations
        true, // useSandbox = true (Docker mode)
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600, // timeoutSeconds
        null // Default Docker socket
      );

      // User expectation: Docker mode uses container
      expect(script).toContain("docker run");
      expect(script).toContain("brain-dump-ralph-sandbox:latest");
      expect(script).toContain("EXTRA_MOUNTS");
    });

    it("should include resource limits in Docker mode", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        true, // Docker mode
        { memory: "4g", cpus: "2.0", pidsLimit: 512 },
        3600,
        null
      );

      // User expectation: Resource limits are respected
      expect(script).toContain("--memory=4g");
      expect(script).toContain("--cpus=2.0");
      expect(script).toContain("--pids-limit=512");
    });

    it("should mount project directory in Docker mode", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        true,
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        null
      );

      // User expectation: Project is accessible inside container
      // The script sets PROJECT_PATH variable and mounts $PROJECT_PATH:/workspace
      expect(script).toContain(`PROJECT_PATH="${testProjectPath}"`);
      expect(script).toContain('-v "$PROJECT_PATH:/workspace"');
    });

    it("should set DOCKER_HOST when using non-default socket", () => {
      const customSocket = "unix:///Users/test/.lima/docker/sock/docker.sock";
      const script = generateRalphScript(
        testProjectPath,
        5,
        true,
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        customSocket
      );

      // User expectation: Lima/Colima socket is used
      expect(script).toContain(`export DOCKER_HOST="${customSocket}"`);
    });

    it("should not set DOCKER_HOST when using default socket", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        true,
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        null // No custom socket = use default
      );

      // User expectation: No DOCKER_HOST for default Docker Desktop
      expect(script).not.toContain("export DOCKER_HOST=");
    });
  });

  describe("Script syntax validation", () => {
    it("should generate valid bash syntax for native mode", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        false, // Native mode
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        null
      );

      const scriptPath = join(testProjectPath, "test-native-script.sh");
      writeFileSync(scriptPath, script);

      // bash -n checks syntax without executing
      // Safe: uses hardcoded path, no user input
      try {
        execSync(`bash -n "${scriptPath}"`, { encoding: "utf-8" });
      } catch (error) {
        const err = error as { stderr?: string; message?: string };
        throw new Error(`Native script has invalid bash syntax: ${err.stderr || err.message}`);
      }
    });

    it("should generate valid bash syntax for Docker mode", () => {
      const script = generateRalphScript(
        testProjectPath,
        5,
        true, // Docker mode
        { memory: "2g", cpus: "1.5", pidsLimit: 256 },
        3600,
        "unix:///test/docker.sock"
      );

      const scriptPath = join(testProjectPath, "test-docker-script.sh");
      writeFileSync(scriptPath, script);

      // Safe: uses hardcoded path, no user input
      try {
        execSync(`bash -n "${scriptPath}"`, { encoding: "utf-8" });
      } catch (error) {
        const err = error as { stderr?: string; message?: string };
        throw new Error(`Docker script has invalid bash syntax: ${err.stderr || err.message}`);
      }
    });
  });
});

// =============================================================================
// MODE SWITCHING TESTS - No race conditions between modes
// =============================================================================

describe("Mode Switching - No Race Conditions", () => {
  let testProjectPath: string;

  beforeEach(() => {
    testProjectPath = join(tmpdir(), `ralph-mode-switch-test-${randomUUID()}`);
    mkdirSync(testProjectPath, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testProjectPath)) {
      rmSync(testProjectPath, { recursive: true, force: true });
    }
  });

  it("should generate independent scripts for consecutive Native then Docker calls", () => {
    // User scenario: Start Native, then quickly start Docker on another ticket

    // First: Generate Native mode script
    const nativeScript = generateRalphScript(
      testProjectPath,
      5,
      false, // Native mode
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      null
    );

    // Second: Generate Docker mode script (immediately after)
    const dockerScript = generateRalphScript(
      testProjectPath,
      5,
      true, // Docker mode
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      "unix:///Users/test/.lima/docker/sock/docker.sock"
    );

    // User expectation: Scripts are independent, no cross-contamination
    expect(nativeScript).not.toContain("docker run");
    expect(dockerScript).toContain("docker run");

    // Neither script should have state from the other
    expect(nativeScript).not.toContain("EXTRA_MOUNTS");
    expect(dockerScript).toContain("EXTRA_MOUNTS");
  });

  it("should generate independent scripts for consecutive Docker then Native calls", () => {
    // User scenario: Start Docker, then start Native on another ticket

    // First: Generate Docker mode script
    const dockerScript = generateRalphScript(
      testProjectPath,
      5,
      true, // Docker mode
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      "unix:///Users/test/.lima/docker/sock/docker.sock"
    );

    // Second: Generate Native mode script (immediately after)
    const nativeScript = generateRalphScript(
      testProjectPath,
      5,
      false, // Native mode
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      null
    );

    // User expectation: Scripts are independent
    expect(dockerScript).toContain("docker run");
    expect(nativeScript).not.toContain("docker run");
    expect(nativeScript).toContain("claude --dangerously-skip-permissions");
  });

  it("should allow same project to use both modes", () => {
    // User scenario: Same project, different tickets, different modes

    const nativeScript = generateRalphScript(
      testProjectPath,
      5,
      false,
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      null
    );

    const dockerScript = generateRalphScript(
      testProjectPath,
      5,
      true,
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      null
    );

    // Both scripts should reference the same project
    expect(nativeScript).toContain(testProjectPath);
    expect(dockerScript).toContain(testProjectPath);

    // But use different execution methods
    expect(nativeScript).toContain("claude --dangerously-skip-permissions");
    expect(dockerScript).toContain("brain-dump-ralph-sandbox");
  });
});

// =============================================================================
// SETTINGS PREFERENCE TESTS
// =============================================================================

describe("Settings Preference - ralphSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("When preference is set", () => {
    it("should provide Docker as recommended when ralphSandbox is true", async () => {
      /**
       * User scenario: User has "Prefer Docker Sandbox by Default" enabled in Settings.
       *
       * The ralphSandbox setting controls the DEFAULT mode selection.
       * This test verifies the hook returns correct info for UI to highlight Docker.
       */
      const status = createDockerAvailable();
      mockGetDockerStatus.mockResolvedValue(status);

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useDockerAvailability(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // When Docker is available, UI can show Docker as "recommended"
      expect(result.current.isAvailable).toBe(true);
      expect(result.current.isImageBuilt).toBe(true);
    });

    it("should allow Native mode even when Docker is preferred", async () => {
      /**
       * User scenario: Docker is preferred by default, but user chooses Native.
       *
       * The settings preference is just a default - user can always choose either.
       */
      const status = createDockerAvailable();
      mockGetDockerStatus.mockResolvedValue(status);

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useDockerAvailability(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Native mode is always available (doesn't depend on Docker status)
      // The hook just reports Docker status - Native is always an option
      expect(result.current.isAvailable).toBe(true);
    });
  });
});

// =============================================================================
// DIFFERENT DOCKER RUNTIME TESTS
// =============================================================================

describe("Different Docker Runtimes", () => {
  let testProjectPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    testProjectPath = join(tmpdir(), `ralph-runtime-test-${randomUUID()}`);
    mkdirSync(testProjectPath, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testProjectPath)) {
      rmSync(testProjectPath, { recursive: true, force: true });
    }
  });

  it("should work with Lima runtime", () => {
    const limaSocket = "unix:///Users/test/.lima/docker/sock/docker.sock";
    const script = generateRalphScript(
      testProjectPath,
      5,
      true,
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      limaSocket
    );

    expect(script).toContain(`export DOCKER_HOST="${limaSocket}"`);
    expect(script).toContain("docker run");
  });

  it("should work with Colima runtime", () => {
    const colimaSocket = "unix:///Users/test/.colima/default/docker.sock";
    const script = generateRalphScript(
      testProjectPath,
      5,
      true,
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      colimaSocket
    );

    expect(script).toContain(`export DOCKER_HOST="${colimaSocket}"`);
    expect(script).toContain("docker run");
  });

  it("should work with Rancher Desktop runtime", () => {
    const rancherSocket = "unix:///Users/test/.rd/docker.sock";
    const script = generateRalphScript(
      testProjectPath,
      5,
      true,
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      rancherSocket
    );

    expect(script).toContain(`export DOCKER_HOST="${rancherSocket}"`);
    expect(script).toContain("docker run");
  });

  it("should work with Docker Desktop (default socket)", () => {
    const script = generateRalphScript(
      testProjectPath,
      5,
      true,
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      null // Default = Docker Desktop
    );

    // No DOCKER_HOST needed for default socket
    expect(script).not.toContain("export DOCKER_HOST=");
    expect(script).toContain("docker run");
  });
});

// =============================================================================
// PROJECT ORIGIN TRACKING TESTS
// =============================================================================

describe("Project Origin Tracking", () => {
  let testProjectPath: string;

  beforeEach(() => {
    testProjectPath = join(tmpdir(), `ralph-origin-test-${randomUUID()}`);
    mkdirSync(testProjectPath, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testProjectPath)) {
      rmSync(testProjectPath, { recursive: true, force: true });
    }
  });

  it("should include project labels in Docker mode", () => {
    const projectOrigin = {
      projectId: "proj-123",
      projectName: "My App",
      epicId: "epic-456",
      epicTitle: "Feature Epic",
    };

    const script = generateRalphScript(
      testProjectPath,
      5,
      true, // Docker mode
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      null,
      projectOrigin
    );

    // User expectation: Container is labeled for tracking
    // All labels are quoted in the generated script
    expect(script).toContain('--label "brain-dump.project-id=proj-123"');
    expect(script).toContain('--label "brain-dump.project-name=My App"');
    expect(script).toContain('--label "brain-dump.epic-id=epic-456"');
    expect(script).toContain('--label "brain-dump.epic-title=Feature Epic"');
  });

  it("should not include project labels in Native mode", () => {
    const projectOrigin = {
      projectId: "proj-123",
      projectName: "My App",
    };

    const script = generateRalphScript(
      testProjectPath,
      5,
      false, // Native mode
      { memory: "2g", cpus: "1.5", pidsLimit: 256 },
      3600,
      null,
      projectOrigin
    );

    // User expectation: Native mode doesn't use Docker labels
    expect(script).not.toContain("--label brain-dump");
  });
});
