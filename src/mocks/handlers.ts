/**
 * MSW Request Handlers
 *
 * These handlers mock API endpoints for integration testing.
 *
 * NOTE: TanStack Start uses server functions (RPC-style) rather than REST endpoints.
 * These handlers are set up to intercept the serialized function calls that
 * TanStack Start makes under the hood, as well as any future HTTP endpoints.
 *
 * For most component tests, you may want to mock the server functions directly
 * using vi.mock() instead of MSW, since server functions are called directly
 * rather than via HTTP in many cases.
 */

import { http, HttpResponse } from "msw";
import {
  createMockProject,
  createMockProjectWithData,
} from "./factories";
import type { Project, Epic, Ticket, TicketComment } from "../lib/schema";

// In-memory data store for tests
// This simulates the database state
export interface MockDataStore {
  projects: Project[];
  epics: Epic[];
  tickets: Ticket[];
  comments: TicketComment[];
}

// Create initial mock data store
export function createMockDataStore(): MockDataStore {
  const { project, epics, tickets, comments } = createMockProjectWithData({
    projectOverrides: { name: "Test Project" },
    epicCount: 2,
    ticketsPerEpic: 3,
    commentsPerTicket: 2,
  });

  return {
    projects: [project],
    epics,
    tickets,
    comments,
  };
}

// Default data store instance
let mockDataStore = createMockDataStore();

/**
 * Reset the mock data store to initial state
 * Call this in beforeEach to ensure test isolation
 */
export function resetMockDataStore(): void {
  mockDataStore = createMockDataStore();
}

/**
 * Get the current mock data store
 * Useful for assertions in tests
 */
export function getMockDataStore(): MockDataStore {
  return mockDataStore;
}

/**
 * Set custom mock data for a test
 */
export function setMockDataStore(data: Partial<MockDataStore>): void {
  mockDataStore = {
    ...mockDataStore,
    ...data,
  };
}

/**
 * Default handlers for Brain Dump API
 *
 * These handlers respond to the patterns TanStack Start uses for server functions.
 * The actual URL patterns depend on how TanStack Start serializes the function calls.
 */
