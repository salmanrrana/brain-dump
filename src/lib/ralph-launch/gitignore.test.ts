import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureRalphArtifactsIgnored, RALPH_ARTIFACT_IGNORE_PATTERNS } from "./gitignore";

describe("ensureRalphArtifactsIgnored", () => {
  let projectPath: string | null = null;

  afterEach(() => {
    if (projectPath) {
      rmSync(projectPath, { recursive: true, force: true });
      projectPath = null;
    }
  });

  function createProject(): string {
    projectPath = mkdtempSync(join(tmpdir(), "brain-dump-gitignore-"));
    return projectPath;
  }

  it("creates a .gitignore with Brain Dump Ralph artifacts", () => {
    const project = createProject();

    const result = ensureRalphArtifactsIgnored(project);
    const content = readFileSync(join(project, ".gitignore"), "utf-8");

    expect(result.addedPatterns).toEqual([...RALPH_ARTIFACT_IGNORE_PATTERNS]);
    expect(content).toContain("# Brain Dump Ralph artifacts");
    expect(content).toContain("plans/prd.json");
    expect(content).toContain("plans/progress.txt");
    expect(content).toContain(".claude/ralph-context.md");
    expect(content).not.toContain("\nplans/\n");
  });

  it("appends only missing artifacts to an existing .gitignore", () => {
    const project = createProject();
    writeFileSync(join(project, ".gitignore"), "node_modules\nplans/prd.json", "utf-8");

    const result = ensureRalphArtifactsIgnored(project);
    const content = readFileSync(join(project, ".gitignore"), "utf-8");

    expect(result.addedPatterns).not.toContain("plans/prd.json");
    expect(content).toMatch(/^node_modules\nplans\/prd\.json\n\n# Brain Dump Ralph artifacts/m);
    expect(content.match(/plans\/prd\.json/g)).toHaveLength(1);
    expect(content).toContain("plans/progress.txt");
    expect(content).toContain(".ralph-services.json");
  });

  it("does not add duplicate patterns when artifacts are already ignored", () => {
    const project = createProject();

    ensureRalphArtifactsIgnored(project);
    const result = ensureRalphArtifactsIgnored(project);
    const content = readFileSync(join(project, ".gitignore"), "utf-8");

    expect(result.addedPatterns).toEqual([]);
    expect(content.match(/# Brain Dump Ralph artifacts/g)).toHaveLength(1);
    expect(content.match(/plans\/progress\.txt/g)).toHaveLength(1);
  });

  it("respects broader existing project ignores", () => {
    const project = createProject();
    writeFileSync(join(project, ".gitignore"), "plans/\n.claude/\n", "utf-8");

    const result = ensureRalphArtifactsIgnored(project);
    const content = readFileSync(join(project, ".gitignore"), "utf-8");

    expect(result.addedPatterns).not.toContain("plans/prd.json");
    expect(result.addedPatterns).not.toContain(".claude/ralph-context.md");
    expect(result.addedPatterns).toContain(".ralph-services.json");
    expect(content.match(/plans\/prd\.json/g)).toBeNull();
    expect(content).toContain(".ralph-services.json");
  });
});
