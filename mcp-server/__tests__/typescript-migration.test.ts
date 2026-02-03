import { describe, it, expect } from "vitest";
import * as path from "path";
import * as fs from "fs";

/**
 * TypeScript Migration Verification Tests
 *
 * Verifies the structural integrity of the MCP server TypeScript migration.
 * Ensures all JavaScript files have been converted to TypeScript and the
 * server can be started with tsx.
 */

const mcpServerDir = path.resolve(__dirname, "..");

describe("TypeScript Migration Verification", () => {
  describe("File Conversion Completeness", () => {
    const expectedLibFiles = [
      "xdg",
      "logging",
      "lock",
      "secrets",
      "environment",
      "database",
      "backup",
      "attachment-types",
      "attachment-loader",
      "comment-utils",
      "conversation-session",
      "ticket-context-builder",
      "prd-utils",
      "telemetry-self-log",
    ];

    const expectedToolFiles = [
      "project",
      "ticket",
      "epic",
      "comment",
      "workflow",
      "review",
      "session",
      "telemetry",
      "admin",
    ];

    it("has TypeScript versions for all 14 lib files", () => {
      for (const file of expectedLibFiles) {
        const tsPath = path.join(mcpServerDir, "lib", `${file}.ts`);
        expect(fs.existsSync(tsPath), `Missing: lib/${file}.ts`).toBe(true);
      }
    });

    it("has TypeScript versions for all 9 consolidated tool files", () => {
      for (const file of expectedToolFiles) {
        const tsPath = path.join(mcpServerDir, "tools", `${file}.ts`);
        expect(fs.existsSync(tsPath), `Missing: tools/${file}.ts`).toBe(true);
      }
    });

    it("has TypeScript entry point (index.ts)", () => {
      const indexTs = path.join(mcpServerDir, "index.ts");
      expect(fs.existsSync(indexTs)).toBe(true);
    });

    it("has shared type definitions (types.ts)", () => {
      const typesTs = path.join(mcpServerDir, "types.ts");
      expect(fs.existsSync(typesTs)).toBe(true);
    });

    it("entry point uses tsx shebang", () => {
      const indexTs = path.join(mcpServerDir, "index.ts");
      const content = fs.readFileSync(indexTs, "utf-8");
      expect(content.startsWith("#!/usr/bin/env tsx")).toBe(true);
    });
  });

  describe("TypeScript Configuration", () => {
    it("has tsconfig.json with strict mode", () => {
      const tsconfigPath = path.join(mcpServerDir, "tsconfig.json");
      expect(fs.existsSync(tsconfigPath)).toBe(true);

      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.noEmit).toBe(true);
    });

    it("has TypeScript dev dependencies in package.json", () => {
      const pkgPath = path.join(mcpServerDir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

      expect(pkg.devDependencies).toHaveProperty("typescript");
      expect(pkg.devDependencies).toHaveProperty("tsx");
      expect(pkg.devDependencies).toHaveProperty("@types/better-sqlite3");
      expect(pkg.devDependencies).toHaveProperty("@types/node");
    });

    it("has tsx-based start script", () => {
      const pkgPath = path.join(mcpServerDir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

      expect(pkg.scripts.start).toBe("tsx index.ts");
    });
  });

  describe("Tool Registration Exports", () => {
    it("all tool files export a register function", async () => {
      const toolFiles = [
        "project",
        "ticket",
        "epic",
        "comment",
        "workflow",
        "review",
        "session",
        "telemetry",
        "admin",
      ];

      for (const file of toolFiles) {
        const tsPath = path.join(mcpServerDir, "tools", `${file}.ts`);
        const content = fs.readFileSync(tsPath, "utf-8");
        const hasExport = /^export function register\w+Tool/m.test(content);
        expect(hasExport, `tools/${file}.ts missing register*Tool export`).toBe(true);
      }
    });
  });

  describe("Import Resolution", () => {
    it("all index.ts local imports resolve to existing .ts files", () => {
      const indexPath = path.join(mcpServerDir, "index.ts");
      const content = fs.readFileSync(indexPath, "utf-8");

      const importRegex = /from\s+"(\.\/.+?)"/g;
      let match;
      const imports: string[] = [];

      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]!);
      }

      expect(imports.length).toBeGreaterThan(0);

      for (const importPath of imports) {
        // tsx resolves .js imports to .ts files
        const resolved = importPath.replace(/\.js$/, ".ts");
        const fullPath = path.resolve(mcpServerDir, resolved);
        expect(fs.existsSync(fullPath), `Import not found: ${importPath} -> ${resolved}`).toBe(
          true
        );
      }
    });
  });

  describe("Shared Types", () => {
    it("types.ts has 50+ type exports", () => {
      const typesPath = path.join(mcpServerDir, "types.ts");
      const content = fs.readFileSync(typesPath, "utf-8");
      const exportCount = (content.match(/^export /gm) || []).length;
      expect(exportCount).toBeGreaterThanOrEqual(50);
    });

    it("types.ts defines core database interfaces", () => {
      const typesPath = path.join(mcpServerDir, "types.ts");
      const content = fs.readFileSync(typesPath, "utf-8");

      const requiredInterfaces = [
        "DbTicket",
        "DbProject",
        "DbEpic",
        "DbTicketComment",
        "DbRalphSession",
        "DbTelemetryEvent",
        "DbReviewFinding",
        "DbDemoScript",
        "DbConversationSession",
        "DbConversationMessage",
      ];

      for (const iface of requiredInterfaces) {
        expect(content, `Missing interface: ${iface}`).toContain(`export interface ${iface}`);
      }
    });

    it("types.ts defines status enums as string literal unions", () => {
      const typesPath = path.join(mcpServerDir, "types.ts");
      const content = fs.readFileSync(typesPath, "utf-8");

      const requiredTypes = ["TicketStatus", "Priority", "FindingSeverity", "PrStatus"];

      for (const typeName of requiredTypes) {
        expect(content, `Missing type: ${typeName}`).toContain(`export type ${typeName}`);
      }
    });
  });
});
