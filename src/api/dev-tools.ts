import { createServerFn } from "@tanstack/react-start";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
  readdirSync,
  unlinkSync,
  statSync,
} from "fs";
import { join, basename } from "path";
import { tmpdir } from "os";
import { execFileSync, execFile } from "child_process";
import { promisify } from "util";
import { detectTerminal, buildTerminalCommand } from "./terminal-utils";
import { createLogger } from "../lib/logger";
import { toErrorMessage } from "./errors";

const execFileAsync = promisify(execFile);

const logger = createLogger("dev-tools");

/** Clean up temp scripts older than 1 hour in the brain-dump temp directory. */
function cleanupOldTempScripts(): void {
  try {
    const scriptDir = join(tmpdir(), "brain-dump");
    if (!existsSync(scriptDir)) return;
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    for (const file of readdirSync(scriptDir)) {
      const filePath = join(scriptDir, file);
      try {
        const stat = statSync(filePath);
        if (now - stat.mtimeMs > ONE_HOUR) {
          unlinkSync(filePath);
        }
      } catch {
        // Ignore individual file cleanup errors
      }
    }
  } catch {
    // Ignore cleanup errors entirely
  }
}

// Type Definitions
export interface TechStackInfo {
  languages: Array<{ name: string; icon: string; version?: string }>;
  frameworks: Array<{ name: string; icon: string; version?: string }>;
  totalDependencies: number;
}

export interface EditorInfo {
  name: "vscode" | "cursor" | "vim" | "neovim";
  installed: boolean;
  launchCommand: string;
  displayName: string;
}

export interface DevCommand {
  name: string;
  command: string;
  description?: string;
  source: "package.json" | "makefile" | "docker-compose";
}

