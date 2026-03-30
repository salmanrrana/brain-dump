import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileNoThrow } from "../utils/execFileNoThrow";
import { findCursorAgentCli, isCursorAgentHelpOutput } from "./ralph-launchers";

vi.mock("../utils/execFileNoThrow", () => ({
  execFileNoThrow: vi.fn(),
}));

const mockExecFileNoThrow = vi.mocked(execFileNoThrow);

describe("Cursor Agent launcher detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches the current Cursor Agent help output", () => {
    expect(isCursorAgentHelpOutput("Usage: agent\nStart the Cursor Agent")).toBe(true);
    expect(isCursorAgentHelpOutput("Some unrelated generic agent")).toBe(false);
  });

  it("accepts the generic agent binary when help output identifies Cursor Agent", async () => {
    mockExecFileNoThrow.mockImplementation(async (command, args) => {
      if (command === "agent" && args[0] === "--help") {
        return {
          success: true,
          stdout: "Usage: agent\nStart the Cursor Agent",
          stderr: "",
          exitCode: 0,
        };
      }

      return {
        success: false,
        stdout: "",
        stderr: "",
        exitCode: 1,
      };
    });

    await expect(findCursorAgentCli()).resolves.toBe("agent");
  });

  it("falls back to cursor-agent when the generic agent binary is not Cursor", async () => {
    mockExecFileNoThrow.mockImplementation(async (command, args) => {
      if (command === "agent" && args[0] === "--help") {
        return {
          success: true,
          stdout: "Usage: agent\nStart some other agent",
          stderr: "",
          exitCode: 0,
        };
      }

      if (command === "cursor-agent" && args[0] === "--help") {
        return {
          success: true,
          stdout: "Usage: agent\nStart the Cursor Agent",
          stderr: "",
          exitCode: 0,
        };
      }

      return {
        success: false,
        stdout: "",
        stderr: "",
        exitCode: 1,
      };
    });

    await expect(findCursorAgentCli()).resolves.toBe("cursor-agent");
  });
});
