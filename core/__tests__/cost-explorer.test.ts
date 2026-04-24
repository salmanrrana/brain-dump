import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../db.ts";
import {
  computeStageCosts,
  getCostExplorerData,
  getTicketCostDetail,
  listCostModels,
  recalculateCosts,
  seedCostModels,
  recordUsage,
  syncDefaultCostModels,
  upsertCostModel,
} from "../cost.ts";
import type { StateHistoryEntry } from "../types.ts";

let db: Database.Database;

function seedProject(id = "proj-1") {
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    "Test Project",
    "/tmp/test-project",
    new Date().toISOString()
  );
  return id;
}

function seedTicket(id = "ticket-1", projectId = "proj-1", epicId: string | null = null) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tickets (id, title, status, priority, position, project_id, epic_id, created_at, updated_at)
     VALUES (?, ?, 'in_progress', 'medium', 1, ?, ?, ?, ?)`
  ).run(id, `Ticket ${id}`, projectId, epicId, now, now);
  return id;
}

function seedEpic(id = "epic-1", projectId = "proj-1") {
  db.prepare("INSERT INTO epics (id, title, project_id, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    `Epic ${id}`,
    projectId,
    new Date().toISOString()
  );
  return id;
}

function seedRalphSession(
  id: string,
  ticketId: string,
  stateHistory: StateHistoryEntry[],
  completedAt: string | null = null
) {
  db.prepare(
    `INSERT INTO ralph_sessions (id, ticket_id, project_id, current_state, state_history, started_at, completed_at)
     VALUES (?, ?, 'proj-1', 'done', ?, ?, ?)`
  ).run(
    id,
    ticketId,
    JSON.stringify(stateHistory),
    stateHistory[0]?.timestamp ?? new Date().toISOString(),
    completedAt
  );
}

beforeEach(() => {
  const result = createTestDatabase();
  db = result.db;
  seedProject();
  seedCostModels(db);
});

describe("cost model defaults", () => {
  it("seeds the current Anthropic pricing catalog", () => {
    const anthropicModels = listCostModels(db)
      .filter((model) => model.provider === "anthropic")
      .map((model) => model.modelName);

    expect(anthropicModels).toEqual([
      "claude-haiku-3",
      "claude-haiku-3-5",
      "claude-haiku-4-5",
      "claude-opus-3",
      "claude-opus-4",
      "claude-opus-4-1",
      "claude-opus-4-5",
      "claude-opus-4-6",
      "claude-opus-4-7",
      "claude-sonnet-3-7",
      "claude-sonnet-4",
      "claude-sonnet-4-5",
      "claude-sonnet-4-6",
    ]);

    const sonnet45 = listCostModels(db).find((model) => model.modelName === "claude-sonnet-4-5");
    expect(sonnet45).toMatchObject({
      inputCostPerMtok: 3,
      outputCostPerMtok: 15,
      cacheReadCostPerMtok: 0.3,
      cacheCreateCostPerMtok: 3.75,
    });

    const haiku3 = listCostModels(db).find((model) => model.modelName === "claude-haiku-3");
    expect(haiku3).toMatchObject({
      inputCostPerMtok: 0.25,
      outputCostPerMtok: 1.25,
      cacheReadCostPerMtok: 0.03,
      cacheCreateCostPerMtok: 0.3,
    });
  });

  it("seeds the current OpenAI pricing catalog", () => {
    const openaiModels = listCostModels(db)
      .filter((model) => model.provider === "openai")
      .map((model) => model.modelName);

    expect(openaiModels).toEqual([
      "gpt-5.3-codex",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-5.4-pro",
      "gpt-5.5",
    ]);

    const codex = listCostModels(db).find((model) => model.modelName === "gpt-5.3-codex");
    expect(codex).toMatchObject({
      inputCostPerMtok: 1.75,
      outputCostPerMtok: 14,
      cacheReadCostPerMtok: 0.18,
    });

    const gpt55 = listCostModels(db).find((model) => model.modelName === "gpt-5.5");
    expect(gpt55).toMatchObject({
      inputCostPerMtok: 5,
      outputCostPerMtok: 30,
      cacheReadCostPerMtok: 0.5,
    });
  });

  it("seeds the current open source pricing catalog", () => {
    const openSourceModels = listCostModels(db)
      .filter((model) => model.provider === "opensource")
      .map((model) => model.modelName);

    expect(openSourceModels).toEqual([
      "Big Pickle",
      "GLM 5",
      "GLM 5.1",
      "Kimi K2.5",
      "MiniMax M2.5",
      "MiniMax M2.5 Free",
      "MiniMax M2.7",
      "Nemotron 3 Super Free",
      "Qwen3 Coder 480B",
      "Qwen3.6 Plus Free",
    ]);

    const minimax = listCostModels(db).find((model) => model.modelName === "MiniMax M2.5");
    expect(minimax).toMatchObject({
      provider: "opensource",
      inputCostPerMtok: 0.3,
      outputCostPerMtok: 1.2,
      cacheReadCostPerMtok: 0.06,
      cacheCreateCostPerMtok: 0.375,
    });
  });

  it("seeds the current cursor pricing catalog", () => {
    const cursorModels = listCostModels(db)
      .filter((model) => model.provider === "cursor")
      .map((model) => model.modelName);

    expect(cursorModels).toEqual(["Composer 2", "Composer 2 (Fast)"]);

    const composer = listCostModels(db).find((model) => model.modelName === "Composer 2");
    expect(composer).toMatchObject({
      provider: "cursor",
      inputCostPerMtok: 0.5,
      outputCostPerMtok: 2.5,
      cacheReadCostPerMtok: 0.2,
    });
  });

  it("reconciles legacy OpenAI defaults into the current catalog", () => {
    db.prepare("DELETE FROM cost_models WHERE provider = 'openai'").run();

    upsertCostModel(db, {
      provider: "openai",
      modelName: "gpt-4o",
      inputCostPerMtok: 2.5,
      outputCostPerMtok: 10,
    });
    upsertCostModel(db, {
      provider: "openai",
      modelName: "o3",
      inputCostPerMtok: 10,
      outputCostPerMtok: 40,
    });
    upsertCostModel(db, {
      provider: "openai",
      modelName: "gpt-5.4",
      inputCostPerMtok: 2.5,
      outputCostPerMtok: 15,
      cacheReadCostPerMtok: 0.25,
    });
    upsertCostModel(db, {
      provider: "openai",
      modelName: "gpt-5.4-pro",
      inputCostPerMtok: 30,
      outputCostPerMtok: 180,
    });

    const result = syncDefaultCostModels(db);

    expect(result).toEqual({ inserted: 4, updated: 0, removed: 2 });
    expect(
      listCostModels(db)
        .filter((model) => model.provider === "openai")
        .map((model) => model.modelName)
    ).toEqual([
      "gpt-5.3-codex",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-5.4-pro",
      "gpt-5.5",
    ]);
  });

  it("keeps custom OpenAI rows that do not match the legacy defaults", () => {
    db.prepare("DELETE FROM cost_models WHERE provider = 'openai'").run();

    upsertCostModel(db, {
      provider: "openai",
      modelName: "gpt-4o",
      inputCostPerMtok: 3,
      outputCostPerMtok: 11,
    });

    const result = syncDefaultCostModels(db);

    expect(result).toEqual({ inserted: 6, updated: 0, removed: 0 });
    expect(
      listCostModels(db).some(
        (model) =>
          model.provider === "openai" &&
          model.modelName === "gpt-4o" &&
          model.inputCostPerMtok === 3 &&
          model.outputCostPerMtok === 11
      )
    ).toBe(true);
  });

  it("syncs missing defaults before recalculating costs", () => {
    db.prepare("DELETE FROM cost_models WHERE provider = 'anthropic'").run();
    recordUsage(db, {
      model: "claude-sonnet-4-5-20250929",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    });

    const before = db.prepare("SELECT cost_usd FROM token_usage").get() as {
      cost_usd: number | null;
    };
    expect(before.cost_usd).toBe(0);

    const result = recalculateCosts(db);

    const after = db.prepare("SELECT cost_usd FROM token_usage").get() as {
      cost_usd: number | null;
    };
    expect(result.updatedRows).toBe(1);
    expect(after.cost_usd).toBeCloseTo(22.05);
  });
});

// ============================================
// computeStageCosts
// ============================================

describe("computeStageCosts", () => {
  it("computes time-proportional cost across states", () => {
    const t0 = new Date("2025-01-01T10:00:00Z");
    const t1 = new Date("2025-01-01T10:30:00Z"); // analyzing: 30 min
    const t2 = new Date("2025-01-01T11:30:00Z"); // implementing: 60 min

    const result = computeStageCosts([
      {
        stateHistory: [
          { state: "analyzing", timestamp: t0.toISOString() },
          { state: "implementing", timestamp: t1.toISOString() },
          { state: "done", timestamp: t2.toISOString() },
        ],
        totalCostUsd: 3.0,
        completedAt: t2.toISOString(),
      },
    ]);

    // analyzing: 30/(30+60) = 1/3 of $3 = $1
    // implementing: 60/(30+60) = 2/3 of $3 = $2
    const analyzing = result.get("analyzing");
    const implementing = result.get("implementing");

    expect(analyzing).toBeDefined();
    expect(analyzing!.costUsd).toBeCloseTo(1.0, 1);
    expect(implementing).toBeDefined();
    expect(implementing!.costUsd).toBeCloseTo(2.0, 1);
  });

  it("handles single-state sessions", () => {
    const result = computeStageCosts([
      {
        stateHistory: [{ state: "implementing", timestamp: "2025-01-01T10:00:00Z" }],
        totalCostUsd: 5.0,
        completedAt: "2025-01-01T11:00:00Z",
      },
    ]);

    expect(result.get("implementing")?.costUsd).toBe(5.0);
  });

  it("handles empty sessions", () => {
    const result = computeStageCosts([
      {
        stateHistory: [],
        totalCostUsd: 2.0,
        completedAt: null,
      },
    ]);

    // Falls back to idle with full cost
    expect(result.get("idle")?.costUsd).toBe(2.0);
  });

  it("skips sessions with zero cost", () => {
    const result = computeStageCosts([
      {
        stateHistory: [
          { state: "analyzing", timestamp: "2025-01-01T10:00:00Z" },
          { state: "done", timestamp: "2025-01-01T11:00:00Z" },
        ],
        totalCostUsd: 0,
        completedAt: "2025-01-01T11:00:00Z",
      },
    ]);

    expect(result.size).toBe(0);
  });

  it("aggregates across multiple sessions", () => {
    const result = computeStageCosts([
      {
        stateHistory: [
          { state: "analyzing", timestamp: "2025-01-01T10:00:00Z" },
          { state: "done", timestamp: "2025-01-01T11:00:00Z" },
        ],
        totalCostUsd: 2.0,
        completedAt: "2025-01-01T11:00:00Z",
      },
      {
        stateHistory: [
          { state: "analyzing", timestamp: "2025-01-02T10:00:00Z" },
          { state: "done", timestamp: "2025-01-02T11:00:00Z" },
        ],
        totalCostUsd: 3.0,
        completedAt: "2025-01-02T11:00:00Z",
      },
    ]);

    expect(result.get("analyzing")?.costUsd).toBe(5.0);
  });
});

// ============================================
// getCostExplorerData
// ============================================

describe("getCostExplorerData", () => {
  it("returns empty tree when no cost data exists", () => {
    const result = getCostExplorerData(db, {});

    expect(result.id).toBe("root");
    expect(result.type).toBe("project");
    expect(result.costUsd).toBe(0);
    expect(result.children).toEqual([]);
  });

  it("builds hierarchy with epics and tickets", () => {
    seedEpic("epic-1");
    seedTicket("t-1", "proj-1", "epic-1");
    seedTicket("t-2", "proj-1", "epic-1");

    recordUsage(db, {
      ticketId: "t-1",
      model: "claude-sonnet-4-6",
      inputTokens: 1000,
      outputTokens: 500,
    });
    recordUsage(db, {
      ticketId: "t-2",
      model: "claude-sonnet-4-6",
      inputTokens: 2000,
      outputTokens: 1000,
    });

    const result = getCostExplorerData(db, {});

    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.children).toHaveLength(1); // one epic
    expect(result.children![0]!.name).toBe("Epic epic-1");
    expect(result.children![0]!.children).toHaveLength(2); // two tickets
  });

  it("groups unassigned tickets separately", () => {
    seedEpic("epic-1");
    seedTicket("t-1", "proj-1", "epic-1");
    seedTicket("t-unassigned", "proj-1", null);

    recordUsage(db, {
      ticketId: "t-1",
      model: "claude-sonnet-4-6",
      inputTokens: 1000,
      outputTokens: 500,
    });
    recordUsage(db, {
      ticketId: "t-unassigned",
      model: "claude-sonnet-4-6",
      inputTokens: 500,
      outputTokens: 200,
    });

    const result = getCostExplorerData(db, {});

    expect(result.children).toHaveLength(2);
    const unassigned = result.children!.find((c) => c.type === "unassigned");
    expect(unassigned).toBeDefined();
    expect(unassigned!.name).toBe("[Unassigned]");
    expect(unassigned!.children).toHaveLength(1);
  });
});

// ============================================
// getTicketCostDetail
// ============================================

describe("getTicketCostDetail", () => {
  it("returns base cost data for ticket without ralph sessions", () => {
    seedTicket("t-1");
    recordUsage(db, {
      ticketId: "t-1",
      model: "claude-sonnet-4-6",
      inputTokens: 1000,
      outputTokens: 500,
    });

    const result = getTicketCostDetail(db, "t-1");

    expect(result.ticketId).toBe("t-1");
    expect(result.totalCostUsd).toBeGreaterThan(0);
    expect(result.stages).toEqual([]); // no ralph sessions = no stages
  });

  it("includes stage breakdown when ralph sessions exist", () => {
    seedTicket("t-1");

    const t0 = "2025-01-01T10:00:00.000Z";
    const t1 = "2025-01-01T10:30:00.000Z";
    const t2 = "2025-01-01T11:30:00.000Z";

    seedRalphSession(
      "rs-1",
      "t-1",
      [
        { state: "analyzing", timestamp: t0 },
        { state: "implementing", timestamp: t1 },
        { state: "done", timestamp: t2 },
      ],
      t2
    );

    // Record usage within the session time window
    recordUsage(db, {
      ticketId: "t-1",
      model: "claude-sonnet-4-6",
      inputTokens: 1000,
      outputTokens: 500,
      recordedAt: "2025-01-01T10:15:00.000Z",
    });

    const result = getTicketCostDetail(db, "t-1");

    expect(result.stages.length).toBeGreaterThan(0);
    const stageNames = result.stages.map((s) => s.stage);
    expect(stageNames).toContain("analyzing");
    expect(stageNames).toContain("implementing");
  });
});
