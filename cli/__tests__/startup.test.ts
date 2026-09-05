import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("loads only the requested CLI resource and keeps help independent of the database", () => {
  const root = mkdtempSync(join(tmpdir(), "brain-dump-startup-"));
  const source = resolve(import.meta.dirname, "../..");
  const env = {
    ...process.env,
    HOME: root,
    APPDATA: join(root, "roaming"),
    LOCALAPPDATA: join(root, "local"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_STATE_HOME: join(root, "state"),
    BRAIN_DUMP_DISABLE_DB_STARTUP_TASKS: "1",
    BRAIN_DUMP_DISABLE_VERIFICATION_WORKER: "1",
  };
  const cli = ["--import", "tsx", "cli/brain-dump.ts"];
  try {
    // Make an unrelated command module unavailable, like a missing optional
    // provider dependency. Reading a ticket must not load that command.
    const guard = join(root, "guard.mjs");
    writeFileSync(
      guard,
      `export async function load(url, context, next) {
        if (url.includes('/cli/commands/') && !url.endsWith('/ticket.ts'))
          throw new Error('Unrelated command loaded: ' + url);
        if (process.env.STARTUP_HELP === '1' && url.endsWith('/core/db.ts'))
          throw new Error('Help loaded the database');
        return next(url, context);
      }`
    );
    const register = join(root, "register.mjs");
    writeFileSync(
      register,
      `import { register } from 'node:module'; register(${JSON.stringify(pathToFileURL(guard).href)});`
    );
    for (const args of [["--help"], ["help", "review"], ["review", "--help"]]) {
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "--import", register, "cli/brain-dump.ts", ...args],
        {
          cwd: source,
          env: { ...env, STARTUP_HELP: "1" },
          encoding: "utf8",
          timeout: 10000,
        }
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("brain-dump");
    }
    const project = JSON.parse(
      execFileSync(
        process.execPath,
        [...cli, "project", "create", "--name", "Startup", "--path", root],
        { cwd: source, env, encoding: "utf8" }
      )
    ) as { id: string };
    const ticket = JSON.parse(
      execFileSync(
        process.execPath,
        [...cli, "ticket", "create", "--project", project.id, "--title", "Startup"],
        { cwd: source, env, encoding: "utf8" }
      )
    ) as { id: string };
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--import",
        register,
        "cli/brain-dump.ts",
        "ticket",
        "get",
        "--ticket",
        ticket.id,
      ],
      { cwd: source, env, encoding: "utf8", timeout: 10000 }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ id: ticket.id, title: "Startup" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 20000);
