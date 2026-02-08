import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");

function readScript(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf-8");
}

// All providers that should have install/uninstall parity
const ALL_PROVIDERS = ["claude", "vscode", "cursor", "opencode", "copilot", "codex"];

describe("install.sh (root)", () => {
  const script = readScript("install.sh");

  it("accepts --<provider> flag for every provider", () => {
    for (const provider of ALL_PROVIDERS) {
      expect(script).toContain(`--${provider})`);
    }
  });

  it("accepts --all flag that enables every provider", () => {
    expect(script).toContain("--all)");
    // --all should set SETUP_COPILOT=true alongside the others
    for (const provider of ALL_PROVIDERS) {
      const varName = provider === "copilot" ? "SETUP_COPILOT" : `SETUP_${provider.toUpperCase()}`;
      expect(script).toContain(`${varName}=true`);
    }
  });

  it("lists every provider in help text", () => {
    for (const provider of ALL_PROVIDERS) {
      expect(script).toContain(`--${provider}`);
    }
  });

  it("includes every provider in the interactive prompt", () => {
    expect(script).toContain("Claude Code");
    expect(script).toContain("VS Code");
    expect(script).toContain("Cursor");
    expect(script).toContain("OpenCode");
    expect(script).toContain("Copilot CLI");
    expect(script).toContain("Codex");
  });

  it("delegates copilot setup to scripts/setup-copilot-cli.sh", () => {
    expect(script).toContain("setup-copilot-cli.sh");
  });

  it("delegates cursor setup to scripts/setup-cursor.sh", () => {
    expect(script).toContain("setup-cursor.sh");
  });

  it("has a setup section for copilot in the main flow", () => {
    expect(script).toContain('SETUP_COPILOT" = true');
  });

  it("includes copilot in the IDE count for summary", () => {
    expect(script).toContain('SETUP_COPILOT" = true ] && ide_count');
  });
});

describe("uninstall.sh (root)", () => {
  const script = readScript("uninstall.sh");

  it("accepts --<provider> flag for every provider", () => {
    for (const provider of ALL_PROVIDERS) {
      expect(script).toContain(`--${provider})`);
    }
  });

  it("accepts --all flag that enables every provider", () => {
    expect(script).toContain("--all)");
  });

  it("lists every provider in help text", () => {
    for (const provider of ALL_PROVIDERS) {
      expect(script).toContain(`--${provider}`);
    }
  });

  it("has a removal function for copilot", () => {
    expect(script).toContain("remove_copilot_cli");
  });

  it("includes copilot in the default (no-args) removal set", () => {
    // When no flags are passed, REMOVE_COPILOT should be set to true
    expect(script).toContain("REMOVE_COPILOT=true");
  });

  it("includes copilot in --all flag", () => {
    // Find the --all case and check it sets REMOVE_COPILOT
    const allSection = script.slice(
      script.indexOf("--all)"),
      script.indexOf(";;", script.indexOf("--all)"))
    );
    expect(allSection).toContain("REMOVE_COPILOT=true");
  });
});

describe("setup scripts exist for all providers", () => {
  const expectedSetupScripts = [
    "scripts/setup-copilot-cli.sh",
    "scripts/setup-cursor.sh",
    "scripts/setup-codex.sh",
  ];

  for (const scriptPath of expectedSetupScripts) {
    it(`${scriptPath} exists`, () => {
      expect(existsSync(resolve(ROOT, scriptPath))).toBe(true);
    });
  }
});

describe("README.md environment table", () => {
  const readme = readScript("README.md");

  it("lists every provider in the Choose Your Environment table", () => {
    expect(readme).toContain("./install.sh --claude");
    expect(readme).toContain("./install.sh --vscode");
    expect(readme).toContain("./install.sh --opencode");
    expect(readme).toContain("./install.sh --cursor");
    expect(readme).toContain("./install.sh --copilot");
    expect(readme).toContain("./install.sh --codex");
    expect(readme).toContain("./install.sh --all");
  });

  it("has Copilot CLI in the environment details section", () => {
    expect(readme).toContain("### Copilot CLI");
  });

  it("has Codex in the environment details section", () => {
    expect(readme).toContain("### Codex");
  });
});

describe("scripts/install.sh (universal auto-detect)", () => {
  const script = readScript("scripts/install.sh");

  it("detects Copilot CLI", () => {
    expect(script).toContain("COPILOT_CLI_AVAILABLE");
  });

  it("detects Codex", () => {
    expect(script).toContain("CODEX_AVAILABLE");
  });

  it("has an install function for copilot CLI", () => {
    expect(script).toContain("install_copilot_cli");
  });

  it("has an install function for Codex", () => {
    expect(script).toContain("install_codex");
  });

  it("references setup-copilot-cli.sh", () => {
    expect(script).toContain("setup-copilot-cli.sh");
  });

  it("references setup-codex.sh", () => {
    expect(script).toContain("setup-codex.sh");
  });
});

