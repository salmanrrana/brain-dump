import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { createTestDatabase } from "../db.ts";
import { claimEpicRunner, releaseEpicRunner, runEpicScript } from "../epic-runner.ts";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateRalphScript } from "../../src/api/ralph-script.ts";
import { saveAutonomousEpicLaunch } from "../epic-continuation.ts";

const databases: ReturnType<typeof createTestDatabase>[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.db.close();
  vi.unstubAllEnvs();
});

it("excludes a second live process, preserves ownership on relaunch, and recovers a dead owner", async () => {
  const database = createTestDatabase();
  databases.push(database);
  const { db } = database;
  db.prepare("INSERT INTO projects (id, name, path) VALUES ('p', 'P', '/tmp/p')").run();
  db.prepare("INSERT INTO epics (id, title, project_id) VALUES ('e', 'E', 'p')").run();
  const profile = {
    epicId: "e",
    projectPath: "/tmp/p",
    scriptPath: "/tmp/ralph.sh",
    maxIterations: 3,
  };
  saveAutonomousEpicLaunch(db, profile);
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"]);
  await once(child, "spawn");
  const pid = child.pid!;
  try {
    expect(claimEpicRunner(db, "e", pid)).toEqual({ acquired: true });
    expect(claimEpicRunner(db, "e", process.pid)).toEqual({ acquired: false });
    releaseEpicRunner(db, "e", process.pid);
    const rollback = saveAutonomousEpicLaunch(db, { ...profile, scriptPath: "/tmp/relaunch.sh" });
    expect(claimEpicRunner(db, "e", process.pid)).toEqual({ acquired: false });
    rollback();
    expect(
      db
        .prepare(
          "SELECT active, json_extract(profile_json, '$.scriptPath') path FROM autonomous_epic_launches"
        )
        .get()
    ).toEqual({ active: 1, path: profile.scriptPath });
    const exited = once(child, "exit");
    child.kill();
    await exited;
    expect(claimEpicRunner(db, "e", process.pid)).toEqual({ acquired: true });
    releaseEpicRunner(db, "e", pid);
    expect(
      db
        .prepare(
          "SELECT json_extract(profile_json, '$.runnerPid') pid FROM autonomous_epic_launches"
        )
        .get()
    ).toEqual({ pid: process.pid });
    releaseEpicRunner(db, "e", process.pid);
    expect(
      db
        .prepare(
          "SELECT json_extract(profile_json, '$.runnerPid') pid FROM autonomous_epic_launches"
        )
        .get()
    ).toEqual({ pid: null });
  } finally {
    child.kill();
  }
});

it.skipIf(process.platform === "win32")(
  "retains exclusion for a surviving process group after its supervisor dies",
  async () => {
    const { db } = createTestDatabase();
    databases.push({ db } as ReturnType<typeof createTestDatabase>);
    db.prepare("INSERT INTO projects (id,name,path) VALUES ('p','P','/tmp/p')").run();
    db.prepare("INSERT INTO epics (id,title,project_id) VALUES ('e','E','p')").run();
    saveAutonomousEpicLaunch(db, {
      epicId: "e",
      projectPath: "/tmp/p",
      scriptPath: "/tmp/ralph.sh",
      maxIterations: 3,
    });
    const owner = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"]);
    const survivor = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      detached: true,
    });
    await Promise.all([once(owner, "spawn"), once(survivor, "spawn")]);
    try {
      claimEpicRunner(db, "e", owner.pid!);
      db.prepare(
        "UPDATE autonomous_epic_launches SET profile_json=json_set(profile_json,'$.runnerGroupPid',CAST(? AS INTEGER))"
      ).run(survivor.pid!);
      const exited = once(owner, "exit");
      owner.kill("SIGKILL");
      await exited;
      expect(claimEpicRunner(db, "e", process.pid)).toEqual({ acquired: false });
      const stopped = once(survivor, "exit");
      survivor.kill();
      await stopped;
      expect(claimEpicRunner(db, "e", process.pid)).toEqual({ acquired: true });
    } finally {
      owner.kill();
      survivor.kill();
    }
  }
);

