import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateRalphScript } from "./ralph-script";

const codexScript = generateRalphScript(
  "/tmp/project",
  3,
  false,
  undefined,
  undefined,
  null,
  undefined,
  "codex"
);

describe("generateRalphScript codex backend", () => {
  it("runs Codex via 'exec' with the combined bypass flag so the loop advances", () => {
    expect(codexScript).toContain("export RALPH_SESSION=1");
    // Headless entrypoint — 'exec' subcommand is what exits after one iteration.
    expect(codexScript).toContain(
      'codex exec --dangerously-bypass-approvals-and-sandbox "$(cat "$PROMPT_FILE")"'
    );
    // Preflight probes 'codex exec --help' directly (real capability check).
    expect(codexScript).toContain("codex exec --help 2>&1");
    expect(codexScript).toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  it("does not launch the interactive TUI entrypoint without 'exec'", () => {
    // The bare-TUI invocation — `codex "$(cat "$PROMPT_FILE")"` — must not appear,
    // because it blocks the loop from advancing.
    expect(codexScript).not.toMatch(/^\s*codex "\$\(cat "\$PROMPT_FILE"\)"\s*$/m);
  });

  it("does not run Codex under its sandbox during Ralph (parity with Claude)", () => {
    // Sandbox modes recreate the permission-prompt nightmare we are fixing.
    expect(codexScript).not.toContain("--sandbox read-only");
    expect(codexScript).not.toContain("--sandbox workspace-write");
  });

  it("does not swallow codex help failures with '|| true'", () => {
    // '|| true' on captures would mask broken shims and empty output; the preflight
    // must drive its decisions off real exit status, not post-hoc greps on empty strings.
    expect(codexScript).not.toContain("codex --help 2>&1 || true");
    expect(codexScript).not.toContain("codex exec --help 2>&1 || true");
  });
});

// Integration tests: actually execute the generated codex preflight snippet under
// bash, against stubbed `codex` binaries on PATH. Locks in preflight behavior so
// tweaking the grep pattern or reintroducing `|| true` silently would break these.
describe("generateRalphScript codex preflight (executed under bash)", () => {
  // Extract the codex preflight snippet from the generated script.
  const preflightStart = codexScript.indexOf("if ! command -v codex");
  const preflightEnd = codexScript.indexOf("# Ensure plans directory exists");
  if (preflightStart < 0 || preflightEnd < 0 || preflightEnd <= preflightStart) {
    throw new Error("Could not extract codex preflight snippet from generated script");
  }
  const preflightSnippet = codexScript.slice(preflightStart, preflightEnd);

  let tmpRoot: string;
  let preflightPath: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "ralph-codex-preflight-"));
    preflightPath = join(tmpRoot, "preflight.sh");
    writeFileSync(preflightPath, `#!/bin/bash\nset -e\n${preflightSnippet}\necho PREFLIGHT_OK\n`, {
      mode: 0o755,
    });
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function makeStubDir(name: string, stubBody: string): string {
    const dir = join(tmpRoot, name);
    mkdirSync(dir, { recursive: true });
    const stub = join(dir, "codex");
    writeFileSync(stub, stubBody, { mode: 0o755 });
    chmodSync(stub, 0o755);
    return dir;
  }

  function runPreflight(stubDir: string): { status: number; combined: string } {
    try {
      const stdout = execFileSync("bash", [preflightPath], {
        env: { PATH: `${stubDir}:/usr/bin:/bin` },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { status: 0, combined: stdout };
    } catch (err) {
      const e = err as NodeJS.ErrnoException & {
        status?: number;
        stdout?: Buffer | string;
        stderr?: Buffer | string;
      };
      const out = typeof e.stdout === "string" ? e.stdout : (e.stdout?.toString() ?? "");
      const errOut = typeof e.stderr === "string" ? e.stderr : (e.stderr?.toString() ?? "");
      return { status: e.status ?? -1, combined: out + errOut };
    }
  }

  it("passes when codex exec --help advertises the bypass flag", () => {
    const stubDir = makeStubDir(
      "stub-new",
      `#!/bin/bash
if [ "$1" = "exec" ] && [ "$2" = "--help" ]; then
  cat <<'HELP'
Usage: codex exec [OPTIONS] [PROMPT]

Options:
  --dangerously-bypass-approvals-and-sandbox
  --help
HELP
  exit 0
fi
echo "unhandled: $*" >&2
exit 127
`
    );

    const result = runPreflight(stubDir);
    expect(result.status).toBe(0);
    expect(result.combined).toContain("PREFLIGHT_OK");
  });

  it("fails with a clear hint when codex is missing entirely", () => {
    const emptyDir = join(tmpRoot, "stub-empty");
    mkdirSync(emptyDir, { recursive: true });

    const result = runPreflight(emptyDir);
    expect(result.status).toBe(1);
    expect(result.combined).toContain("Codex CLI not found in PATH");
  });

  it("fails with an 'exec' upgrade hint when codex lacks the exec subcommand", () => {
    const stubDir = makeStubDir(
      "stub-old",
      `#!/bin/bash
# Old codex: no 'exec' subcommand — exits non-zero when invoked as 'codex exec --help'.
if [ "$1" = "exec" ]; then
  echo "error: unrecognized subcommand 'exec'" >&2
  exit 2
fi
echo "usage: codex <prompt>"
`
    );

    const result = runPreflight(stubDir);
    expect(result.status).toBe(1);
    expect(result.combined).toContain("missing the 'exec' subcommand");
  });

  it("fails with a flag upgrade hint when codex exec exists but lacks the bypass flag", () => {
    const stubDir = makeStubDir(
      "stub-partial",
      `#!/bin/bash
if [ "$1" = "exec" ] && [ "$2" = "--help" ]; then
  cat <<'HELP'
Usage: codex exec [OPTIONS] [PROMPT]

Options:
  --help
HELP
  exit 0
fi
exit 0
`
    );

    const result = runPreflight(stubDir);
    expect(result.status).toBe(1);
    expect(result.combined).toContain("missing --dangerously-bypass-approvals-and-sandbox");
  });

  it("fails when codex exec is a broken shim that crashes silently", () => {
    // Regression guard: previous `|| true` guards would have let this slip through.
    const stubDir = makeStubDir(
      "stub-crash",
      `#!/bin/bash
if [ "$1" = "exec" ] && [ "$2" = "--help" ]; then
  exit 137
fi
exit 0
`
    );

    const result = runPreflight(stubDir);
    expect(result.status).toBe(1);
    expect(result.combined).toContain("missing the 'exec' subcommand");
  });
});