// Helper: Check if command is available on system (safely, no shell injection)
async function commandExists(command: string): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      execFileSync("where", [command], { stdio: "ignore" });
    } else {
      execFileSync("which", [command], { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

// Helper: Parse package.json
function parsePackageJson(projectPath: string): {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
} | null {
  try {
    const packageJsonPath = join(projectPath, "package.json");
    if (!existsSync(packageJsonPath)) return null;

    const content = readFileSync(packageJsonPath, "utf-8");
    const parsed = JSON.parse(content);
    return {
      dependencies: { ...parsed.dependencies, ...parsed.devDependencies },
      scripts: parsed.scripts || {},
    };
  } catch (err: unknown) {
    logger.error("Failed to parse package.json", new Error(toErrorMessage(err)));
    return null;
  }
}

// Helper: Parse Cargo.toml
function parseCargo(projectPath: string): Record<string, string> | null {
  try {
    const cargoPath = join(projectPath, "Cargo.toml");
    if (!existsSync(cargoPath)) return null;

    const content = readFileSync(cargoPath, "utf-8");
    const deps: Record<string, string> = {};

    // Simple TOML parsing for dependencies section
    const depMatch = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
    if (depMatch) {
      const depLines = depMatch[1]?.split("\n") ?? [];
      for (const line of depLines) {
        const [key] = line.split("=");
        if (key?.trim()) {
          deps[key.trim()] = "latest";
        }
      }
    }

    return deps;
  } catch (err: unknown) {
    logger.error("Failed to parse Cargo.toml", new Error(toErrorMessage(err)));
    return null;
  }
}

// Helper: Extract version from dependency string
function extractVersion(depString: string): string | undefined {
  const match = depString.match(/^\D*(\d+\.\d+\.\d+|\d+\.\d+)/);
  return match?.[1];
}

// Helper: Map framework names to icons
function getFrameworkIcon(name: string): string {
  const iconMap: Record<string, string> = {
    react: "⚛️",
    vue: "💚",
    angular: "🅰️",
    svelte: "🔥",
    next: "▲",
    nuxt: "💚",
    gatsby: "🎨",
    remix: "🎵",
    express: "🚂",
    fastapi: "⚡",
    django: "🌐",
    flask: "🍶",
    rails: "💎",
    laravel: "🚀",
    vite: "⚡",
    webpack: "📦",
    rollup: "🔄",
    typescript: "🔷",
    python: "🐍",
    go: "🐹",
    rust: "🦀",
  };

  const lower = name.toLowerCase();
  return iconMap[lower] || "📦";
}

// Server Function: Detect Tech Stack
export const detectTechStack = createServerFn({ method: "GET" })
  .inputValidator((projectPath: string) => {
    if (!projectPath || typeof projectPath !== "string") {
      throw new Error("projectPath is required");
    }
    return projectPath;
  })
  .handler(async ({ data: projectPath }): Promise<TechStackInfo> => {
    const result: TechStackInfo = {
      languages: [],
      frameworks: [],
      totalDependencies: 0,
    };

    try {
      // Check Node.js/package.json
      const pkg = parsePackageJson(projectPath);
      if (pkg) {
        // Detect TypeScript vs JavaScript
        if (pkg.dependencies["typescript"] || existsSync(join(projectPath, "tsconfig.json"))) {
          const tsVersion = extractVersion(pkg.dependencies["typescript"] || "");
          result.languages.push({
            name: "TypeScript",
            icon: "🔷",
            ...(tsVersion && { version: tsVersion }),
          });
        } else {
          result.languages.push({
            name: "JavaScript",
            icon: "✨",
          });
        }

        // Extract frameworks
        const frameworkList = [
          "react",
          "vue",
          "angular",
          "svelte",
          "next",
          "nuxt",
          "gatsby",
          "remix",
          "express",
          "fastapi",
          "django",
          "flask",
          "vite",
          "webpack",
        ];

        for (const fw of frameworkList) {
          if (pkg.dependencies[fw]) {
            const fwVersion = extractVersion(pkg.dependencies[fw]);
            result.frameworks.push({
              name: fw.charAt(0).toUpperCase() + fw.slice(1),
              icon: getFrameworkIcon(fw),
              ...(fwVersion && { version: fwVersion }),
            });
          }
        }

        result.totalDependencies = Object.keys(pkg.dependencies).length;
      }

      // Check Go
      if (existsSync(join(projectPath, "go.mod"))) {
        result.languages.push({
          name: "Go",
          icon: "🐹",
        });
      }

      // Check Rust
      if (existsSync(join(projectPath, "Cargo.toml"))) {
        const cargo = parseCargo(projectPath);
        result.languages.push({
          name: "Rust",
          icon: "🦀",
        });
        if (cargo) {
          result.totalDependencies = Math.max(result.totalDependencies, Object.keys(cargo).length);
        }
      }

      // Check Python
      if (
        existsSync(join(projectPath, "pyproject.toml")) ||
        existsSync(join(projectPath, "requirements.txt"))
      ) {
        result.languages.push({
          name: "Python",
          icon: "🐍",
        });
      }

      // Check Java
      if (
        existsSync(join(projectPath, "pom.xml")) ||
        existsSync(join(projectPath, "build.gradle"))
      ) {
        result.languages.push({
          name: "Java",
          icon: "☕",
        });
      }
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      logger.error("detectTechStack error", new Error(message));
      throw new Error(`Failed to detect tech stack: ${message}`);
    }

    return result;
  });

// Server Function: Detect Installed Editors
export const detectInstalledEditors = createServerFn({ method: "GET" }).handler(
  async (): Promise<EditorInfo[]> => {
    const editors: EditorInfo[] = [];

    try {
      // VS Code
      const vscodeInstalled = await commandExists("code");
      if (vscodeInstalled) {
        editors.push({
          name: "vscode",
          installed: true,
          launchCommand: "code",
          displayName: "VS Code",
        });
      }

      // Cursor
      const cursorInstalled = await commandExists("cursor");
      if (cursorInstalled) {
        editors.push({
          name: "cursor",
          installed: true,
          launchCommand: "cursor",
          displayName: "Cursor",
        });
      } else if (process.platform === "darwin") {
        // macOS: check for Cursor.app
        if (existsSync("/Applications/Cursor.app")) {
          editors.push({
            name: "cursor",
            installed: true,
            launchCommand: "open -a Cursor",
            displayName: "Cursor",
          });
        }
      }

      // Neovim
      const nvimInstalled = await commandExists("nvim");
      if (nvimInstalled) {
        editors.push({
          name: "neovim",
          installed: true,
          launchCommand: "nvim",
          displayName: "Neovim",
        });
      }

      // Vim
      const vimInstalled = await commandExists("vim");
      if (vimInstalled) {
        editors.push({
          name: "vim",
          installed: true,
          launchCommand: "vim",
          displayName: "Vim",
        });
      }
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      logger.error("detectInstalledEditors error", new Error(message));
      throw new Error(`Failed to detect installed editors: ${message}`);
    }

    return editors;
  }
);

/** Detect the package manager for a project based on lockfiles */
function detectPackageManager(projectPath: string): string {
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectPath, "bun.lockb")) || existsSync(join(projectPath, "bun.lock")))
    return "bun";
  return "npm";
}