it("supervises a real gated shell and releases a finished run", async () => {
  const database = createTestDatabase();
  databases.push(database);
  const { db } = database;
  const root = mkdtempSync(join(tmpdir(), "epic-runner-"));
  try {
    db.prepare("INSERT INTO projects (id,name,path) VALUES ('p','P',?)").run(root);
    db.prepare("INSERT INTO epics (id,title,project_id) VALUES ('e','E','p')").run();
    const scriptPath = join(root, "run.sh");
    writeFileSync(scriptPath, '#!/bin/bash\n[ "$BRAIN_DUMP_EPIC_RUNNER_CHILD" = "e:$$" ]\n');
    saveAutonomousEpicLaunch(db, { epicId: "e", projectPath: root, scriptPath, maxIterations: 1 });
    expect(
      await runEpicScript(db, { epicId: "e", scriptPath, maxIterations: 1, timeoutSeconds: 3 })
    ).toBe(0);
    expect(
      db
        .prepare(
          "SELECT json_extract(profile_json,'$.runnerPid') pid FROM autonomous_epic_launches"
        )
        .get()
    ).toEqual({ pid: null });
    db.prepare(
      "INSERT INTO tickets (id,title,project_id,epic_id,status) VALUES ('t','T','p','e','done')"
    ).run();
    expect(
      await runEpicScript(db, {
        epicId: "e",
        scriptPath: join(root, "must-not-run.sh"),
        maxIterations: 1,
        timeoutSeconds: 3,
        resumeTicketId: "t",
      })
    ).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.skipIf(process.platform === "win32")(
  "refuses recovery while an owned sandbox survives and fails visibly when Docker cannot be checked",
  () => {
    const database = createTestDatabase();
    databases.push(database);
    const { db } = database;
    const root = mkdtempSync(join(tmpdir(), "epic-docker-state-"));
    try {
      db.prepare("INSERT INTO projects (id,name,path) VALUES ('p','P',?)").run(root);
      db.prepare("INSERT INTO epics (id,title,project_id) VALUES ('e','E','p')").run();
      saveAutonomousEpicLaunch(db, {
        epicId: "e",
        projectPath: root,
        scriptPath: "/tmp/unused.sh",
        maxIterations: 1,
      });
      db.prepare(
        "UPDATE autonomous_epic_launches SET profile_json=json_set(profile_json,'$.runnerContainerName','ralph-test','$.runnerDockerDaemon',json(?))"
      ).run(
        JSON.stringify({
          id: "test-daemon",
          context: null,
          host: "unix:///test.sock",
          configDir: root,
          endpoint: "unix:///test.sock",
        })
      );
      const docker = join(root, "docker");
      writeFileSync(
        docker,
        '#!/bin/sh\nif [ "$1" = info ]; then echo test-daemon; else echo true; fi\n',
        { mode: 0o700 }
      );
      vi.stubEnv("PATH", root);
      expect(claimEpicRunner(db, "e", process.pid)).toEqual({ acquired: false });
      writeFileSync(docker, '#!/bin/sh\necho "Cannot connect to Docker" >&2\nexit 1\n');
      expect(() => claimEpicRunner(db, "e", process.pid)).toThrow();
      const removed = join(root, "removed");
      writeFileSync(
        docker,
        `#!/bin/sh
if [ "$1" = info ]; then echo test-daemon; exit 0; fi
if [ "$1" = rm ]; then echo removed > "${removed}"; exit 0; fi
echo false
`
      );
      expect(claimEpicRunner(db, "e", process.pid)).toEqual({ acquired: true });
      expect(readFileSync(removed, "utf8").trim()).toBe("removed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
);

it.skipIf(process.platform === "win32")(
  "kills a TERM-ignoring group on its independent execution deadline",
  async () => {
    const database = createTestDatabase();
    databases.push(database);
    const { db } = database;
    const root = mkdtempSync(join(tmpdir(), "epic-deadline-"));
    try {
      db.prepare("INSERT INTO projects (id,name,path) VALUES ('p','P',?)").run(root);
      db.prepare("INSERT INTO epics (id,title,project_id) VALUES ('e','E','p')").run();
      const scriptPath = join(root, "run.sh");
      writeFileSync(scriptPath, '#!/bin/bash\ntrap "" TERM\nwhile true; do sleep 10; done\n');
      saveAutonomousEpicLaunch(db, {
        epicId: "e",
        projectPath: root,
        scriptPath,
        maxIterations: 1,
      });
      const start = Date.now();
      expect(
        await runEpicScript(db, { epicId: "e", scriptPath, maxIterations: 1, timeoutSeconds: 1 })
      ).toBe(124);
      expect(Date.now() - start).toBeLessThan(8000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  10000
);

it.skipIf(process.platform === "win32")(
  "ends the supervised run when an iteration leaves a child holding the output pipe",
  async () => {
    const database = createTestDatabase();
    databases.push(database);
    const { db } = database;
    const root = mkdtempSync(join(tmpdir(), "epic-iteration-deadline-"));
    try {
      mkdirSync(join(root, "plans"));
      mkdirSync(join(root, "bin"));
      writeFileSync(
        join(root, "plans/prd.json"),
        JSON.stringify({ userStories: [{ id: "t", passes: false, status: "in_progress" }] })
      );
      const invocations = join(root, "invocations");
      writeFileSync(
        join(root, "bin/claude"),
        `#!/bin/bash
trap 'exit 0' TERM
echo started >> "${invocations}"
bash -c 'trap "" TERM; while true; do sleep 1; done' &
wait
`,
        { mode: 0o700 }
      );
      vi.stubEnv("PATH", join(root, "bin") + ":" + process.env.PATH);
      vi.stubEnv("BRAIN_DUMP_EPIC_CONTINUATION", "1");
      db.prepare("INSERT INTO projects (id,name,path) VALUES ('p','P',?)").run(root);
      db.prepare("INSERT INTO epics (id,title,project_id) VALUES ('e','E','p')").run();
      const scriptPath = join(root, "run.sh");
      writeFileSync(
        scriptPath,
        generateRalphScript(
          root,
          2,
          false,
          undefined,
          30,
          null,
          { projectId: "p", projectName: "P", epicId: "e" },
          "claude",
          { type: "implementation" },
          undefined,
          1
        )
      );
      saveAutonomousEpicLaunch(db, {
        epicId: "e",
        projectPath: root,
        scriptPath,
        maxIterations: 2,
      });
      // A separate process owns OS signals; Vitest's threaded worker shares its runner PID.
      const supervisor = join(root, "supervisor.mts");
      writeFileSync(
        supervisor,
        `
import { createTestDatabase } from ${JSON.stringify(new URL("../db.ts", import.meta.url).href)};
import { runEpicScript } from ${JSON.stringify(new URL("../epic-runner.ts", import.meta.url).href)};
import { saveAutonomousEpicLaunch } from ${JSON.stringify(new URL("../epic-continuation.ts", import.meta.url).href)};
const {db}=createTestDatabase();
db.prepare("INSERT INTO projects(id,name,path)VALUES('p','P',?)").run(${JSON.stringify(root)});
db.prepare("INSERT INTO epics(id,title,project_id)VALUES('e','E','p')").run();
saveAutonomousEpicLaunch(db,{epicId:'e',projectPath:${JSON.stringify(root)},scriptPath:${JSON.stringify(scriptPath)},maxIterations:2});
const code=await runEpicScript(db,{epicId:'e',scriptPath:${JSON.stringify(scriptPath)},maxIterations:2,timeoutSeconds:30});
if(code!==124)throw new Error('Expected iteration timeout, got '+code);
db.close();
`
      );
      const started = Date.now();
      execFileSync(
        process.execPath,
        [
          "--import",
          new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href,
          supervisor,
        ],
        { env: process.env, stdio: "pipe", timeout: 9000 }
      );
      expect(Date.now() - started).toBeLessThan(8000);
      expect(readFileSync(invocations, "utf8").trim().split("\n")).toEqual(["started"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  10000
);
