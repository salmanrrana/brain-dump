import type { DbHandle } from "./types.ts";
import { ValidationError } from "./errors.ts";
import { spawn } from "node:child_process";
import { Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import {
  containerRunning,
  dockerEnv,
  parseDockerDaemon,
  removeOwnedContainer,
  resolveDockerDaemon,
  type DockerDaemon,
} from "./epic-runner-docker.ts";

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Serialize interactive Ralph and repair continuations before either invokes AI. */
export function claimEpicRunner(db: DbHandle, epicId: string, pid: number): { acquired: boolean } {
  if (!Number.isSafeInteger(pid) || pid <= 0 || !isAlive(pid)) {
    throw new ValidationError("Epic runner requires the PID of a live local process.");
  }
  const select = db.prepare(
    "SELECT json_extract(profile_json, '$.runnerPid') AS pid, json_extract(profile_json, '$.runnerGroupPid') AS groupPid, json_extract(profile_json, '$.runnerContainerName') AS containerName, json_extract(profile_json, '$.runnerDockerDaemon') AS dockerDaemon FROM autonomous_epic_launches WHERE epic_id = ?"
  );
  type Owner = {
    pid: number | null;
    groupPid: number | null;
    containerName: string | null;
    dockerDaemon: string | null;
  };
  const observed = select.get(epicId) as Owner | undefined;
  if (!observed) throw new ValidationError("Epic runner launch profile is missing.");
  if (
    (observed.groupPid &&
      isAlive(process.platform === "win32" ? observed.groupPid : -observed.groupPid)) ||
    (observed.pid !== pid && observed.pid && isAlive(observed.pid))
  )
    return { acquired: false };
  // A daemon check is needed only after the host owner dies. Keep that bounded
  // I/O outside the write transaction so an unavailable Docker cannot lock the board.
  if (observed.containerName) {
    const daemon = parseDockerDaemon(observed.dockerDaemon);
    if (containerRunning(observed.containerName, daemon)) return { acquired: false };
    // A host can die after Docker creates the container but before it starts.
    // Retire that resource before forgetting its persisted ownership.
    removeOwnedContainer(observed.containerName, daemon);
  }
  return db
    .transaction(() => {
      const current = select.get(epicId) as Owner | undefined;
      if (
        !current ||
        current.pid !== observed.pid ||
        current.groupPid !== observed.groupPid ||
        current.containerName !== observed.containerName ||
        current.dockerDaemon !== observed.dockerDaemon
      )
        return { acquired: false };
      db.prepare(
        "UPDATE autonomous_epic_launches SET profile_json = json_set(json_remove(profile_json, '$.runnerGroupPid', '$.runnerContainerName', '$.runnerDockerDaemon'), '$.runnerPid', CAST(? AS INTEGER)) WHERE epic_id = ?"
      ).run(pid, epicId);
      return { acquired: true };
    })
    .immediate();
}

/** A stale owner cannot release a successor's claim. Dead owners are reclaimed on acquisition. */
export function releaseEpicRunner(db: DbHandle, epicId: string, pid: number): void {
  db.prepare(
    "UPDATE autonomous_epic_launches SET profile_json = json_remove(profile_json, '$.runnerPid', '$.runnerGroupPid', '$.runnerContainerName', '$.runnerDockerDaemon') WHERE epic_id = ? AND json_extract(profile_json, '$.runnerPid') = ?"
  ).run(epicId, pid);
}

/** Supervise a process group; the child cannot invoke AI until its group is persisted. */
export async function runEpicScript(
  db: DbHandle,
  options: {
    epicId: string;
    scriptPath: string;
    maxIterations: number;
    resumeTicketId?: string;
    timeoutSeconds: number;
    useSandbox?: boolean;
    dockerHost?: string;
  }
): Promise<number> {
  const containerName = options.useSandbox ? `ralph-${randomUUID()}` : undefined;
  const deadline = Date.now() + options.timeoutSeconds * 1000;
  while (!claimEpicRunner(db, options.epicId, process.pid).acquired) {
    if (!options.resumeTicketId)
      throw new ValidationError("Another Ralph process already owns this epic.");
    const ticket = db
      .prepare("SELECT status FROM tickets WHERE id = ? AND epic_id = ?")
      .get(options.resumeTicketId, options.epicId) as { status: string } | undefined;
    if (!ticket) throw new ValidationError("Epic continuation target is missing.");
    if (ticket.status === "done" || ticket.status === "ai_verification") return 0;
    if (Date.now() >= deadline)
      throw new ValidationError("Timed out waiting for the existing Ralph owner.");
    await delay(1000);
  }
  let groupPid: number | undefined;
  let daemon: DockerDaemon | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let executionTimer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const signalGroup = (signal: NodeJS.Signals) => {
    if (!groupPid) return;
    try {
      process.kill(process.platform === "win32" ? groupPid : -groupPid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  const interrupt = () => {
    signalGroup("SIGTERM");
    killTimer ??= setTimeout(() => signalGroup("SIGKILL"), 3000);
  };
  const iterationTimedOut = () => {
    timedOut = true;
    interrupt();
  };
  try {
    // The owner may have handed off while a repair was waiting for its claim.
    if (options.resumeTicketId) {
      const ticket = db
        .prepare("SELECT status FROM tickets WHERE id = ? AND epic_id = ?")
        .get(options.resumeTicketId, options.epicId) as { status: string } | undefined;
      if (!ticket) throw new ValidationError("Epic continuation target is missing.");
      if (ticket.status === "done" || ticket.status === "ai_verification") return 0;
    }
    if (options.useSandbox) daemon = resolveDockerDaemon(options.dockerHost);
    const child = spawn(
      "bash",
      [
        "-c",
        'set -e; read -r gate <&3; export BRAIN_DUMP_EPIC_RUNNER_CHILD="$BRAIN_DUMP_EPIC_RUNNER_CHILD:$$"; exec bash "$@"',
        "ralph-runner",
        options.scriptPath,
        String(options.maxIterations),
        options.resumeTicketId ?? "",
      ],
      {
        detached: process.platform !== "win32",
        stdio: ["inherit", "inherit", "inherit", "pipe"],
        env: {
          ...(daemon ? dockerEnv(daemon) : process.env),
          BRAIN_DUMP_EPIC_RUNNER_CHILD: options.epicId,
          BRAIN_DUMP_EPIC_SUPERVISOR_PID: String(process.pid),
          BRAIN_DUMP_SUPERVISED_CONTAINER: containerName ?? "",
        },
      }
    );
    const done = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
    groupPid = child.pid;
    if (!groupPid) return await done;
    const registered = db
      .prepare(
        "UPDATE autonomous_epic_launches SET profile_json = json_set(profile_json, '$.runnerGroupPid', CAST(? AS INTEGER), '$.runnerContainerName', ?, '$.runnerDockerDaemon', json(?)) WHERE epic_id = ? AND json_extract(profile_json, '$.runnerPid') = ?"
      )
      .run(
        groupPid,
        containerName ?? null,
        daemon ? JSON.stringify(daemon) : null,
        options.epicId,
        process.pid
      );
    if (registered.changes !== 1)
      throw new ValidationError("Epic runner ownership changed before startup.");
    process.on("SIGUSR2", iterationTimedOut);
    process.on("SIGTERM", interrupt);
    process.on("SIGINT", interrupt);
    process.on("SIGHUP", interrupt);
    executionTimer = setTimeout(() => {
      timedOut = true;
      console.error(
        `Ralph exceeded its ${options.timeoutSeconds}s execution deadline; stopping its process group.`
      );
      interrupt();
    }, options.timeoutSeconds * 1000);
    const gate = child.stdio[3];
    if (!(gate instanceof Writable))
      throw new ValidationError("Epic runner startup gate is unavailable.");
    gate.on("error", interrupt);
    gate.end("start\n");
    const code = await done;
    return timedOut ? 124 : code;
  } finally {
    if (executionTimer) clearTimeout(executionTimer);
    if (killTimer) clearTimeout(killTimer);
    process.off("SIGUSR2", iterationTimedOut);
    process.off("SIGTERM", interrupt);
    process.off("SIGINT", interrupt);
    process.off("SIGHUP", interrupt);
    // timeout runs in foreground mode so provider descendants stay in this group.
    signalGroup("SIGTERM");
    let groupGone = true;
    if (groupPid) {
      const group = process.platform === "win32" ? groupPid : -groupPid;
      const end = Date.now() + 3000;
      while (isAlive(group) && Date.now() < end) await delay(50);
      if (isAlive(group)) signalGroup("SIGKILL");
      // Retain the group until the OS confirms it is gone, even after supervisor death.
      groupGone = !isAlive(group);
    }
    if (groupPid && containerName && daemon) removeOwnedContainer(containerName, daemon);
    if (groupGone) releaseEpicRunner(db, options.epicId, process.pid);
  }
}