// Server Function: Detect Dev Commands
export const detectDevCommands = createServerFn({ method: "GET" })
  .inputValidator((projectPath: string) => {
    if (!projectPath || typeof projectPath !== "string") {
      throw new Error("projectPath is required");
    }
    return projectPath;
  })
  .handler(async ({ data: projectPath }): Promise<DevCommand[]> => {
    const commands: DevCommand[] = [];

    try {
      // Check package.json scripts
      const pkg = parsePackageJson(projectPath);
      if (pkg?.scripts) {
        const pm = detectPackageManager(projectPath);
        const scriptPriority = ["dev", "start", "serve", "build", "test"];

        for (const scriptName of scriptPriority) {
          if (pkg.scripts[scriptName]) {
            commands.push({
              name: scriptName,
              command: `${pm} run ${scriptName}`,
              description: `Run npm script: ${scriptName}`,
              source: "package.json",
            });
          }
        }

        // Add any other scripts not in the priority list
        for (const [name] of Object.entries(pkg.scripts)) {
          if (!scriptPriority.includes(name)) {
            commands.push({
              name,
              command: `${pm} run ${name}`,
              source: "package.json",
            });
          }
        }
      }

      // Check Makefile
      const makefilePath = join(projectPath, "Makefile");
      if (existsSync(makefilePath)) {
        try {
          const content = readFileSync(makefilePath, "utf-8");
          const targetRegex = /^([a-zA-Z0-9_-]+):/gm;
          let match: RegExpExecArray | null;

          const priorities = ["dev", "serve", "run", "start"];
          const priorityTargets: string[] = [];
          const otherTargets: string[] = [];

          while ((match = targetRegex.exec(content)) !== null) {
            const target = match[1];
            if (target && target !== ".PHONY") {
              if (priorities.includes(target)) {
                priorityTargets.push(target);
              } else {
                otherTargets.push(target);
              }
            }
          }

          for (const target of [...priorityTargets, ...otherTargets]) {
            if (!commands.find((c) => c.name === target)) {
              commands.push({
                name: target,
                command: `make ${target}`,
                source: "makefile",
              });
            }
          }
        } catch (err: unknown) {
          logger.error("Failed to parse Makefile", new Error(toErrorMessage(err)));
        }
      }

      // Check docker-compose.yml
      const dockerComposePath = join(projectPath, "docker-compose.yml");
      if (existsSync(dockerComposePath)) {
        commands.push({
          name: "docker-compose up",
          command: "docker-compose up",
          description: "Start Docker services",
          source: "docker-compose",
        });
      }
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      logger.error("detectDevCommands error", new Error(message));
      throw new Error(`Failed to detect dev commands: ${message}`);
    }

    return commands;
  });

// Allowed editor values
const ALLOWED_EDITORS = ["vscode", "cursor", "vim", "neovim"] as const;

