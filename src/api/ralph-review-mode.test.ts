import { describe, expect, it } from "vitest";
import type { EnhancedPRDDocument } from "../lib/prd-extraction";
import { generateVSCodeContext, getRalphPrompt, prepareEpicLaunch } from "./ralph";

type LaunchTicket = Parameters<typeof prepareEpicLaunch>[0][number];

function createLaunchTicket(id: string, title: string): LaunchTicket {
  return {
    id,
    title,
  } as LaunchTicket;
}

function createReviewPrd(): EnhancedPRDDocument {
  return {
    projectName: "Brain Dump",
    projectPath: "/tmp/brain-dump",
    epicTitle: "Epic-scoped focused review runs",
    testingRequirements: [
      "Tests must validate user-facing behavior, not implementation details",
      "Focus on what users actually do - integration tests over unit tests",
    ],
    userStories: [
      {
        id: "ticket-review",
        title: "Review launch contract",
        passes: false,
        overview: "",
        types: [],
        designDecisions: [],
        implementationGuide: [],
        acceptanceCriteria: [
          "Review mode is separate from implementation launch mode",
          "Steering text is preserved verbatim",
        ],
        references: [],
        description: "Introduce a focused review path for epic ticket review launches.",
        priority: "high",
        tags: ["review"],
      },
      {
        id: "ticket-other",
        title: "Unrelated ticket",
        passes: false,
        overview: "",
        types: [],
        designDecisions: [],
        implementationGuide: [],
        acceptanceCriteria: [],
        references: [],
        description: "Should not appear in focused review context.",
        priority: "medium",
        tags: ["review"],
      },
    ],
    projectContext: {
      techStack: [],
      dosDonts: [],
      verificationSteps: [],
    },
    generatedAt: "2026-03-09T00:00:00.000Z",
  };
}

describe("prepareEpicLaunch", () => {
  it("keeps the default implementation path when no review launch profile is provided", () => {
    const epicTickets = [
      createLaunchTicket("ticket-1", "First ticket"),
      createLaunchTicket("ticket-2", "Second ticket"),
    ];

    const result = prepareEpicLaunch(epicTickets);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.preparation.promptProfile.type).toBe("implementation");
    expect(result.preparation.prdTickets.map((ticket) => ticket.id)).toEqual([
      "ticket-1",
      "ticket-2",
    ]);
    expect(result.preparation.startsImplementationWorkflow).toBe(true);
  });

  it("builds a focused review launch for exactly one selected ticket", () => {
    const epicTickets = [
      createLaunchTicket("ticket-review", "Review launch contract"),
      createLaunchTicket("ticket-other", "Unrelated ticket"),
    ];

    const result = prepareEpicLaunch(epicTickets, {
      type: "review",
      selectedTicketIds: ["ticket-review"],
      steeringPrompt: "Focus on workflow guardrails",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.preparation.startsImplementationWorkflow).toBe(false);
    expect(result.preparation.prdTickets.map((ticket) => ticket.id)).toEqual(["ticket-review"]);
    expect(result.preparation.promptProfile).toMatchObject({
      type: "review",
      selectedTicket: {
        id: "ticket-review",
        title: "Review launch contract",
      },
      steeringPrompt: "Focus on workflow guardrails",
    });
  });

  it("rejects review mode when more than one ticket is selected", () => {
    const epicTickets = [
      createLaunchTicket("ticket-review", "Review launch contract"),
      createLaunchTicket("ticket-other", "Unrelated ticket"),
    ];

    const result = prepareEpicLaunch(epicTickets, {
      type: "review",
      selectedTicketIds: ["ticket-review", "ticket-other"],
    });

    expect(result).toEqual({
      success: false,
      message: "Focused review launch currently requires exactly one selected ticket.",
    });
  });
});

describe("review-mode prompt builders", () => {
  it("builds a review prompt that stays scoped to the selected ticket and preserves steering text", () => {
    const prompt = getRalphPrompt({
      type: "review",
      selectedTicket: {
        id: "ticket-review",
        title: "Review launch contract",
      },
      steeringPrompt: "Focus on auth edge cases and silent failures.",
    });

    expect(prompt).toContain("Focused Review Agent");
    expect(prompt).toContain("Review only the selected ticket below.");
    expect(prompt).toContain("Review launch contract");
    expect(prompt).toContain("ticket-review");
    expect(prompt).toContain("Focus on auth edge cases and silent failures.");
    expect(prompt).toContain('review({ action: "submit-finding", ticketId: "ticket-review"');
    expect(prompt).toContain('review({ action: "check-complete", ticketId: "ticket-review" })');
    expect(prompt).not.toContain('workflow({ action: "complete-work"');
  });

  it("builds a focused review context that excludes unrelated tickets", () => {
    const context = generateVSCodeContext(createReviewPrd(), {
      type: "review",
      selectedTicket: {
        id: "ticket-review",
        title: "Review launch contract",
      },
      steeringPrompt: "Preserve review workflow guarantees.",
    });

    expect(context).toContain("Launch Mode:** Focused review");
    expect(context).toContain("Review launch contract");
    expect(context).toContain("ticket-review");
    expect(context).toContain("Preserve review workflow guarantees.");
    expect(context).toContain("Do not pick unrelated tickets or generic implementation work.");
    expect(context).not.toContain("Unrelated ticket");
  });
});