describe("scripts/uninstall.sh (universal auto-detect)", () => {
  const script = readScript("scripts/uninstall.sh");

  it("has an uninstall function for copilot CLI", () => {
    expect(script).toContain("uninstall_copilot_cli");
  });

  it("removes copilot MCP config", () => {
    expect(script).toContain("mcp-config.json");
  });

  it("removes copilot hook scripts", () => {
    expect(script).toContain("start-telemetry.sh");
    expect(script).toContain("enforce-state-before-write.sh");
  });
});

describe("setup-copilot-cli.sh hooks.json format", () => {
  const script = readScript("scripts/setup-copilot-cli.sh");

  it("generates hooks.json with 'type: command' in every hook entry", () => {
    // Every hook entry in the generated hooks.json must include "type": "command"
    // per the Copilot CLI hooks specification
    const hookEvents = [
      "sessionStart",
      "preToolUse",
      "postToolUse",
      "sessionEnd",
      "userPromptSubmitted",
      "errorOccurred",
    ];
    for (const event of hookEvents) {
      expect(script, `hooks.json ${event} section found`).toContain(`"${event}"`);
    }

    // Count occurrences of "bash": in the hooks.json section
    const hooksJsonSection = script.slice(
      script.indexOf("HOOKS_JSON_EOF"),
      script.indexOf("HOOKS_JSON_EOF", script.indexOf("HOOKS_JSON_EOF") + 1)
    );
    const bashEntries = (hooksJsonSection.match(/"bash":/g) || []).length;
    const typeCommandEntries = (hooksJsonSection.match(/"type": "command"/g) || []).length;

    expect(typeCommandEntries).toBeGreaterThan(0);
    expect(typeCommandEntries).toBe(bashEntries);
  });

  it("enforce-state hook uses permissionDecision format (not decision)", () => {
    // Copilot CLI uses permissionDecision, not Claude Code's decision format
    const startIdx = script.indexOf("enforce-state-before-write.sh (preToolUse)");
    // Find the closing HOOK_EOF for this heredoc (skip the opening 'HOOK_EOF')
    const heredocStart = script.indexOf("HOOK_EOF", startIdx);
    const heredocEnd = script.indexOf("\nHOOK_EOF", heredocStart + 1);
    const enforceSection = script.slice(startIdx, heredocEnd);
    expect(enforceSection).toContain("permissionDecision");
    expect(enforceSection).not.toContain('"decision":');
  });
});

describe("project-level hooks format (.github/hooks/)", () => {
  const hooksDir = resolve(ROOT, ".github/hooks");

  it("brain-dump.json exists", () => {
    expect(existsSync(resolve(hooksDir, "brain-dump.json"))).toBe(true);
  });

  it("brain-dump.json has version 1", () => {
    const config = JSON.parse(readScript(".github/hooks/brain-dump.json"));
    expect(config.version).toBe(1);
  });

  it("brain-dump.json hook entries use 'type: command' format", () => {
    const config = JSON.parse(readScript(".github/hooks/brain-dump.json"));
    for (const [event, hooks] of Object.entries(config.hooks)) {
      for (const hook of hooks as Array<Record<string, unknown>>) {
        expect(hook.type, `${event} hook missing type: "command"`).toBe("command");
        expect(hook.bash, `${event} hook missing bash path`).toBeDefined();
      }
    }
  });
});

describe("copilot pre-tool-use hook script", () => {
  it("hooks/copilot/pre-tool-use.sh exists", () => {
    expect(existsSync(resolve(ROOT, "hooks/copilot/pre-tool-use.sh"))).toBe(true);
  });

  it("uses permissionDecision format (Copilot CLI protocol)", () => {
    const hook = readScript("hooks/copilot/pre-tool-use.sh");
    expect(hook).toContain("permissionDecision");
    // Should not use Claude Code's "decision" format
    expect(hook).not.toContain('"decision":');
  });
});

describe("install/uninstall flag parity", () => {
  const installScript = readScript("install.sh");
  const uninstallScript = readScript("uninstall.sh");

  it("every provider flag in install.sh has a matching flag in uninstall.sh", () => {
    for (const provider of ALL_PROVIDERS) {
      expect(installScript, `install.sh missing --${provider}`).toContain(`--${provider})`);
      expect(uninstallScript, `uninstall.sh missing --${provider}`).toContain(`--${provider})`);
    }
  });
});