// Server Function: Launch Editor
export const launchEditor = createServerFn({ method: "POST" })
  .inputValidator((data: { projectPath: string; editor: string }) => {
    if (!data.projectPath) {
      throw new Error("projectPath is required");
    }
    if (!ALLOWED_EDITORS.includes(data.editor as (typeof ALLOWED_EDITORS)[number])) {
      throw new Error(`Invalid editor: ${data.editor}. Allowed: ${ALLOWED_EDITORS.join(", ")}`);
    }
    return data;
  })
  .handler(async ({ data }): Promise<{ success: boolean; message: string }> => {
    try {
      const { projectPath, editor } = data;

      if (!existsSync(projectPath)) {
        return {
          success: false,
          message: `Project path does not exist: ${projectPath}`,
        };
      }

      // Clean up old temp scripts opportunistically
      cleanupOldTempScripts();

      // Terminal-based editors (neovim, vim) need a terminal wrapper
      if (editor === "neovim" || editor === "vim") {
        const terminal = await detectTerminal();
        if (!terminal) {
          return {
            success: false,
            message: "No terminal detected. Please install a terminal emulator.",
          };
        }
        const editorCmd = editor === "neovim" ? "nvim" : "vim";
        const editorScriptDir = join(tmpdir(), "brain-dump");
        mkdirSync(editorScriptDir, { recursive: true });
        const editorScriptFile = join(editorScriptDir, `editor-${Date.now()}.sh`);
        writeFileSync(
          editorScriptFile,
          `#!/usr/bin/env bash\ncd "${projectPath}" && ${editorCmd} .\n`,
          "utf-8"
        );
        chmodSync(editorScriptFile, 0o755);
        const termCmd = buildTerminalCommand(terminal, projectPath, editorScriptFile);
        try {
          const { exec } = await import("child_process");
          const execAsync = promisify(exec);
          await execAsync(termCmd);
          return { success: true, message: `${editor} opened in terminal` };
        } catch (err) {
          logger.error(`Failed to launch ${editor}`, new Error(toErrorMessage(err)));
          return { success: false, message: `Failed to launch ${editor}` };
        }
      }

      // GUI editors use execFile (no shell) to prevent command injection
      try {
        switch (editor) {
          case "vscode":
            await execFileAsync("code", [projectPath]);
            break;
          case "cursor":
            if (process.platform === "darwin") {
              await execFileAsync("open", ["-a", "Cursor", projectPath]);
            } else {
              await execFileAsync("cursor", [projectPath]);
            }
            break;
        }
        return { success: true, message: `${editor} opened successfully` };
      } catch (err) {
        logger.error(`Failed to launch ${editor}`, new Error(toErrorMessage(err)));
        return { success: false, message: `Failed to launch ${editor}: ${toErrorMessage(err)}` };
      }
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      logger.error("launchEditor error", new Error(message));
      return {
        success: false,
        message: `Failed to launch editor: ${message}`,
      };
    }
  });

// Server Function: Launch Dev Server
export const launchDevServer = createServerFn({ method: "POST" })
  .inputValidator((data: { projectPath: string; commandName: string }) => {
    if (!data.projectPath || !data.commandName) {
      throw new Error("projectPath and commandName are required");
    }
    // Only allow safe alphanumeric command names (no shell operators)
    if (!/^[a-zA-Z0-9\-_:.]+$/.test(data.commandName)) {
      throw new Error("Invalid command name: contains unsafe characters");
    }
    return data;
  })
  .handler(async ({ data }): Promise<{ success: boolean; message: string }> => {
    try {
      const { projectPath, commandName } = data;

      if (!existsSync(projectPath)) {
        return {
          success: false,
          message: `Project path does not exist: ${projectPath}`,
        };
      }

      // Resolve command from detected commands server-side (not from client input)
      const detected = await detectDevCommands({ data: projectPath });
      const match = detected.find((c) => c.name === commandName);
      if (!match) {
        return {
          success: false,
          message: `Unknown command: "${commandName}". Available: ${detected.map((c) => c.name).join(", ")}`,
        };
      }
      const command = match.command;

      // Detect terminal
      const terminal = await detectTerminal();
      if (!terminal) {
        return {
          success: false,
          message: "No terminal detected. Please install a terminal emulator.",
        };
      }

      // Clean up old temp scripts opportunistically
      cleanupOldTempScripts();

      // Write command to a temp script so the terminal can execute it
      const scriptDir = join(tmpdir(), "brain-dump");
      mkdirSync(scriptDir, { recursive: true });
      const scriptName = `dev-server-${basename(projectPath)}-${Date.now()}.sh`;
      const scriptFile = join(scriptDir, scriptName);
      writeFileSync(
        scriptFile,
        `#!/usr/bin/env bash\ncd "${projectPath}" && ${command}\nexec bash\n`,
        "utf-8"
      );
      chmodSync(scriptFile, 0o755);

      // Build and execute terminal command
      const terminalCmd = buildTerminalCommand(terminal, projectPath, scriptFile);

      try {
        const { exec } = await import("child_process");
        const execAsync = promisify(exec);
        await execAsync(terminalCmd);
        return {
          success: true,
          message: `Dev server launched with command: ${command}`,
        };
      } catch (err) {
        logger.error("Failed to launch dev server", new Error(toErrorMessage(err)));
        return {
          success: false,
          message: `Failed to launch dev server: ${toErrorMessage(err)}`,
        };
      }
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      logger.error("launchDevServer error", new Error(message));
      return {
        success: false,
        message: `Failed to launch dev server: ${message}`,
      };
    }
  });
