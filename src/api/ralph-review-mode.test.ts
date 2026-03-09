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

  it("builds focused review launches for each selected ticket", () => {
    const epicTickets = [
      createLaunchTicket("ticket-review", "Review launch contract"),
      createLaunchTicket("ticket-other", "Unrelated ticket"),
    ];

    const result = prepareEpicLaunch(
      epicTickets,
      {
        type: "review",
        selectedTicketIds: ["ticket-review", "ticket-other"],
        steeringPrompt: "Focus on workflow guardrails",
      },
      "run-1234"
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.preparation.startsImplementationWorkflow).toBe(false);
    expect(result.preparation.prdTickets.map((ticket) => ticket.id)).toEqual([
      "ticket-review",
      "ticket-other",
    ]);
    expect(result.preparation.reviewLaunches).toHaveLength(2);
    expect(result.preparation.reviewLaunches[0]).toMatchObject({
      ticket: {
        id: "ticket-review",
      },
      prdRelativePath: "plans/review-runs/run-1234/ticket-review.json",
      contextRelativePath: ".claude/review-runs/run-1234/ticket-review.md",
      promptProfile: {
        type: "review",
        selectedTicket: {
          id: "ticket-review",
          title: "Review launch contract",
        },
        steeringPrompt: "Focus on workflow guardrails",
        prdRelativePath: "plans/review-runs/run-1234/ticket-review.json",
      },
    });
    expect(result.preparation.reviewLaunches[1]).toMatchObject({
      ticket: {
        id: "ticket-other",
      },
      prdRelativePath: "plans/review-runs/run-1234/ticket-other.json",
      contextRelativePath: ".claude/review-runs/run-1234/ticket-other.md",
    });
  });

  it("rejects review mode when duplicate ticket ids are selected", () => {
    const epicTickets = [
      createLaunchTicket("ticket-review", "Review launch contract"),
      createLaunchTicket("ticket-other", "Unrelated ticket"),
    ];

    const result = prepareEpicLaunch(epicTickets, {
      type: "review",
      selectedTicketIds: ["ticket-review", "ticket-review"],
    });

    expect(result).toEqual({
      success: false,
      message: "Focused review launch received duplicate ticket selection: ticket-review",
    });
  });

  it("rejects review mode when a selected ticket is outside the current epic scope", () => {
    const epicTickets = [createLaunchTicket("ticket-review", "Review launch contract")];

    const result = prepareEpicLaunch(epicTickets, {
      type: "review",
      selectedTicketIds: ["ticket-missing"],
      steeringPrompt: "Focus on regressions only",
    });

    expect(result).toEqual({
      success: false,
      message: "Selected review ticket does not belong to this epic: ticket-missing",
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
    expect(prompt).toContain('session({ action: "create", ticketId: "ticket-review" })');
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

  it("keeps review-only workflow gates in the focused review context", () => {
    const context = generateVSCodeContext(createReviewPrd(), {
      type: "review",
      selectedTicket: {
        id: "ticket-review",
        title: "Review launch contract",
      },
      steeringPrompt: "Stay focused on the selected ticket.",
    });

    expect(context).toContain('review({ action: "check-complete", ticketId: "ticket-review" })');
    expect(context).toContain("Generate a demo with at least 3 manual steps, then STOP.");
    expect(context).toContain("- Review mode is separate from implementation launch mode");
    expect(context).toContain("- Steering text is preserved verbatim");
    expect(context).not.toContain('workflow({ action: "complete-work"');
  });
});
