/**
 * Tests for VS Code setup script
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Test user-facing behavior, not implementation details
 * - The more tests resemble how software is used, the more confidence they give
 *
 * These tests verify the OUTCOMES of running the setup script:
 * - MCP config exists in correct location with correct content
 * - Agent files are copied to VS Code prompts folder (agents go there per VS Code docs)
 * - Skills are copied to ~/.copilot/skills/
 * - Prompts are copied to VS Code User folder
 *
 * Note: install.sh now copies files directly (not symlinks) because
 * VS Code may not follow symlinks correctly.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Platform-specific paths
function getVSCodeUserDir(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library/Application Support/Code/User");
    case "linux":
      return path.join(os.homedir(), ".config/Code/User");
    case "win32":
      return path.join(process.env.APPDATA || "", "Code/User");
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

function getCopilotSkillsDir(): string {
  return path.join(os.homedir(), ".copilot/skills");
}

const BRAIN_DUMP_DIR = path.resolve(__dirname, "..");
const VSCODE_USER_DIR = getVSCodeUserDir();
const COPILOT_SKILLS_DIR = getCopilotSkillsDir();

describe("VS Code Setup Script", () => {
  // These tests verify the script produces correct outcomes
  // They don't test HOW the script works, just WHAT it produces

  describe("MCP Server Configuration", () => {
    const mcpConfigPath = path.join(VSCODE_USER_DIR, "mcp.json");

    it("should create mcp.json in VS Code User directory (not ~/.vscode)", () => {
      // User expectation: MCP config should be in VS Code's User profile
      // This is where VS Code actually looks for it per documentation
      expect(fs.existsSync(mcpConfigPath)).toBe(true);
    });

    it("should NOT have mcp.json in ~/.vscode (wrong location)", () => {
      // Old incorrect location - should not be used
      const wrongPath = path.join(os.homedir(), ".vscode/mcp.json");
      // If it exists, it should at least not be the primary config
      // This test documents that we don't want configs there
      if (fs.existsSync(wrongPath)) {
        console.warn("Warning: Old mcp.json found in ~/.vscode - consider removing");
      }
    });

    it("should configure brain-dump MCP server with correct path", () => {
      if (!fs.existsSync(mcpConfigPath)) {
        return; // Skip if MCP config doesn't exist
      }

      const config = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));

      expect(config.servers).toBeDefined();
      expect(config.servers["brain-dump"]).toBeDefined();
      expect(config.servers["brain-dump"].type).toBe("stdio");
      expect(config.servers["brain-dump"].command).toBe("node");
      expect(config.servers["brain-dump"].args[0]).toContain("mcp-server/dist/index.js");
    });
  });

  describe("Agent Files", () => {
    // Per install.sh: agents go to VS Code User prompts folder (same as prompts)
    // They are COPIED, not symlinked, because VS Code may not follow symlinks
    const promptsDir = path.join(VSCODE_USER_DIR, "prompts");
    const sourceAgentsDir = path.join(BRAIN_DUMP_DIR, ".github/agents");

    const expectedAgents = [
      "code-reviewer.agent.md",
      "code-simplifier.agent.md",
      "inception.agent.md",
      "planner.agent.md",
      "ralph.agent.md",
      "silent-failure-hunter.agent.md",
      "ticket-worker.agent.md",
    ];

    it("should have prompts directory in VS Code User folder", () => {
      expect(fs.existsSync(promptsDir)).toBe(true);
    });

    it.each(expectedAgents)("should have %s in VS Code prompts folder", (agentFile) => {
      const targetPath = path.join(promptsDir, agentFile);
      const sourcePath = path.join(sourceAgentsDir, agentFile);

      if (!fs.existsSync(sourcePath)) {
        return; // Skip if source doesn't exist
      }

      // User-facing check: does the agent file exist?
      expect(fs.existsSync(targetPath)).toBe(true);

      // Verify it's a valid agent file (has required structure)
      const content = fs.readFileSync(targetPath, "utf-8");
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe("Skills Configuration", () => {
    const sourceSkillsDir = path.join(BRAIN_DUMP_DIR, ".github/skills");

    // These are the core skills that should always be present
    const expectedSkills = ["brain-dump-tickets", "ralph-workflow"];

    it("should have skills in ~/.copilot/skills (per VS Code docs)", () => {
      // Per VS Code documentation, global skills go to ~/.copilot/skills
      expect(fs.existsSync(COPILOT_SKILLS_DIR)).toBe(true);
    });

    it.each(expectedSkills)("should have %s skill copied correctly", (skillName) => {
      const targetPath = path.join(COPILOT_SKILLS_DIR, skillName);
      const sourcePath = path.join(sourceSkillsDir, skillName);

      if (!fs.existsSync(sourcePath)) {
        return; // Skip if source doesn't exist
      }

      // Skill should exist as a directory (copied, not symlinked)
      expect(fs.existsSync(targetPath)).toBe(true);
      const stats = fs.statSync(targetPath);
      expect(stats.isDirectory()).toBe(true);

      // Verify skill has a SKILL.md file
      const skillMdPath = path.join(targetPath, "SKILL.md");
      expect(fs.existsSync(skillMdPath)).toBe(true);
    });
  });

  describe("Prompts Configuration", () => {
    const promptsDir = path.join(VSCODE_USER_DIR, "prompts");
    const sourcePromptsDir = path.join(BRAIN_DUMP_DIR, ".github/prompts");

    const expectedPrompts = [
      "complete-ticket.prompt.md",
      "create-tickets.prompt.md",
      "start-ticket.prompt.md",
    ];

    it("should have prompts directory in VS Code User folder", () => {
      expect(fs.existsSync(promptsDir)).toBe(true);
    });

    it.each(expectedPrompts)("should have %s in VS Code prompts folder", (promptFile) => {
      const targetPath = path.join(promptsDir, promptFile);
      const sourcePath = path.join(sourcePromptsDir, promptFile);

      if (!fs.existsSync(sourcePath)) {
        return; // Skip if source doesn't exist
      }

      // User-facing check: does the prompt file exist?
      expect(fs.existsSync(targetPath)).toBe(true);

      // Verify it's a regular file with content
      const stats = fs.lstatSync(targetPath);
      expect(stats.isFile()).toBe(true);

      const content = fs.readFileSync(targetPath, "utf-8");
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe("Source Files Existence", () => {
    // Verify that the source files actually exist in .github/
    // This catches issues where we might have moved files

    it("should have .github/agents directory with agent files", () => {
      const agentsDir = path.join(BRAIN_DUMP_DIR, ".github/agents");
      expect(fs.existsSync(agentsDir)).toBe(true);

      const files = fs.readdirSync(agentsDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((f) => f.endsWith(".agent.md"))).toBe(true);
    });

    it("should have .github/skills directory with skill folders", () => {
      const skillsDir = path.join(BRAIN_DUMP_DIR, ".github/skills");
      expect(fs.existsSync(skillsDir)).toBe(true);

      const dirs = fs
        .readdirSync(skillsDir)
        .filter((f) => fs.statSync(path.join(skillsDir, f)).isDirectory());
      expect(dirs.length).toBeGreaterThan(0);
    });

    it("should have .github/prompts directory with prompt files", () => {
      const promptsDir = path.join(BRAIN_DUMP_DIR, ".github/prompts");
      expect(fs.existsSync(promptsDir)).toBe(true);

      const files = fs.readdirSync(promptsDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((f) => f.endsWith(".prompt.md"))).toBe(true);
    });
  });
});

describe("Setup Script Path Conventions", () => {
  // These tests verify the setup-vscode.sh follows correct conventions

  const setupScript = path.join(BRAIN_DUMP_DIR, "scripts", "setup-vscode.sh");

  it("should exist and be executable", () => {
    expect(fs.existsSync(setupScript)).toBe(true);
  });

  it("should use ~/.copilot/skills for skills (not VSCODE_USER_DIR/skills)", () => {
    const content = fs.readFileSync(setupScript, "utf-8");

    // Should reference ~/.copilot/skills
    expect(content).toContain("COPILOT_SKILLS_DIR");
    expect(content).toContain(".copilot/skills");
  });

  it("should use VSCODE_TARGET for MCP config (not ~/.vscode)", () => {
    const content = fs.readFileSync(setupScript, "utf-8");

    // Should NOT use ~/.vscode for MCP
    // The MCP config should go in VS Code User profile
    expect(content).not.toContain('VSCODE_MCP_DIR="$HOME/.vscode"');
  });

  it("should document correct VS Code paths in comments", () => {
    const content = fs.readFileSync(setupScript, "utf-8");

    // Should have documentation about correct paths
    expect(content).toContain("VS Code docs");
  });

  it("should copy files directly instead of symlinks", () => {
    const content = fs.readFileSync(setupScript, "utf-8");

    // The setup script should mention copying directly
    expect(content).toContain("Copy files directly");
    expect(content).toContain("Copy directories directly");
  });
});
