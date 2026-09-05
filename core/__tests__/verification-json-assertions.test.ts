import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTestDatabase } from "../db.ts";
import { verifyTicket } from "../verification/run.ts";
import { resolveApiJsonAssertion } from "../verification/json-assertions.ts";
import type { DemoStepApiAutomation } from "../types.ts";

let db: Database.Database;
let root: string;
let server: Server;
let baseUrl: string;
const response = {
  total: 800,
  enabled: true,
  optional: null,
  inputs: { years: 1, amount: 1000 },
  annual: [1000, 800],
  label: "a=b",
};

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "verification-json-"));
  vi.stubEnv("HOME", root);
  vi.stubEnv("USERPROFILE", root);
  vi.stubEnv("APPDATA", join(root, "roaming"));
  vi.stubEnv("XDG_DATA_HOME", root);
  vi.stubEnv("XDG_STATE_HOME", root);
  db = createTestDatabase().db;
  db.prepare("INSERT INTO projects (id, name, path) VALUES ('p', 'JSON fixture', ?)").run(root);
  db.prepare(
    "INSERT INTO tickets (id, title, project_id, status) VALUES ('t', 'JSON fixture', 'p', 'ai_verification')"
  ).run();
  server = createServer((request, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(
        request.url === "/presets" ? [{ name: "Recovery 45/15", intervals: [45, 15] }] : response
      )
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

async function runAssertions(assert: DemoStepApiAutomation["assert"], path = "/") {
  const steps = [
    {
      order: 1,
      description: "Check typed JSON",
      expectedOutcome: "Values match",
      type: "automated",
      automation: { kind: "api", request: { method: "GET", path }, assert },
    },
  ];
  db.prepare(
    "INSERT INTO demo_scripts (id, ticket_id, steps, generated_at) VALUES ('d', 't', ?, ?)"
  ).run(JSON.stringify(steps), new Date().toISOString());
  return verifyTicket(db, { ticketId: "t", baseUrl });
}

it("compares typed JSON values from a real HTTP response without depending on object key order", async () => {
  const run = await runAssertions([
    { type: "status", expected: 200 },
    { type: "jsonPath", path: "$.total", expected: 800 },
    { type: "jsonPath", path: "enabled", expected: true },
    { type: "jsonPath", path: "optional", expected: null },
    { type: "jsonPath", path: "inputs", expected: { amount: 1000, years: 1 } },
    { type: "jsonPath", path: "annual", expected: [1000, 800] },
    { type: "jsonPath", path: "annual.1", expected: 800 },
    { type: "jsonPath", path: "$.annual[1]", expected: 800 },
    { type: "jsonPath", path: "$", expected: response },
    { type: "jsonPath", expected: { path: "$.enabled", value: true } },
    { type: "jsonPath", expected: "label=a=b" },
  ]);
  expect(run.status).toBe("passed");
  expect(run.manifest.stepVerdicts[0]?.response?.status).toBe(200);
});

it("resolves bracket indices in root and nested arrays from a real HTTP response", async () => {
  const run = await runAssertions(
    [
      { type: "jsonPath", path: "$[0].name", expected: "Recovery 45/15" },
      { type: "jsonPath", path: "$[0].intervals[1]", expected: 15 },
      { type: "jsonPath", path: "[0].intervals[0]", expected: 45 },
      { type: "jsonPath", path: "0.name", expected: "Recovery 45/15" },
    ],
    "/presets"
  );
  expect(run.status).toBe("passed");
});

it("rejects wrong values and distinguishes numbers from strings", async () => {
  const run = await runAssertions([
    { type: "jsonPath", path: "total", expected: "800" },
    { type: "jsonPath", path: "enabled", expected: false },
    { type: "jsonPath", path: "missing", expected: null },
  ]);
  expect(run.status).toBe("failed");
  expect(run.manifest.stepVerdicts[0]?.message).toContain('total to equal "800", got 800');
  expect(run.manifest.stepVerdicts[0]?.message).toContain("missing to equal null, got undefined");
});

it.each([undefined, null, "", 12])("rejects a malformed or missing API JSON path: %s", (path) => {
  expect(() => resolveApiJsonAssertion({ path, expected: 800 })).toThrow(/non-empty path/);
});
