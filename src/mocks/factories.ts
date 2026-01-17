/**
 * Mock data factories for testing
 *
 * These factories create type-safe mock data matching the Drizzle schema.
 * Use `createMock*` functions to generate test data with sensible defaults
 * that can be overridden as needed.
 */

import type { Project, Epic, Ticket, TicketComment, Settings } from "../lib/schema";

// Counter for generating sequential positions
let positionCounter = 0;

/**
 * Reset the position counter (call in beforeEach if needed)
 */
export function resetMockCounters(): void {
  positionCounter = 0;
}

/**
 * Create a mock project
 */
export function createMockProject(overrides: Partial<Project> = {}): Project {
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    name: overrides.name ?? "Test Project",
    path: overrides.path ?? `/test/projects/${id}`,
    color: overrides.color ?? null,
    workingMethod: overrides.workingMethod ?? "auto",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Create a mock epic
 */
export function createMockEpic(overrides: Partial<Epic> = {}): Epic {
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    title: overrides.title ?? "Test Epic",
    description: overrides.description ?? null,
    projectId: overrides.projectId ?? crypto.randomUUID(),
    color: overrides.color ?? null,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Create a mock ticket
 */
export function createMockTicket(overrides: Partial<Ticket> = {}): Ticket {
  const id = overrides.id ?? crypto.randomUUID();
  positionCounter += 1;
  return {
    id,
    title: overrides.title ?? "Test Ticket",
    description: overrides.description ?? null,
    status: overrides.status ?? "backlog",
    priority: overrides.priority ?? "medium",
    position: overrides.position ?? positionCounter * 10,
    projectId: overrides.projectId ?? crypto.randomUUID(),
    epicId: overrides.epicId ?? null,
    tags: overrides.tags ?? null,
    subtasks: overrides.subtasks ?? null,
    isBlocked: overrides.isBlocked ?? false,
    blockedReason: overrides.blockedReason ?? null,
    linkedFiles: overrides.linkedFiles ?? null,
    attachments: overrides.attachments ?? null,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    completedAt: overrides.completedAt ?? null,
    // Git/PR tracking fields
    branchName: overrides.branchName ?? null,
    prNumber: overrides.prNumber ?? null,
    prUrl: overrides.prUrl ?? null,
    prStatus: overrides.prStatus ?? null,
  };
}

/**
 * Create a mock ticket comment
 */
export function createMockComment(overrides: Partial<TicketComment> = {}): TicketComment {
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    ticketId: overrides.ticketId ?? crypto.randomUUID(),
    content: overrides.content ?? "Test comment",
    author: overrides.author ?? "claude",
    type: overrides.type ?? "comment",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Create mock settings
 */
export function createMockSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    id: overrides.id ?? "default",
    terminalEmulator: overrides.terminalEmulator ?? null,
    ralphSandbox: overrides.ralphSandbox ?? false,
    ralphTimeout: overrides.ralphTimeout ?? 3600,
    autoCreatePr: overrides.autoCreatePr ?? true,
    prTargetBranch: overrides.prTargetBranch ?? "dev",
    defaultProjectsDirectory: overrides.defaultProjectsDirectory ?? null,
    defaultWorkingMethod: overrides.defaultWorkingMethod ?? "auto",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Create a project with associated epics and tickets
 * Useful for integration tests that need a complete data structure
 */
export function createMockProjectWithData(
  options: {
    projectOverrides?: Partial<Project>;
    epicCount?: number;
    ticketsPerEpic?: number;
    commentsPerTicket?: number;
  } = {}
): {
  project: Project;
  epics: Epic[];
  tickets: Ticket[];
  comments: TicketComment[];
} {
  const {
    projectOverrides = {},
    epicCount = 2,
    ticketsPerEpic = 3,
    commentsPerTicket = 1,
  } = options;

  const project = createMockProject(projectOverrides);
  const epics: Epic[] = [];
  const tickets: Ticket[] = [];
  const comments: TicketComment[] = [];

  for (let i = 0; i < epicCount; i++) {
    const epic = createMockEpic({
      projectId: project.id,
      title: `Epic ${i + 1}`,
    });
    epics.push(epic);

    for (let j = 0; j < ticketsPerEpic; j++) {
      const ticket = createMockTicket({
        projectId: project.id,
        epicId: epic.id,
        title: `Ticket ${i + 1}.${j + 1}`,
      });
      tickets.push(ticket);

      for (let k = 0; k < commentsPerTicket; k++) {
        const comment = createMockComment({
          ticketId: ticket.id,
          content: `Comment ${k + 1} on Ticket ${i + 1}.${j + 1}`,
        });
        comments.push(comment);
      }
    }
  }

  return { project, epics, tickets, comments };
}
