import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  generateClaudeLaunchScript,
  generateOpenCodeLaunchScript,
  generateCodexLaunchScript,
  generateCopilotLaunchScript,
} from "./terminal";
import {
  generateProjectInceptionLaunchScript,
  generateSpecBreakdownLaunchScript,
} from "./inception";

const SAMPLE_PROJECT_PATH = "/tmp/brain-dump-test";
const SAMPLE_CONTEXT = "# Task: Fix launcher parity\n\nEnsure terminal stays open.";
const SAMPLE_PROMPT_PATH = "/tmp/brain-dump-test/prompt.md";

function expectInteractiveShellBehavior(script: string): void {
  expect(script).toContain("exec bash");
  expect(script).not.toContain("set -e");
}

describe("interactive launch parity", () => {
  it("keeps shell open for interactive Claude ticket launcher scripts", () => {
    const script = generateClaudeLaunchScript(
      SAMPLE_PROJECT_PATH,
      SAMPLE_CONTEXT,
      "Fix launcher parity"
    );

    expect(script).toContain('claude "$CONTEXT_FILE"');
    expectInteractiveShellBehavior(script);
  });

  it("keeps shell open for inception Claude launchers", () => {
    const inceptionScript = generateProjectInceptionLaunchScript(SAMPLE_PROMPT_PATH);
    expect(inceptionScript).toContain(`claude "${SAMPLE_PROMPT_PATH}"`);
    expectInteractiveShellBehavior(inceptionScript);

    const breakdownScript = generateSpecBreakdownLaunchScript(
      SAMPLE_PROJECT_PATH,
      "Brain Dump",
      SAMPLE_PROMPT_PATH
    );
    expect(breakdownScript).toContain(`claude "${SAMPLE_PROMPT_PATH}"`);
    expectInteractiveShellBehavior(breakdownScript);
  });

  it("preserves shell-open behavior for other interactive launchers", () => {
    const openCodeScript = generateOpenCodeLaunchScript(
      SAMPLE_PROJECT_PATH,
      SAMPLE_CONTEXT,
      "Fix launcher parity"
    );
    expect(openCodeScript).toContain('opencode "');
    expect(openCodeScript).toContain('--prompt "$(cat "$CONTEXT_FILE")"');
    expectInteractiveShellBehavior(openCodeScript);

    const codexScript = generateCodexLaunchScript(
      SAMPLE_PROJECT_PATH,
      SAMPLE_CONTEXT,
      "Fix launcher parity"
    );
    expect(codexScript).toContain('codex "$(cat "$CONTEXT_FILE")"');
    expectInteractiveShellBehavior(codexScript);

    const copilotScript = generateCopilotLaunchScript(
      SAMPLE_PROJECT_PATH,
      SAMPLE_CONTEXT,
      "Fix launcher parity"
    );
    expect(copilotScript).toContain('if ! copilot -p "$(cat "$CONTEXT_FILE")"; then');
    expect(copilotScript).toContain("copilot || true");
    expectInteractiveShellBehavior(copilotScript);
  });

  it("uses the same Claude launch server function across ticket entry points", () => {
    const root = process.cwd();
    const entryPoints = [
      "src/components/TicketModal.tsx",
      "src/components/tickets/EditTicketModal.tsx",
      "src/routes/ticket.$id.tsx",
    ];

    for (const entryPoint of entryPoints) {
      const content = readFileSync(join(root, entryPoint), "utf8");
      expect(content).toContain("launchClaudeInTerminal");
      expect(content).toContain("launchClaudeInTerminal({");
    }
  });
});
