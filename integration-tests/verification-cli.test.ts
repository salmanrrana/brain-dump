import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test, expect } from "vitest";
import { chromium, expect as browserExpect } from "@playwright/test";
import { z } from "zod";
import type { DemoStep } from "../core/types.ts";

const source = resolve(import.meta.dirname, "..");
const idResult = z.object({ id: z.string() });
const ticketResult = z.object({ status: z.string(), isBlocked: z.boolean() });
const historyResult = z.array(
  z.object({
    id: z.string(),
    status: z.string(),
    certified: z.boolean(),
    integrityStatus: z.string(),
    gitSha: z.string().nullable(),
    manifest: z
      .object({ evidenceFiles: z.array(z.object({ path: z.string(), hash: z.string() })) })
      .nullable(),
  })
);

/** Real CLI, Git, detached worker, HTTP server, browser, and evidence. No tool mocks. */
test("the CLI workflow gates, fails, repairs, and certifies the two-page app", async () => {
  const root = mkdtempSync(join(tmpdir(), "brain-dump-uqw-cli-"));
  const project = join(root, "app");
  mkdirSync(project);
  const browserCache =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    chromium.executablePath().match(/^(.*)[/\\]chromium-\d+[/\\]/)?.[1];
  if (!browserCache) throw new Error("Unable to locate installed Playwright browsers");
  const env = {
    ...process.env,
    HOME: join(root, "home"),
    USERPROFILE: join(root, "home"),
    APPDATA: join(root, "roaming"),
    LOCALAPPDATA: join(root, "local"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_STATE_HOME: join(root, "state"),
    BRAIN_DUMP_DISABLE_DB_STARTUP_TASKS: "1",
    BRAIN_DUMP_DISABLE_VERIFICATION_WORKER: "0",
    BRAIN_DUMP_PROVIDER: "pi",
    PLAYWRIGHT_BROWSERS_PATH: browserCache,
  };
  const journal: Array<{
    args: string[];
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }> = [];
  function cli(args: string[], expectedExit = 0): unknown {
    const result = spawnSync(process.execPath, ["--import", "tsx", "cli/brain-dump.ts", ...args], {
      cwd: source,
      env,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    journal.push({ args, exitCode: result.status, stdout: result.stdout, stderr: result.stderr });
    writeFileSync(join(root, "commands.json"), JSON.stringify(journal, null, 2));
    expect(result.status, `${args.join(" ")}\n${result.stderr}\n${result.stdout}`).toBe(
      expectedExit
    );
    return expectedExit === 0 ? (JSON.parse(result.stdout) as unknown) : null;
  }
  function git(...args: string[]): string {
    const result = spawnSync("git", args, { cwd: project, env, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }
  function validateApp(): void {
    const result = spawnSync(process.execPath, ["--test", "server.test.mjs"], {
      cwd: project,
      env,
      encoding: "utf8",
    });
    writeFileSync(join(root, "app-test.log"), result.stdout + result.stderr);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }
  async function waitForStatus(ticketId: string, status: string): Promise<void> {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const ticket = ticketResult.parse(cli(["ticket", "get", "--ticket", ticketId]));
      if (ticket.status === status) {
        expect(ticket.isBlocked).toBe(false);
        return;
      }
      if (ticket.isBlocked)
        throw new Error(
          `Unexpected blocker: ${JSON.stringify(cli(["verify", "history", "--ticket", ticketId]))}`
        );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out awaiting ${status}; evidence: ${root}`);
  }
  let passed = false;
  try {
    git("init", "-b", "main");
    git("config", "user.name", "UQW Fixture");
    git("config", "user.email", "uqw@example.invalid");
    writeFileSync(join(project, ".gitignore"), "plans/\n.claude/\n");
    git("add", ".");
    git("commit", "-m", "Initialize isolated fixture");
    const projectId = idResult.parse(
      cli(["project", "create", "--name", "UQW fixture", "--path", project])
    ).id;
    const ticketId = idResult.parse(
      cli([
        "ticket",
        "create",
        "--project",
        projectId,
        "--title",
        "Build the greeting flow",
        "--description",
        "## Acceptance Criteria\n- Home has a Next page button.\n- Next page opens a popup saying whats up.\n- Close dismisses the popup and Back to start returns home.",
      ])
    ).id;
    mkdirSync(join(project, "plans"));
    const prdPath = join(project, "plans", "prd.json");
    writeFileSync(
      prdPath,
      JSON.stringify({ userStories: [{ id: ticketId, title: "Greeting", passes: false }] })
    );
    cli(["context", "--ticket", ticketId]);
    cli(["workflow", "start-work", "--ticket", ticketId]);
    expect(ticketResult.parse(cli(["ticket", "get", "--ticket", ticketId])).status).toBe(
      "in_progress"
    );
    const session = idResult.parse(cli(["session", "create", "--ticket", ticketId]));
    for (const state of ["analyzing", "implementing"])
      cli(["session", "update-state", "--session", session.id, "--state", state]);
    cli(["ticket", "update-status", "--ticket", ticketId, "--status", "done"], 1);
    cli(["workflow", "complete-work", "--ticket", ticketId], 1);

    cpSync(join(source, "integration-tests", "fixtures", "whats-up-app"), project, {
      recursive: true,
    });
    cli(["session", "update-state", "--session", session.id, "--state", "testing"]);
    validateApp();
    cli([
      "comment",
      "add",
      "--ticket",
      ticketId,
      "--type",
      "test_report",
      "--content",
      "node --test server.test.mjs: passed (real HTTP routes, content, and method guards). Browser demo verification follows review.",
    ]);
    cli(["session", "update-state", "--session", session.id, "--state", "committing"]);
    git("add", ".");
    git("commit", "-m", `feat(${ticketId}): implement greeting flow`);
    cli(["git", "link-commit", "--ticket", ticketId, "--hash", git("rev-parse", "HEAD")]);
    cli([
      "workflow",
      "complete-work",
      "--ticket",
      ticketId,
      "--summary",
      "Implemented centered navigation and accessible greeting dialog.",
    ]);
    cli(["review", "get-review-context", "--ticket", ticketId]);
    const finding = z
      .object({ id: z.string() })
      .parse(
        cli([
          "review",
          "submit-finding",
          "--ticket",
          ticketId,
          "--agent",
          "code-reviewer",
          "--severity",
          "major",
          "--category",
          "test-probe",
          "--description",
          "Deliberate gate probe: verify that an open review finding prevents demo handoff.",
        ])
      );
    const boot = { start: ["node", "server.mjs", "--port", "{port}", "--host", "{host}"] };
    const steps: DemoStep[] = [
      {
        order: 1,
        description: "Home has a Next page button",
        expectedOutcome: "The button is visible",
        type: "visual",
        covers: ["criterion:1"],
        app: boot,
        automation: {
          kind: "ui",
          route: "/",
          viewport: { width: 1440, height: 1000 },
          actions: [{ act: "waitFor", selector: "#next" }],
          assert: [{ type: "visible", selector: "#next" }],
          screenshot: true,
        },
      },
      {
        order: 2,
        description: "Next page opens the whats up popup",
        expectedOutcome: "The greeting appears on the next page",
        type: "visual",
        covers: ["criterion:2"],
        automation: {
          kind: "ui",
          route: "/",
          actions: [
            { act: "click", selector: "#next" },
            { act: "waitFor", selector: "#greeting[open]" },
          ],
          assert: [
            { type: "url", expected: "/next" },
            { type: "text", selector: "#greeting-title", expected: "deliberately wrong greeting" },
          ],
          screenshot: true,
        },
      },
      {
        order: 3,
        description: "Close the popup and return Back to start",
        expectedOutcome: "Home button is visible again",
        type: "visual",
        covers: ["criterion:3"],
        automation: {
          kind: "ui",
          route: "/next",
          viewport: { width: 390, height: 844 },
          actions: [
            { act: "waitFor", selector: "#greeting[open]" },
            { act: "click", selector: "#greeting button" },
            { act: "click", selector: "a[href='/']" },
            { act: "waitFor", selector: "#next" },
          ],
          assert: [{ type: "visible", selector: "#next" }],
          screenshot: true,
        },
      },
    ];
    const stepsFile = join(root, "steps.json");
    writeFileSync(stepsFile, JSON.stringify(steps));
    const gate = z
      .object({ canProceedToVerification: z.boolean() })
      .parse(cli(["review", "check-complete", "--ticket", ticketId]));
    expect(gate.canProceedToVerification).toBe(false);
    cli(["review", "generate-demo", "--ticket", ticketId, "--steps-file", stepsFile], 1);
    cli(["review", "mark-fixed", "--finding", finding.id, "--status", "fixed"]);
    expect(
      z
        .object({ canProceedToVerification: z.boolean() })
        .parse(cli(["review", "check-complete", "--ticket", ticketId])).canProceedToVerification
    ).toBe(true);
    cli(["review", "generate-demo", "--ticket", ticketId, "--steps-file", stepsFile]);
    await waitForStatus(ticketId, "in_progress");
    expect(historyResult.parse(cli(["verify", "history", "--ticket", ticketId]))[0]?.status).toBe(
      "failed"
    );
    const prd = z.object({
      userStories: z.array(z.object({ passes: z.boolean(), status: z.string() })),
    });
    expect(prd.parse(JSON.parse(readFileSync(prdPath, "utf8"))).userStories[0]).toMatchObject({
      passes: false,
      status: "in_progress",
    });
    const findings = z
      .array(z.object({ id: z.string(), category: z.string() }))
      .parse(cli(["review", "get-findings", "--ticket", ticketId, "--status", "open"]));
    expect(findings.some((entry) => entry.category === "verification")).toBe(true);

    // Repair the deliberately incorrect demo expectation, then use the same gates.
    const greetingStep = steps[1];
    if (greetingStep?.automation?.kind !== "ui") throw new Error("Missing greeting automation");
    greetingStep.automation.assert = [
      { type: "url", expected: "/next" },
      { type: "text", selector: "#greeting-title", expected: "whats up" },
    ];
    writeFileSync(stepsFile, JSON.stringify(steps));
    validateApp();
    git("commit", "--allow-empty", "-m", `test(${ticketId}): correct deliberate demo expectation`);
    cli([
      "comment",
      "add",
      "--ticket",
      ticketId,
      "--type",
      "test_report",
      "--content",
      "node --test server.test.mjs: passed again. The deliberately incorrect demo assertion is corrected to whats up.",
    ]);
    // Ralph resolves verification findings after reporting, before completing
    // the repair pass. That bookkeeping must not stale the test report.
    for (const entry of findings)
      cli(["review", "mark-fixed", "--finding", entry.id, "--status", "fixed"]);
    cli([
      "workflow",
      "complete-work",
      "--ticket",
      ticketId,
      "--summary",
      "Corrected the deliberate verification probe; app unchanged.",
    ]);
    cli(["review", "get-review-context", "--ticket", ticketId]);
    expect(
      z
        .object({ canProceedToVerification: z.boolean() })
        .parse(cli(["review", "check-complete", "--ticket", ticketId])).canProceedToVerification
    ).toBe(true);
    cli(["review", "generate-demo", "--ticket", ticketId, "--steps-file", stepsFile]);
    await waitForStatus(ticketId, "done");
    const history = historyResult.parse(cli(["verify", "history", "--ticket", ticketId]));
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      status: "passed",
      certified: true,
      integrityStatus: "valid",
      gitSha: git("rev-parse", "HEAD"),
    });
    expect(history[0]?.manifest?.evidenceFiles).toHaveLength(3);
    for (const evidence of history[0]?.manifest?.evidenceFiles ?? [])
      expect(existsSync(evidence.path)).toBe(true);
    // PNG IHDR records the real captured dimensions, independent of demo metadata.
    for (const [order, width, height] of [
      [1, 1440, 1000],
      [3, 390, 844],
    ]) {
      const evidence = history[0]?.manifest?.evidenceFiles.find((file) =>
        file.path.endsWith(`step-${order}-ui.png`)
      );
      if (!evidence) throw new Error(`Missing screenshot for step ${order}`);
      const png = readFileSync(evidence.path);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height]);
    }
    expect(
      z.object({ status: z.string() }).parse(cli(["verify", "status", "--ticket", ticketId])).status
    ).toBe("succeeded");
    expect(prd.parse(JSON.parse(readFileSync(prdPath, "utf8"))).userStories[0]).toMatchObject({
      passes: true,
      status: "done",
    });

    // One batched visual/keyboard check on desktop and mobile, separate from certification.
    const { createApp } = await import("./fixtures/whats-up-app/server.mjs");
    const app = createApp();
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
    const address = app.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture address");
    const browser = await chromium.launch();
    try {
      for (const viewport of [
        { width: 1280, height: 800 },
        { width: 390, height: 844 },
      ]) {
        const page = await browser.newPage({ viewport });
        await page.goto(`http://127.0.0.1:${address.port}`);
        const button = page.locator("#next");
        const box = await button.boundingBox();
        if (!box) throw new Error("Missing center button");
        expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(1);
        expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(1);
        await page.screenshot({ path: join(root, `home-${viewport.width}.png`) });
        await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
        await browserExpect(page.locator("#greeting[open]")).toBeVisible();
        await browserExpect(page.locator("#greeting-title")).toHaveText("whats up");
        await page.screenshot({ path: join(root, `greeting-${viewport.width}.png`) });
        await page.keyboard.press("Escape");
        await browserExpect(page.locator("#greeting")).not.toBeVisible();
        await page.getByRole("link", { name: "Back to start" }).click();
        await browserExpect(button).toBeVisible();
        await page.close();
      }
    } finally {
      await browser.close();
      app.closeAllConnections();
      await new Promise<void>((resolve) => app.close(() => resolve()));
    }
    passed = true;
  } finally {
    console.log(`UQW CLI evidence: ${root}`);
    if (passed && process.env.BRAIN_DUMP_UQW_KEEP_ARTIFACTS !== "1")
      rmSync(root, { recursive: true, force: true });
  }
}, 180_000);
