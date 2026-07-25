import { describe, expect, it } from "vitest";
import type { EnhancedPRDDocument } from "../lib/prd-extraction";
import {
  generateEnhancedPRD,
  generateVSCodeContext,
  getFreshEyesReviewerPrompt,
  getRalphPrompt,
} from "./ralph-prompts";
import { prepareEpicLaunch } from "../lib/ralph-launch/launch-epic";

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
  it("keeps ai_review and ai_verification tickets incomplete until done", () => {
    const prd = generateEnhancedPRD("Brain Dump", "/tmp/brain-dump", [
      {
        id: "ticket-ai-review",
        title: "Needs review",
        status: "ai_review",
        description: "",
        priority: "high",
        tags: "[]",
      },
      {
        id: "ticket-ai-verification",
        title: "Ready for verification",
        status: "ai_verification",
        description: "",
        priority: "high",
        tags: "[]",
      },
    ] as Parameters<typeof generateEnhancedPRD>[2]);

    expect(prd.userStories.find((story) => story.id === "ticket-ai-review")?.passes).toBe(false);
    expect(prd.userStories.find((story) => story.id === "ticket-ai-verification")?.passes).toBe(
      false
    );
  });

  it("builds implementation gates around project-native verification commands", () => {
    const prompt = getRalphPrompt();

    expect(prompt.toLowerCase()).toContain("discover and run this project's validation commands");
    expect(prompt).toContain("Use the project's own commands, not Brain Dump's commands");
    expect(prompt).toContain(
      "If no automated validation command is discoverable, perform a targeted manual smoke check"
    );
    expect(prompt).not.toMatch(/pnpm type-check.*pnpm lint.*pnpm test/);
  });

  it("keeps the fresh-eyes implementer focused on implementation and verification repairs", () => {
    const prompt = getRalphPrompt({
      type: "implementation",
      freshEyes: { implementerLabel: "Claude", reviewerLabel: "Codex" },
    });

    expect(prompt).toContain("## Implementation Discipline");
    expect(prompt).toContain(
      "map each acceptance criterion to the existing production entry point"
    );
    expect(prompt).toContain("New shared logic must be wired through the real production caller");
    expect(prompt).toContain("output `REVIEW_PENDING` and STOP without editing");
    expect(prompt).toContain("When verification findings exist, fix exactly those failures");
    expect(prompt).toContain("Only after the commit and validation pass");
    expect(prompt).toContain("mark any resolved verification findings fixed");
    expect(prompt).toContain("PRD entry uses `blocked: true`");
    expect(prompt).toContain("live ticket output uses `isBlocked: true`");
    expect(prompt).toContain("FIRST unblocked scoped ticket");
    expect(prompt).not.toContain("brain-dump review submit-finding");
    expect(prompt).not.toContain("brain-dump review check-complete");
    expect(prompt).not.toContain("brain-dump review generate-demo");
    expect(prompt).not.toContain("Work Mode B");
    expect(prompt).not.toContain("mandatory 4-phase workflow");
  });

  it("makes the fresh reviewer own one complete review, repair, and handoff", () => {
    const prompt = getFreshEyesReviewerPrompt({
      implementerLabel: "Claude",
      reviewerLabel: "Codex",
    });

    expect(prompt).toContain("# Ralph: Fresh Eyes Reviewer");
    expect(prompt).toContain("review the FIRST unblocked `ai_review` candidate in PRD order");
    expect(prompt).toContain("PRD entry reports `blocked: true`");
    expect(prompt).toContain("live ticket reports `isBlocked: true`");
    expect(prompt).toContain("perform exactly ONE bounded fresh-eyes pass");
    expect(prompt).toContain("currently OPEN critical/major findings");
    expect(prompt).toContain("Fixed historical findings are deduplication context");
    expect(prompt).toContain("review only the repair diff");
    expect(prompt).toContain("submit the complete finding batch with");
    expect(prompt).toContain("Fix every open critical/major finding yourself");
    expect(prompt).toContain("`implementing`, `testing`, and `committing`");
    expect(prompt).toContain("If and only if you changed code for a blocking finding");
    expect(prompt).toContain(
      "add a `test_report` comment containing the exact commands and results"
    );
    expect(prompt).toContain("do not create an empty commit");
    expect(prompt).toContain("commit the review fixes, then mark each resolved finding fixed");
    expect(prompt).toContain("Do NOT begin a second broad review");
    expect(prompt).toContain("finish that same targeted repair before proceeding");
    expect(prompt).toContain("generate-demo");
    expect(prompt).not.toContain("allows at most 3 blocking review waves");
    expect(prompt).not.toContain("The implementer owns repairs");
    expect(prompt).not.toContain("Never write or edit implementation files");
  });

  it("tells implementation Ralph to resume scoped tickets already in AI review", () => {
    const prompt = getRalphPrompt();

    expect(prompt).toContain("If any candidate is already `ai_review`, pick ONE of those first");
    expect(prompt).toContain("resume at the AI Review phase");
    expect(prompt).toContain("A ticket in `ai_review` or `ai_verification` is NOT complete");
    expect(prompt).toContain(
      "Tickets in `ai_verification` are incomplete but waiting on the verification runner"
    );
  });

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
    expect(prompt).toContain("brain-dump review submit-finding --ticket ticket-review");
    expect(prompt).toContain("brain-dump review check-complete --ticket ticket-review --pretty");
    expect(prompt).toContain("brain-dump session create --ticket ticket-review --pretty");
    expect(prompt).not.toContain("workflow complete-work");
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

  it("puts unresolved human requested changes before review ticket details", () => {
    const prd = createReviewPrd();
    const ticket = prd.userStories.find((story) => story.id === "ticket-review");
    if (!ticket) {
      throw new Error("Expected review ticket fixture");
    }
    ticket.humanRequestedChanges =
      "## Changes Requested\n\nThe demo failed because notes were missing.";

    const context = generateVSCodeContext(prd, {
      type: "review",
      selectedTicket: {
        id: "ticket-review",
        title: "Review launch contract",
      },
    });

    expect(context).toContain("## Human Requested Changes - Fix This First");
    expect(context.indexOf("## Human Requested Changes - Fix This First")).toBeLessThan(
      context.indexOf("## Ticket Description")
    );
    expect(context.indexOf("The demo failed because notes were missing.")).toBeLessThan(
      context.indexOf("## Acceptance Criteria")
    );
  });

  it("puts unresolved human requested changes in implementation launch context", () => {
    const prd = createReviewPrd();
    const ticket = prd.userStories.find((story) => story.id === "ticket-review");
    if (!ticket) {
      throw new Error("Expected review ticket fixture");
    }
    ticket.humanRequestedChanges = "## Changes Requested\n\nFix the failed demo step first.";

    const context = generateVSCodeContext(prd);

    expect(context).toContain("## Human Requested Changes - Fix This First");
    expect(context).toContain("Fix the failed demo step first.");
    expect(context.indexOf("## Human Requested Changes - Fix This First")).toBeLessThan(
      context.indexOf("## Current Tickets")
    );
  });

  it("includes reuse and production-path discipline in implementation contexts", () => {
    const context = generateVSCodeContext(createReviewPrd());

    expect(context).toContain("## Implementation Discipline");
    expect(context).toContain(
      "map each acceptance criterion to the existing production entry point"
    );
    expect(context).toContain("New shared logic must be wired through the real production caller");
    expect(context).toContain("Prefer explicit code a junior engineer can trace");
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

    expect(context).toContain("brain-dump review check-complete --ticket ticket-review --pretty");
    expect(context).toContain(
      "Generate 3-7 verification steps with automation specs for visual/automated UI, API, command, or file checks, then STOP."
    );
    expect(context).toContain("- Review mode is separate from implementation launch mode");
    expect(context).toContain("- Steering text is preserved verbatim");
    expect(context).not.toContain("workflow complete-work");
  });
});
