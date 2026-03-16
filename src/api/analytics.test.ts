import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { randomUUID } from "crypto";
import { loadDashboardAnalytics } from "./analytics";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");

  sqlite.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      color TEXT,
      working_method TEXT DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE epics (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE tickets (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT,
      position REAL NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
      tags TEXT,
      subtasks TEXT,
      is_blocked INTEGER DEFAULT 0,
      blocked_reason TEXT,
      linked_files TEXT,
      attachments TEXT,
      linked_commits TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      branch_name TEXT,
      pr_number INTEGER,
      pr_url TEXT,
      pr_status TEXT
    );

    CREATE TABLE ticket_comments (
      id TEXT PRIMARY KEY NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'comment',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE ralph_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      current_state TEXT NOT NULL DEFAULT 'idle',
      state_history TEXT,
      outcome TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
  `);

  const db = drizzle(sqlite);
  return { sqlite, db, close: () => sqlite.close() };
}

describe("loadDashboardAnalytics", () => {
  let testDb: ReturnType<typeof createTestDb>;

  beforeAll(() => {
    testDb = createTestDb();
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.sqlite.exec("DELETE FROM ralph_sessions");
    testDb.sqlite.exec("DELETE FROM ticket_comments");
    testDb.sqlite.exec("DELETE FROM tickets");
    testDb.sqlite.exec("DELETE FROM epics");
    testDb.sqlite.exec("DELETE FROM projects");
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function insertProject(name = "Test Project"): string {
    const id = randomUUID();
    testDb.sqlite
      .prepare("INSERT INTO projects (id, name, path) VALUES (?, ?, ?)")
      .run(id, name, `/tmp/test-${id}`);
    return id;
  }

  function insertTicket(
    projectId: string,
    overrides: {
      status?: string;
      createdAt?: string;
      completedAt?: string | null;
      prStatus?: string | null;
      linkedCommits?: string | null;
    } = {}
  ): string {
    const id = randomUUID();
    testDb.sqlite
      .prepare(
        `INSERT INTO tickets (id, title, position, project_id, status, created_at, completed_at, pr_status, linked_commits)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        `Ticket ${id.slice(0, 6)}`,
        Math.random() * 100,
        projectId,
        overrides.status ?? "backlog",
        overrides.createdAt ?? new Date().toISOString(),
        overrides.completedAt ?? null,
        overrides.prStatus ?? null,
        overrides.linkedCommits ?? null
      );
    return id;
  }

  function insertComment(ticketId: string, author: string): void {
    testDb.sqlite
      .prepare("INSERT INTO ticket_comments (id, ticket_id, content, author) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), ticketId, `Comment by ${author}`, author);
  }

  function insertRalphSession(
    ticketId: string,
    overrides: {
      outcome?: string | null;
      startedAt?: string;
      completedAt?: string | null;
      stateHistory?: string | null;
    } = {}
  ): string {
    const id = randomUUID();
    testDb.sqlite
      .prepare(
        `INSERT INTO ralph_sessions (id, ticket_id, outcome, started_at, completed_at, state_history)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        ticketId,
        overrides.outcome ?? null,
        overrides.startedAt ?? "2026-03-01T10:00:00Z",
        overrides.completedAt ?? null,
        overrides.stateHistory ?? null
      );
    return id;
  }

  // ─── Tests ───────────────────────────────────────────────────────────────────

  it("returns zeroed analytics when the database is empty", () => {
    const result = loadDashboardAnalytics(testDb.db);

    expect(result.completionTrend).toHaveLength(30);
    expect(result.completionTrend.every((d) => d.count === 0)).toBe(true);

    expect(result.velocity).toEqual({
      thisWeek: 0,
      lastWeek: 0,
      thisMonth: 0,
      trend: "stable",
    });

    expect(result.aiUsage).toEqual({ claude: 0, ralph: 0, opencode: 0, user: 0 });
    expect(result.ralphMetrics.totalSessions).toBe(0);
    expect(result.ralphMetrics.successRate).toBe(0);
    expect(result.prMetrics.total).toBe(0);
    expect(result.cycleTime.avg).toBe(0);
    expect(result.cycleTime.distribution).toEqual([]);
    expect(result.topProjects).toEqual([]);
    expect(result.commitsPerDay).toHaveLength(30);
    expect(result.commitsPerDay.every((d) => d.count === 0)).toBe(true);
  });

  it("counts completed tickets in the completion trend", () => {
    const projectId = insertProject();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    insertTicket(projectId, { status: "done", completedAt: yesterday });
    insertTicket(projectId, { status: "done", completedAt: yesterday });
    insertTicket(projectId, { status: "backlog" }); // not completed

    const result = loadDashboardAnalytics(testDb.db);

    const totalCompleted = result.completionTrend.reduce((sum, d) => sum + d.count, 0);
    expect(totalCompleted).toBe(2);
  });

  it("computes velocity from recent completions", () => {
    const projectId = insertProject();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    // 3 this week, 1 last week
    insertTicket(projectId, { status: "done", completedAt: twoDaysAgo });
    insertTicket(projectId, { status: "done", completedAt: twoDaysAgo });
    insertTicket(projectId, { status: "done", completedAt: twoDaysAgo });
    insertTicket(projectId, { status: "done", completedAt: tenDaysAgo });

    const result = loadDashboardAnalytics(testDb.db);

    expect(result.velocity.thisWeek).toBe(3);
    expect(result.velocity.lastWeek).toBe(1);
    expect(result.velocity.thisMonth).toBe(4);
    expect(result.velocity.trend).toBe("up");
  });

  it("breaks down AI usage by comment author", () => {
    const projectId = insertProject();
    const ticketId = insertTicket(projectId);

    insertComment(ticketId, "claude");
    insertComment(ticketId, "claude");
    insertComment(ticketId, "ralph");
    insertComment(ticketId, "opencode");
    insertComment(ticketId, "alice"); // counted as user

    const result = loadDashboardAnalytics(testDb.db);

    expect(result.aiUsage.claude).toBe(2);
    expect(result.aiUsage.ralph).toBe(1);
    expect(result.aiUsage.opencode).toBe(1);
    expect(result.aiUsage.user).toBe(1);
  });

  it("computes Ralph session metrics", () => {
    const projectId = insertProject();
    const ticketId = insertTicket(projectId);

    // 2 completed sessions (1 success, 1 failure), 1 in-progress
    insertRalphSession(ticketId, {
      outcome: "success",
      startedAt: "2026-03-01T10:00:00Z",
      completedAt: "2026-03-01T11:00:00Z", // 60 min
    });
    insertRalphSession(ticketId, {
      outcome: "failure",
      startedAt: "2026-03-02T10:00:00Z",
      completedAt: "2026-03-02T10:30:00Z", // 30 min
    });
    insertRalphSession(ticketId); // in-progress, no outcome

    const result = loadDashboardAnalytics(testDb.db);

    expect(result.ralphMetrics.totalSessions).toBe(3);
    expect(result.ralphMetrics.successRate).toBe(50); // 1 of 2 completed
    expect(result.ralphMetrics.avgDuration).toBeCloseTo(45, 0); // avg(60, 30)
  });

  it("computes average time by state from state history", () => {
    const projectId = insertProject();
    const ticketId = insertTicket(projectId);

    const stateHistory = JSON.stringify([
      { state: "analyzing", timestamp: "2026-03-01T10:00:00Z" },
      { state: "implementing", timestamp: "2026-03-01T10:10:00Z" }, // 10 min analyzing
      { state: "testing", timestamp: "2026-03-01T10:40:00Z" }, // 30 min implementing
      { state: "done", timestamp: "2026-03-01T10:50:00Z" }, // 10 min testing
    ]);

    insertRalphSession(ticketId, {
      outcome: "success",
      completedAt: "2026-03-01T10:50:00Z",
      stateHistory,
    });

    const result = loadDashboardAnalytics(testDb.db);

    expect(result.ralphMetrics.avgTimeByState["analyzing"]).toBeCloseTo(10, 0);
    expect(result.ralphMetrics.avgTimeByState["implementing"]).toBeCloseTo(30, 0);
    expect(result.ralphMetrics.avgTimeByState["testing"]).toBeCloseTo(10, 0);
  });

  it("computes PR metrics from ticket PR statuses", () => {
    const projectId = insertProject();

    insertTicket(projectId, { prStatus: "merged" });
    insertTicket(projectId, { prStatus: "merged" });
    insertTicket(projectId, { prStatus: "open" });
    insertTicket(projectId, { prStatus: "draft" });
    insertTicket(projectId); // no PR

    const result = loadDashboardAnalytics(testDb.db);

    expect(result.prMetrics.total).toBe(4);
    expect(result.prMetrics.merged).toBe(2);
    expect(result.prMetrics.open).toBe(1);
    expect(result.prMetrics.draft).toBe(1);
    expect(result.prMetrics.mergeRate).toBe(50);
  });

  it("computes cycle time stats including median and p95", () => {
    const projectId = insertProject();

    // Create tickets with known cycle times
    // Ticket 1: 24h cycle time
    insertTicket(projectId, {
      status: "done",
      createdAt: "2026-03-10T00:00:00Z",
      completedAt: "2026-03-11T00:00:00Z",
    });
    // Ticket 2: 48h cycle time
    insertTicket(projectId, {
      status: "done",
      createdAt: "2026-03-10T00:00:00Z",
      completedAt: "2026-03-12T00:00:00Z",
    });
    // Ticket 3: 72h cycle time
    insertTicket(projectId, {
      status: "done",
      createdAt: "2026-03-10T00:00:00Z",
      completedAt: "2026-03-13T00:00:00Z",
    });

    const result = loadDashboardAnalytics(testDb.db);

    expect(result.cycleTime.avg).toBeCloseTo(48, 0); // (24+48+72)/3
    expect(result.cycleTime.median).toBeCloseTo(48, 0); // middle value
    expect(result.cycleTime.p95).toBeCloseTo(72, 0); // 95th percentile with 3 items
    expect(result.cycleTime.distribution.length).toBe(8); // 8 histogram buckets
  });

  it("ranks top projects by completed ticket count", () => {
    const alphaId = insertProject("Alpha");
    const betaId = insertProject("Beta");

    // Alpha: 3 done, Beta: 1 done
    insertTicket(alphaId, { status: "done", completedAt: new Date().toISOString() });
    insertTicket(alphaId, { status: "done", completedAt: new Date().toISOString() });
    insertTicket(alphaId, { status: "done", completedAt: new Date().toISOString() });
    insertTicket(betaId, { status: "done", completedAt: new Date().toISOString() });
    insertTicket(betaId, { status: "backlog" }); // not done

    const result = loadDashboardAnalytics(testDb.db);

    expect(result.topProjects).toHaveLength(2);
    expect(result.topProjects[0]?.name).toBe("Alpha");
    expect(result.topProjects[0]?.completed).toBe(3);
    expect(result.topProjects[1]?.name).toBe("Beta");
    expect(result.topProjects[1]?.completed).toBe(1);
  });

  it("counts commits per day from linked_commits JSON", () => {
    const projectId = insertProject();
    const today = new Date().toISOString().split("T")[0];
    const commits = JSON.stringify([
      { hash: "abc123", linkedAt: `${today}T10:00:00Z` },
      { hash: "def456", linkedAt: `${today}T11:00:00Z` },
    ]);

    insertTicket(projectId, { linkedCommits: commits });

    const result = loadDashboardAnalytics(testDb.db);

    const todayEntry = result.commitsPerDay.find((d) => d.date === today);
    expect(todayEntry?.count).toBe(2);
  });

  it("handles malformed linked_commits gracefully", () => {
    const projectId = insertProject();

    // Insert ticket with invalid JSON in linked_commits
    insertTicket(projectId, { linkedCommits: "not-json" });
    insertTicket(projectId, { linkedCommits: null });

    // Should not throw
    const result = loadDashboardAnalytics(testDb.db);
    expect(result.commitsPerDay).toHaveLength(30);
  });
});
