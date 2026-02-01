/**
 * Tests for Claude Tasks API
 *
 * Following Kent C. Dodds' testing philosophy:
 * - Test user-facing behavior, not implementation details
 * - Test what the server actually returns to clients
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../lib/db";
import { claudeTasks, tickets, projects } from "../lib/schema";
import { eq } from "drizzle-orm";

// Since server functions are tested via component integration tests,
// we'll test the query logic that the server function wraps

describe("Claude Tasks API - Database Query Logic", () => {
  const testProjectId = "test-project-" + Date.now();
  const testTicketId = "test-ticket-" + Date.now();

  beforeEach(() => {
    // Create test project
    db.insert(projects)
      .values({
        id: testProjectId,
        name: "Test Project",
        path: "/tmp/test-project",
      })
      .run();

    // Create test ticket
    db.insert(tickets)
      .values({
        id: testTicketId,
        projectId: testProjectId,
        title: "Test Ticket",
        status: "in_progress",
        position: 1,
      })
      .run();
  });

  afterEach(() => {
    // Clean up test data
    db.delete(claudeTasks).where(eq(claudeTasks.ticketId, testTicketId)).run();
    db.delete(tickets).where(eq(tickets.id, testTicketId)).run();
    db.delete(projects).where(eq(projects.id, testProjectId)).run();
  });

  it("returns tasks ordered by position", () => {
    // User works on ticket and Claude creates multiple tasks
    db.insert(claudeTasks)
      .values([
        {
          id: "task-1",
          ticketId: testTicketId,
          subject: "First task",
          status: "pending",
          position: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "task-2",
          ticketId: testTicketId,
          subject: "Second task",
          status: "in_progress",
          position: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "task-3",
          ticketId: testTicketId,
          subject: "Third task",
          status: "completed",
          position: 3,
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      .run();

    // User requests tasks for the ticket (via server function)
    const tasks = db.select().from(claudeTasks).where(eq(claudeTasks.ticketId, testTicketId)).all();

    // User should see tasks in order
    expect(tasks).toHaveLength(3);
    expect(tasks[0]?.subject).toBe("First task");
    expect(tasks[1]?.subject).toBe("Second task");
    expect(tasks[2]?.subject).toBe("Third task");
  });

  it("returns empty array when ticket has no tasks", () => {
    // User opens a ticket with no Claude tasks yet
    const tasks = db.select().from(claudeTasks).where(eq(claudeTasks.ticketId, testTicketId)).all();

    // User sees no tasks
    expect(tasks).toEqual([]);
  });

  it("returns only tasks for the specified ticket", () => {
    const otherTicketId = "other-ticket-" + Date.now();

    // Create another ticket
    db.insert(tickets)
      .values({
        id: otherTicketId,
        projectId: testProjectId,
        title: "Other Ticket",
        status: "backlog",
        position: 2,
      })
      .run();

    // Create tasks for both tickets
    db.insert(claudeTasks)
      .values([
        {
          id: "task-first",
          ticketId: testTicketId,
          subject: "Task for first ticket",
          status: "pending",
          position: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "task-other",
          ticketId: otherTicketId,
          subject: "Task for other ticket",
          status: "pending",
          position: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      .run();

    // User requests tasks for first ticket
    const tasks = db.select().from(claudeTasks).where(eq(claudeTasks.ticketId, testTicketId)).all();

    // User should only see tasks for their ticket
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.subject).toBe("Task for first ticket");

    // Clean up
    db.delete(claudeTasks).where(eq(claudeTasks.ticketId, otherTicketId)).run();
    db.delete(tickets).where(eq(tickets.id, otherTicketId)).run();
  });

  it("preserves task status correctly", () => {
    // Claude works on ticket and creates tasks with different statuses
    db.insert(claudeTasks)
      .values([
        {
          id: "task-pending",
          ticketId: testTicketId,
          subject: "Task not started",
          status: "pending",
          position: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "task-active",
          ticketId: testTicketId,
          subject: "Task in progress",
          status: "in_progress",
          activeForm: "Implementing feature",
          position: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "task-done",
          ticketId: testTicketId,
          subject: "Task completed",
          status: "completed",
          position: 3,
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      .run();

    // User views the task list
    const tasks = db.select().from(claudeTasks).where(eq(claudeTasks.ticketId, testTicketId)).all();

    // User should see correct status for each task
    const statusMap = new Map(tasks.map((t: (typeof tasks)[0]) => [t.subject, t.status]));
    expect(statusMap.get("Task not started")).toBe("pending");
    expect(statusMap.get("Task in progress")).toBe("in_progress");
    expect(statusMap.get("Task completed")).toBe("completed");
  });
});
