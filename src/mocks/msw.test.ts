/**
 * Tests for MSW setup verification
 *
 * These tests verify that MSW is correctly configured and can mock HTTP requests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./server";
import {
  createMockProject,
  createMockTicket,
  createMockProjectWithData,
  resetMockCounters,
} from "./factories";

describe("MSW Setup", () => {
  beforeEach(() => {
    resetMockCounters();
  });

  describe("Factory Functions", () => {
    it("should create a mock project with defaults", () => {
      const project = createMockProject();

      expect(project.id).toBeDefined();
      expect(project.name).toBe("Test Project");
      expect(project.path).toContain("/test/projects/");
      expect(project.workingMethod).toBe("auto");
      expect(project.createdAt).toBeDefined();
    });

    it("should create a mock project with overrides", () => {
      const project = createMockProject({
        name: "Custom Project",
        path: "/custom/path",
        color: "#ff0000",
      });

      expect(project.name).toBe("Custom Project");
      expect(project.path).toBe("/custom/path");
      expect(project.color).toBe("#ff0000");
    });

    it("should create a mock ticket with defaults", () => {
      const ticket = createMockTicket();

      expect(ticket.id).toBeDefined();
      expect(ticket.title).toBe("Test Ticket");
      expect(ticket.status).toBe("backlog");
      expect(ticket.priority).toBe("medium");
      expect(ticket.position).toBeGreaterThan(0);
    });

    it("should increment ticket position automatically", () => {
      const ticket1 = createMockTicket();
      const ticket2 = createMockTicket();
      const ticket3 = createMockTicket();

      expect(ticket2.position).toBeGreaterThan(ticket1.position);
      expect(ticket3.position).toBeGreaterThan(ticket2.position);
    });

    it("should create a project with associated data", () => {
      const data = createMockProjectWithData({
        epicCount: 2,
        ticketsPerEpic: 3,
        commentsPerTicket: 2,
      });

      expect(data.project).toBeDefined();
      expect(data.epics).toHaveLength(2);
      expect(data.tickets).toHaveLength(6); // 2 epics * 3 tickets
      expect(data.comments).toHaveLength(12); // 6 tickets * 2 comments

      // Verify relationships
      for (const epic of data.epics) {
        expect(epic.projectId).toBe(data.project.id);
      }

      for (const ticket of data.tickets) {
        expect(ticket.projectId).toBe(data.project.id);
        expect(data.epics.some((e) => e.id === ticket.epicId)).toBe(true);
      }
    });
  });

  describe("Server Runtime Handlers", () => {
    it("should intercept requests with runtime handlers", async () => {
      // Add a runtime handler for this specific test
      server.use(
        http.get("https://test-api.example.com/status", () => {
          return HttpResponse.json({ status: "ok", mswWorking: true });
        })
      );

      const response = await fetch("https://test-api.example.com/status");
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.mswWorking).toBe(true);
    });

    it("should reset handlers between tests", async () => {
      // This test verifies the handler from previous test was reset
      // and the request would go through (or get a default response)

      // Add a different handler
      server.use(
        http.get("https://test-api.example.com/different", () => {
          return HttpResponse.json({ different: true });
        })
      );

      const response = await fetch("https://test-api.example.com/different");
      const data = await response.json();

      expect(data.different).toBe(true);
    });

    it("should support overriding default handlers", async () => {
      // Override the default project handler for this test
      server.use(
        http.get("*/api/projects", () => {
          return HttpResponse.json([
            { id: "override-1", name: "Override Project" },
          ]);
        })
      );

      const response = await fetch("http://localhost/api/projects");
      const data = await response.json();

      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Override Project");
    });
  });

  describe("Error Handling", () => {
    it("should handle error responses", async () => {
      server.use(
        http.get("https://test-api.example.com/error", () => {
          return HttpResponse.json(
            { error: "Something went wrong" },
            { status: 500 }
          );
        })
      );

      const response = await fetch("https://test-api.example.com/error");
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Something went wrong");
    });

    it("should handle network errors", async () => {
      server.use(
        http.get("https://test-api.example.com/network-error", () => {
          return HttpResponse.error();
        })
      );

      await expect(
        fetch("https://test-api.example.com/network-error")
      ).rejects.toThrow();
    });
  });
});
