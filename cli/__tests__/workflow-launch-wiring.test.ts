/**
 * CLI launch wiring tests.
 *
 * Verifies that `brain-dump workflow launch-ticket` and `launch-epic` translate
 * their flags into the correct input object for the shared launcher core —
 * without actually spawning a terminal or editor. The core modules are mocked
 * so we observe exactly what the CLI handler would hand them in production.
 *
 * Complements:
 * - `cli/lib/provider-translation.test.ts` — exhaustive unit tests of the
 *   provider → (aiBackend, workingMethodOverride) mapping table.
 * - `cli/__tests__/cli-integration.test.ts` — subprocess-based tests that cover
 *   ValidationError paths (missing flags, unknown --provider) and JSON exit
 *   shapes. Here we only test in-process argument wiring.
 */

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

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

function inputOf(spy: typeof launchTicketSpy): Record<string, unknown> {
  const call = spy.mock.calls.at(-1);
  if (!call) throw new Error("launcher spy was never called");
  return call[1] as Record<string, unknown>;
}

let logSpy: MockInstance;
let exitSpy: MockInstance;

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
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0}) called in test`);
  }) as never);
});

afterEach(() => {
  logSpy.mockRestore();
  exitSpy.mockRestore();
});

describe("workflow launch-ticket CLI → launcher core wiring", () => {
  // Representative cases: native backends, including Pi's working-method
  // override, plus an editor override. Full mapping coverage lives in
  // cli/lib/provider-translation.test.ts.
  it.each([
    {
      provider: "claude-code",
      expected: { aiBackend: "claude", workingMethodOverride: undefined },
    },
    {
      provider: "pi",
      expected: { aiBackend: "pi", workingMethodOverride: "pi" },
    },
    {
      provider: "vscode",
      expected: { aiBackend: "claude", workingMethodOverride: "vscode" },
    },
  ] as const)(
    "forwards --provider $provider through translateProvider into launchRalphForTicketCore",
    async ({ provider, expected }) => {
      const { handle } = await import("../commands/workflow.ts");
      await handle("launch-ticket", ["--ticket", "ticket-123", "--provider", provider]);

      expect(launchTicketSpy).toHaveBeenCalledTimes(1);
      expect(launchEpicSpy).not.toHaveBeenCalled();
      const input = inputOf(launchTicketSpy);
      expect(input.ticketId).toBe("ticket-123");
      expect(input.aiBackend).toBe(expected.aiBackend);
      expect(input.workingMethodOverride).toBe(expected.workingMethodOverride);
    }
  );

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
    expect(inputOf(launchTicketSpy)).toMatchObject({
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
  it.each([
    {
      provider: "pi",
      expected: { aiBackend: "pi", workingMethodOverride: "pi" },
    },
    {
      provider: "vscode",
      expected: { aiBackend: "claude", workingMethodOverride: "vscode" },
    },
  ] as const)(
    "forwards --epic + --provider $provider mapping to launchRalphForEpicCore",
    async ({ provider, expected }) => {
      const { handle } = await import("../commands/workflow.ts");
      await handle("launch-epic", [
        "--epic",
        "epic-1",
        "--provider",
        provider,
        "--max-iterations",
        "20",
      ]);

      expect(launchEpicSpy).toHaveBeenCalledTimes(1);
      expect(launchTicketSpy).not.toHaveBeenCalled();
      expect(inputOf(launchEpicSpy)).toMatchObject({
        epicId: "epic-1",
        aiBackend: expected.aiBackend,
        workingMethodOverride: expected.workingMethodOverride,
        maxIterations: 20,
      });
    }
  );

  it("omits provider-derived fields when --provider is not passed (project default applies downstream)", async () => {
    const { handle } = await import("../commands/workflow.ts");
    await handle("launch-epic", ["--epic", "epic-default"]);

    expect(launchEpicSpy).toHaveBeenCalledTimes(1);
    const input = inputOf(launchEpicSpy);
    expect(input.epicId).toBe("epic-default");
    expect(input.aiBackend).toBeUndefined();
    expect(input.workingMethodOverride).toBeUndefined();
  });
});
