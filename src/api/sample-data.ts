import { createServerFn } from "@tanstack/react-start";
import { projects, epics, tickets } from "../lib/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const SAMPLE_PROJECT_NAME = "Sample Project";
const SAMPLE_PROJECT_PATH = "/tmp/sample-project";

// Check if database is empty (first launch)
export const checkFirstLaunch = createServerFn({ method: "GET" })
  .inputValidator(() => {})
  .handler(async () => {
    // Dynamic import to prevent bundling db in browser
    const { db } = await import("../lib/db");

    const projectCount = db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .get();

    const isEmpty = (projectCount?.count ?? 0) === 0;

    // Check if sample data exists
    const sampleProject = db
      .select()
      .from(projects)
      .where(eq(projects.name, SAMPLE_PROJECT_NAME))
      .get();

    return {
      isEmpty,
      hasSampleData: !!sampleProject,
      sampleProjectId: sampleProject?.id ?? null,
    };
  });

// Create sample data
export const createSampleData = createServerFn({ method: "POST" })
  .inputValidator(() => {})
  .handler(async () => {
    // Dynamic import to prevent bundling db in browser
    const { db } = await import("../lib/db");

    // Check if sample data already exists
    const existing = db.select().from(projects).where(eq(projects.name, SAMPLE_PROJECT_NAME)).get();

    if (existing) {
      return { success: false, message: "Sample data already exists" };
    }

    // Create sample project
    const projectId = randomUUID();
    db.insert(projects)
      .values({
        id: projectId,
        name: SAMPLE_PROJECT_NAME,
        path: SAMPLE_PROJECT_PATH,
        color: "#06b6d4", // cyan
      })
      .run();

    // Create sample epic
    const epicId = randomUUID();
    db.insert(epics)
      .values({
        id: epicId,
        title: "Getting Started",
        description:
          "Learn how to use Brain Dump to manage your tasks and integrate with Claude Code.",
        projectId,
        color: "#8b5cf6", // purple
      })
      .run();

    // Create sample tickets
    const sampleTickets = [
      {
        id: randomUUID(),
        title: "Welcome to Brain Dump!",
        description:
          "This is a sample ticket to help you get started. Brain Dump is your personal task management system with Claude Code integration.\n\nExplore the features:\n- Drag tickets between columns\n- Click on a ticket to view/edit details\n- Use the sidebar to filter by project or epic",
        status: "done" as const,
        priority: null,
        position: 1,
        projectId,
        epicId,
        tags: JSON.stringify(["sample", "welcome"]),
        subtasks: JSON.stringify([
          { id: randomUUID(), text: "Read the welcome message", completed: true },
          { id: randomUUID(), text: "Explore the UI", completed: true },
        ]),
        completedAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        title: "Create your first project",
        description:
          "Click the + button in the sidebar to create a new project. Projects are linked to directories on your filesystem, making it easy to integrate with Claude Code.",
        status: "in_progress" as const,
        priority: "high" as const,
        position: 1,
        projectId,
        epicId,
        tags: JSON.stringify(["sample", "tutorial"]),
        subtasks: JSON.stringify([
          { id: randomUUID(), text: "Click the + button in the sidebar", completed: false },
          { id: randomUUID(), text: "Enter a project name", completed: false },
          { id: randomUUID(), text: "Set the project directory path", completed: false },
        ]),
      },
      {
        id: randomUUID(),
        title: "Try drag and drop",
        description:
          "Drag this ticket to the 'In Progress' column to see how the Kanban board works. You can also drag tickets within a column to reorder them.",
        status: "ready" as const,
        priority: "medium" as const,
        position: 1,
        projectId,
        epicId,
        tags: JSON.stringify(["sample", "feature"]),
        subtasks: null,
      },
      {
        id: randomUUID(),
        title: "Use Start Work to integrate with Claude",
        description:
          "Open any ticket and click the green 'Start Work' button. This copies the ticket context to your clipboard, ready to paste into Claude Code.",
        status: "backlog" as const,
        priority: "low" as const,
        position: 1,
        projectId,
        epicId,
        tags: JSON.stringify(["sample", "claude"]),
        subtasks: JSON.stringify([
          { id: randomUUID(), text: "Open a ticket", completed: false },
          { id: randomUUID(), text: "Click Start Work", completed: false },
          { id: randomUUID(), text: "Open terminal and run claude command", completed: false },
          { id: randomUUID(), text: "Paste the context", completed: false },
        ]),
      },
    ];

    for (const ticket of sampleTickets) {
      db.insert(tickets).values(ticket).run();
    }

    return {
      success: true,
      projectId,
      epicId,
      ticketCount: sampleTickets.length,
    };
  });

// Delete sample data
export const deleteSampleData = createServerFn({ method: "POST" })
  .inputValidator(() => {})
  .handler(async () => {
    // Dynamic import to prevent bundling db in browser
    const { db } = await import("../lib/db");

    const sampleProject = db
      .select()
      .from(projects)
      .where(eq(projects.name, SAMPLE_PROJECT_NAME))
      .get();

    if (!sampleProject) {
      return { success: false, message: "No sample data found" };
    }

    // Delete project (cascades to epics and tickets)
    db.delete(projects).where(eq(projects.id, sampleProject.id)).run();

    return { success: true };
  });
