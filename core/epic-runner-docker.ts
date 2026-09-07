import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ValidationError } from "./errors.ts";

export interface DockerDaemon {
  id: string;
  context: string | null;
  host: string | null;
  configDir: string;
  endpoint: string;
}

/** Pin Docker selection, including context precedence, across detached recovery processes. */
export function dockerEnv(
  selection: Pick<DockerDaemon, "context" | "host" | "configDir">
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, DOCKER_CONFIG: selection.configDir };
  delete env.DOCKER_CONTEXT;
  delete env.DOCKER_HOST;
  if (selection.context) env.DOCKER_CONTEXT = selection.context;
  else if (selection.host) env.DOCKER_HOST = selection.host;
  return env;
}

function command(args: string[], env: NodeJS.ProcessEnv): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 4000,
    killSignal: "SIGKILL",
    stdio: ["ignore", "pipe", "pipe"],
    env,
  }).trim();
}

export function resolveDockerDaemon(hostOverride?: string): DockerDaemon {
  const explicitContext = process.env.DOCKER_CONTEXT?.trim();
  const host = explicitContext ? null : hostOverride || process.env.DOCKER_HOST || null;
  const context = explicitContext || (!host ? command(["context", "show"], process.env) : null);
  const selection = {
    context,
    host,
    configDir: resolve(process.env.DOCKER_CONFIG || join(homedir(), ".docker")),
  };
  const env = dockerEnv(selection);
  const endpoint = context
    ? command(["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"], env)
    : host;
  const id = command(["info", "--format", "{{.ID}}"], env);
  if (!endpoint || !id)
    throw new ValidationError("Cannot identify the Docker daemon for Ralph ownership.");
  return { ...selection, endpoint, id };
}

export function parseDockerDaemon(raw: string | null): DockerDaemon {
  const value: unknown = raw ? JSON.parse(raw) : null;
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("endpoint" in value) ||
    typeof value.endpoint !== "string" ||
    !("configDir" in value) ||
    typeof value.configDir !== "string" ||
    !("context" in value) ||
    (value.context !== null && typeof value.context !== "string") ||
    !("host" in value) ||
    (value.host !== null && typeof value.host !== "string")
  ) {
    throw new ValidationError(
      "Owned Ralph container has no valid persisted Docker daemon; ownership retained."
    );
  }
  return value as DockerDaemon;
}

function assertSameDaemon(daemon: DockerDaemon): NodeJS.ProcessEnv {
  const env = dockerEnv(daemon);
  if (command(["info", "--format", "{{.ID}}"], env) !== daemon.id) {
    throw new ValidationError(
      "Docker selection now identifies a different daemon; Ralph ownership retained."
    );
  }
  return env;
}

function isMissingContainer(error: unknown): boolean {
  const stderr =
    typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr) : "";
  return /No such (object|container)/i.test(stderr);
}

export function containerRunning(name: string, daemon: DockerDaemon): boolean {
  const env = assertSameDaemon(daemon);
  try {
    const result = command(["inspect", "--format", "{{.State.Running}}", name], env);
    if (result !== "true" && result !== "false")
      throw new ValidationError("Docker returned an invalid container state.");
    return result === "true";
  } catch (error) {
    if (isMissingContainer(error)) return false;
    throw error;
  }
}

/** Run only after terminating the host group so no client can start the container afterward. */
export function removeOwnedContainer(name: string, daemon: DockerDaemon): void {
  const env = assertSameDaemon(daemon);
  try {
    command(["rm", "--force", name], env);
  } catch (error) {
    if (!isMissingContainer(error)) throw error;
  }
  if (containerRunning(name, daemon))
    throw new ValidationError(
      `Owned Ralph container ${name} is still running; ownership retained.`
    );
}
