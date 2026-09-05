import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import {
  resolveDockerDaemon,
  containerRunning,
  removeOwnedContainer,
} from "../epic-runner-docker.ts";

afterEach(() => vi.unstubAllEnvs());

it.skipIf(process.platform === "win32")(
  "pins context/config and refuses a different daemon during recovery",
  () => {
    const root = mkdtempSync(join(tmpdir(), "docker-selection-"));
    try {
      const docker = join(root, "docker");
      const log = join(root, "calls");
      writeFileSync(
        docker,
        `#!/bin/sh
printf '%s|%s|%s|%s\\n' "$DOCKER_CONTEXT" "$DOCKER_HOST" "$DOCKER_CONFIG" "$*" >> "$BRAIN_DOCKER_TEST_LOG"
case "$1" in
  context) echo tcp://daemon-b:2376;;
  info) echo daemon-b;;
  inspect) echo false;;
  rm) echo removed;;
esac
`,
        { mode: 0o700 }
      );
      vi.stubEnv("PATH", root);
      vi.stubEnv("DOCKER_CONTEXT", "context-b");
      vi.stubEnv("DOCKER_HOST", "tcp://daemon-a:2376");
      vi.stubEnv("DOCKER_CONFIG", root);
      vi.stubEnv("BRAIN_DOCKER_TEST_LOG", log);
      const daemon = resolveDockerDaemon("tcp://daemon-a:2376");
      expect(daemon).toMatchObject({
        id: "daemon-b",
        context: "context-b",
        host: null,
        endpoint: "tcp://daemon-b:2376",
        configDir: root,
      });
      vi.stubEnv("DOCKER_CONTEXT", "context-c");
      vi.stubEnv("DOCKER_HOST", "tcp://daemon-c:2376");
      vi.stubEnv("DOCKER_CONFIG", join(root, "other"));
      expect(containerRunning("ralph-test", daemon)).toBe(false);
      removeOwnedContainer("ralph-test", daemon);
      const calls = readFileSync(log, "utf8").trim().split("\n");
      expect(calls.every((line) => line.startsWith(`context-b||${root}|`))).toBe(true);
      expect(calls.some((line) => line.endsWith("rm --force ralph-test"))).toBe(true);
      writeFileSync(docker, "#!/bin/sh\necho different-daemon\n");
      expect(() => containerRunning("ralph-test", daemon)).toThrow(/different daemon/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
);