export const handlers = [
  // =====================
  // Projects
  // =====================

  // List all projects
  http.get("*/api/projects", () => {
    return HttpResponse.json(mockDataStore.projects);
  }),

  // Get single project
  http.get("*/api/projects/:id", ({ params }) => {
    const project = mockDataStore.projects.find((p) => p.id === params.id);
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return HttpResponse.json(project);
  }),

  // Create project
  http.post("*/api/projects", async ({ request }) => {
    const body = (await request.json()) as { name: string; path: string; color?: string };
    const newProject = createMockProject({
      name: body.name,
      path: body.path,
      color: body.color ?? null,
    });
    mockDataStore.projects.push(newProject);
    return HttpResponse.json(newProject, { status: 201 });
  }),

  // Delete project (with dry-run support)
  http.delete("*/api/projects/:id", ({ params, request }) => {
    const url = new URL(request.url);
    const confirm = url.searchParams.get("confirm") === "true";
    const projectId = params.id as string;

    const project = mockDataStore.projects.find((p) => p.id === projectId);
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const projectEpics = mockDataStore.epics.filter((e) => e.projectId === projectId);
    const projectTickets = mockDataStore.tickets.filter((t) => t.projectId === projectId);
    const ticketIds = projectTickets.map((t) => t.id);
    const projectComments = mockDataStore.comments.filter((c) =>
      ticketIds.includes(c.ticketId)
    );

    if (!confirm) {
      // Dry-run: return preview
      return HttpResponse.json({
        preview: true,
        project: { id: project.id, name: project.name },
        epicCount: projectEpics.length,
        ticketCount: projectTickets.length,
        commentCount: projectComments.length,
        tickets: projectTickets.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          epicId: t.epicId,
        })),
      });
    }

    // Actually delete
    mockDataStore.projects = mockDataStore.projects.filter((p) => p.id !== projectId);
    mockDataStore.epics = mockDataStore.epics.filter((e) => e.projectId !== projectId);
    mockDataStore.tickets = mockDataStore.tickets.filter((t) => t.projectId !== projectId);
    mockDataStore.comments = mockDataStore.comments.filter(
      (c) => !ticketIds.includes(c.ticketId)
    );

    return HttpResponse.json({
      deleted: true,
      project: { id: project.id, name: project.name },
      epicCount: projectEpics.length,
      ticketCount: projectTickets.length,
      commentCount: projectComments.length,
    });
  }),

  // =====================
  // Epics
  // =====================

  // List epics for a project
  http.get("*/api/projects/:projectId/epics", ({ params }) => {
    const projectEpics = mockDataStore.epics.filter(
      (e) => e.projectId === params.projectId
    );
    return HttpResponse.json(projectEpics);
  }),

  // Delete epic (with dry-run support)
  http.delete("*/api/epics/:id", ({ params, request }) => {
    const url = new URL(request.url);
    const confirm = url.searchParams.get("confirm") === "true";
    const epicId = params.id as string;

    const epic = mockDataStore.epics.find((e) => e.id === epicId);
    if (!epic) {
      return HttpResponse.json({ error: "Epic not found" }, { status: 404 });
    }

    const epicTickets = mockDataStore.tickets.filter((t) => t.epicId === epicId);

    if (!confirm) {
      // Dry-run: return preview
      return HttpResponse.json({
        preview: true,
        epic: { id: epic.id, title: epic.title },
        ticketCount: epicTickets.length,
        tickets: epicTickets.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
        })),
      });
    }

    // Actually delete (unlinks tickets, doesn't delete them)
    mockDataStore.epics = mockDataStore.epics.filter((e) => e.id !== epicId);
    mockDataStore.tickets = mockDataStore.tickets.map((t) =>
      t.epicId === epicId ? { ...t, epicId: null } : t
    );

    return HttpResponse.json({
      deleted: true,
      epic: { id: epic.id, title: epic.title },
      ticketCount: epicTickets.length,
    });
  }),

  // =====================
  // Tickets
  // =====================

  // List tickets (with filters)
  http.get("*/api/tickets", ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const epicId = url.searchParams.get("epicId");
    const status = url.searchParams.get("status");

    let filteredTickets = [...mockDataStore.tickets];

    if (projectId) {
      filteredTickets = filteredTickets.filter((t) => t.projectId === projectId);
    }
    if (epicId) {
      filteredTickets = filteredTickets.filter((t) => t.epicId === epicId);
    }
    if (status) {
      filteredTickets = filteredTickets.filter((t) => t.status === status);
    }

    return HttpResponse.json(filteredTickets);
  }),

  // Get single ticket
  http.get("*/api/tickets/:id", ({ params }) => {
    const ticket = mockDataStore.tickets.find((t) => t.id === params.id);
    if (!ticket) {
      return HttpResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    return HttpResponse.json(ticket);
  }),

  // Delete ticket (with dry-run support)
  http.delete("*/api/tickets/:id", ({ params, request }) => {
    const url = new URL(request.url);
    const confirm = url.searchParams.get("confirm") === "true";
    const ticketId = params.id as string;

    const ticket = mockDataStore.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      return HttpResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const ticketComments = mockDataStore.comments.filter((c) => c.ticketId === ticketId);

    if (!confirm) {
      // Dry-run: return preview
      return HttpResponse.json({
        preview: true,
        ticket: {
          id: ticket.id,
          title: ticket.title,
          status: ticket.status,
          projectId: ticket.projectId,
          epicId: ticket.epicId,
          description: ticket.description,
        },
        commentCount: ticketComments.length,
      });
    }

    // Actually delete
    mockDataStore.tickets = mockDataStore.tickets.filter((t) => t.id !== ticketId);
    mockDataStore.comments = mockDataStore.comments.filter((c) => c.ticketId !== ticketId);

    return HttpResponse.json({
      deleted: true,
      ticket: { id: ticket.id, title: ticket.title },
      commentCount: ticketComments.length,
    });
  }),

  // =====================
  // Comments
  // =====================

  // List comments for a ticket
  http.get("*/api/tickets/:ticketId/comments", ({ params }) => {
    const ticketComments = mockDataStore.comments.filter(
      (c) => c.ticketId === params.ticketId
    );
    return HttpResponse.json(ticketComments);
  }),
];

// Export individual handler groups for selective use in tests
export const projectHandlers = handlers.slice(0, 4);
export const epicHandlers = handlers.slice(4, 6);
export const ticketHandlers = handlers.slice(6, 10);
export const commentHandlers = handlers.slice(10);
