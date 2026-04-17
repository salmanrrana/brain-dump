/**
 * CLI launch wiring tests.
 *
 * Verifies that `brain-dump workflow launch-ticket` and `launch-epic` translate
 * their flags into the correct input object for the shared launcher core —
 * without actually spawning a terminal or editor. The core modules are mocked
 * so we observe exactly what the CLI handler would hand them in production.
 *
 * Complements `cli/__tests__/cli-integration.test.ts`, which spawns the CLI as
 * a subprocess; here we test in-process to inspect arguments.
 */

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_PROVIDERS } from "../lib/provider-translation.ts";

const { launchTicketSpy, launchEpicSpy } = vi.hoisted(() => ({
  launchTicketSpy: vi.fn(),
  launchEpicSpy: vi.fn(),
}));

vi.mock("../../src/lib/ralph-launch/launch-ticket.ts", () => ({
  launchRalphForTicketCore: launchTicketSpy,
}));

vi.mock("../../src/lib/ralph-launch/launch-epic.ts", () => ({
  launchRalphForEpicCore: launchEpicSpy,
}));

vi.mock("../lib/db.ts", () => {
  const db = new Database(":memory:");
  return {
    getDb: () => ({ db, dbPath: ":memory:" }),
  };
});

interface LauncherCall {
  db: unknown;
  input: Record<string, unknown>;
}

function lastCall(spy: typeof launchTicketSpy): LauncherCall {
  const calls = spy.mock.calls;
  if (calls.length === 0) {
    throw new Error("launcher spy was never called");
  }
  const [db, input] = calls[calls.length - 1]!;
  return { db, input: input as Record<string, unknown> };
}

let logSpy: ReturnType<typeof vi.fn>;
let errSpy: ReturnType<typeof vi.fn>;
let exitSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  launchTicketSpy.mockReset();
  launchEpicSpy.mockReset();
  launchTicketSpy.mockResolvedValue({
    success: true,
    message: "Launched",
    launchMethod: "terminal",
    terminalUsed: "ghostty",
  });
  launchEpicSpy.mockResolvedValue({
    success: true,
    message: "Epic launched",
    launchMethod: "terminal",
    terminalUsed: "ghostty",
  });
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {}) as unknown as ReturnType<
    typeof vi.fn
  >;
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {}) as unknown as ReturnType<
    typeof vi.fn
  >;
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0}) called in test`);
  }) as never) as unknown as ReturnType<typeof vi.fn>;
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

describe("workflow launch-ticket CLI → launcher core wiring", () => {
  for (const provider of SUPPORTED_PROVIDERS) {
    it(`forwards --provider ${provider} to launchRalphForTicketCore with the correct backend mapping`, async () => {
      const { handle } = await import("../commands/workflow.ts");
      await handle("launch-ticket", ["--ticket", "ticket-123", "--provider", provider]);

      expect(launchTicketSpy).toHaveBeenCalledTimes(1);
      expect(launchEpicSpy).not.toHaveBeenCalled();
      const { input } = lastCall(launchTicketSpy);
      expect(input.ticketId).toBe("ticket-123");

      switch (provider) {
        case "claude-code":
          expect(input.aiBackend).toBe("claude");
          expect(input.workingMethodOverride).toBeUndefined();
          break;
        case "opencode":
          expect(input.aiBackend).toBe("opencode");
          expect(input.workingMethodOverride).toBeUndefined();
          break;
        case "codex":
          expect(input.aiBackend).toBe("codex");
          expect(input.workingMethodOverride).toBeUndefined();
          break;
        case "cursor-agent":
          expect(input.aiBackend).toBe("cursor-agent");
          expect(input.workingMethodOverride).toBeUndefined();
          break;
        case "vscode":
          expect(input.aiBackend).toBe("claude");
          expect(input.workingMethodOverride).toBe("vscode");
          break;
        case "cursor":
          expect(input.aiBackend).toBe("claude");
          expect(input.workingMethodOverride).toBe("cursor");
          break;
        case "copilot-cli":
          expect(input.aiBackend).toBe("claude");
          expect(input.workingMethodOverride).toBe("copilot-cli");
          break;
      }
    });
  }

  it("forwards --max-iterations, --terminal, --sandbox to launchRalphForTicketCore", async () => {
    const { handle } = await import("../commands/workflow.ts");
    await handle("launch-ticket", [
      "--ticket",
      "ticket-flags",
      "--max-iterations",
      "7",
      "--terminal",
      "kitty",
      "--sandbox",
    ]);

    expect(launchTicketSpy).toHaveBeenCalledTimes(1);
    const { input } = lastCall(launchTicketSpy);
    expect(input).toMatchObject({
      ticketId: "ticket-flags",
      maxIterations: 7,
      preferredTerminal: "kitty",
      useSandbox: true,
    });
  });

  it("prints a JSON result with the provider name so downstream tools can log which backend ran", async () => {
    const { handle } = await import("../commands/workflow.ts");
    await handle("launch-ticket", ["--ticket", "ticket-json", "--provider", "copilot-cli"]);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = (logSpy.mock.calls[0]?.[0] ?? "") as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      success: true,
      provider: "copilot-cli",
    });
  });

  it("exits with code 1 and still surfaces the failure message when the core returns success=false", async () => {
    launchTicketSpy.mockResolvedValueOnce({
      success: false,
      message: "Ticket not found",
    });

    const { handle } = await import("../commands/workflow.ts");
    await expect(
      handle("launch-ticket", ["--ticket", "ticket-missing", "--provider", "claude-code"])
    ).rejects.toThrow(/process\.exit\(1\)/);

    const output = (logSpy.mock.calls[0]?.[0] ?? "") as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      success: false,
      message: "Ticket not found",
      provider: "claude-code",
    });
  });
});

describe("workflow launch-epic CLI → launcher core wiring", () => {
  it("forwards --epic + provider mapping to launchRalphForEpicCore", async () => {
    const { handle } = await import("../commands/workflow.ts");
    await handle("launch-epic", [
      "--epic",
      "epic-1",
      "--provider",
      "vscode",
      "--max-iterations",
      "20",
    ]);

    expect(launchEpicSpy).toHaveBeenCalledTimes(1);
    expect(launchTicketSpy).not.toHaveBeenCalled();
    const { input } = lastCall(launchEpicSpy);
    expect(input).toMatchObject({
      epicId: "epic-1",
      aiBackend: "claude",
      workingMethodOverride: "vscode",
      maxIterations: 20,
    });
  });

  it("omits provider-derived fields when --provider is not passed (project default applies downstream)", async () => {
    const { handle } = await import("../commands/workflow.ts");
    await handle("launch-epic", ["--epic", "epic-default"]);

    expect(launchEpicSpy).toHaveBeenCalledTimes(1);
    const { input } = lastCall(launchEpicSpy);
    expect(input.epicId).toBe("epic-default");
    expect(input.aiBackend).toBeUndefined();
    expect(input.workingMethodOverride).toBeUndefined();
  });
});
