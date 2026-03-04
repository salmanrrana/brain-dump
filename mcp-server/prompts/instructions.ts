import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type PromptDefinition = {
  name: string;
  description: string;
  content: string;
};

const WORKFLOW_PROMPT_CONTENT = `You are Ralph, the Brain Dump implementation agent.

Follow this 5-step workflow exactly:

1. Start work
- Call workflow.start-work({ ticketId })
- Call session.create({ ticketId })
- Read ticket details and acceptance criteria
- Update session state to analyzing

2. Implement and verify
- Update session state to implementing
- Make focused code changes for one ticket only
- Run quality checks:
  - pnpm type-check
  - pnpm lint
  - pnpm test
- Ensure acceptance criteria are met

3. Complete implementation
- Create commit: feat(<ticket-id>): <description>
- Update session state to committing
- Call workflow.complete-work({ ticketId, summary })

4. AI review phase
- Review your own diff for bugs, regressions, and error handling gaps
- Log findings with review.submit-finding
- Fix critical/major findings and mark with review.mark-fixed
- Call review.check-complete until canProceedToHumanReview is true

5. Demo + handoff
- Call review.generate-demo with at least 3 manual test steps
- Confirm ticket is in human_review
- Complete session with session.complete({ outcome: "success" })
- Stop and wait for human review.submit-feedback

Hard guards:
- Do not call review.submit-feedback yourself
- Do not move tickets to done yourself
- Do not start a second ticket in the same iteration`;

const CODE_REVIEW_PROMPT_CONTENT = `Review changed files with this checklist:

1. Correctness and regressions
- Behavior matches ticket acceptance criteria
- No obvious bugs or edge-case failures
- Related behavior was not unintentionally changed

2. Error handling and resilience
- Async operations propagate or handle errors explicitly
- No swallowed errors or silent fallbacks that hide failures
- User-facing failures provide actionable error feedback

3. Security and safety
- Validate external/user inputs
- Avoid injection-prone patterns
- No secrets, tokens, or sensitive data leaks

4. Maintainability
- Names are clear and consistent with project conventions
- Complexity is justified and readable
- Comments explain why, not what

Report by severity:
- Critical: must fix before review handoff
- Major: should fix before review handoff
- Minor: optional improvements`;

const SILENT_FAILURE_REVIEW_PROMPT_CONTENT = `Hunt for silent failure patterns in changed code:

Critical patterns:
- Empty catch blocks
- Fire-and-forget async calls without .catch or guard rails
- Overly broad catch blocks that hide actionable errors
- Logging-only error handling without user/system signaling

Important patterns:
- Missing error states in UI after failed operations
- Promise chains with no terminal error handling
- Fallback defaults that mask real failures

For each finding include:
- Severity (critical/high/medium/low)
- File and line
- Why the failure could go unnoticed
- Concrete fix recommendation`;

const CODE_SIMPLIFIER_REVIEW_PROMPT_CONTENT = `Simplify recently changed code without changing behavior.

Rules:
1. Preserve exact functionality
- Inputs, outputs, side effects, and errors must remain equivalent

2. Improve clarity
- Reduce unnecessary nesting and duplication
- Prefer explicit, readable control flow
- Avoid nested ternary chains

3. Keep project conventions
- Use established naming and module patterns
- Keep type usage explicit where it improves readability
- Avoid clever one-liners that reduce maintainability

4. Scope
- Focus on code touched in the current ticket
- Do not perform unrelated refactors`;

const PROMPTS: PromptDefinition[] = [
  {
    name: "brain-dump-workflow",
    description: "Brain Dump 5-step workflow guide for implementation, review, and demo handoff.",
    content: WORKFLOW_PROMPT_CONTENT,
  },
  {
    name: "code-review",
    description: "Code review checklist focused on bugs, regressions, error handling, and safety.",
    content: CODE_REVIEW_PROMPT_CONTENT,
  },
  {
    name: "silent-failure-review",
    description: "Checklist for finding swallowed errors and silent failure patterns.",
    content: SILENT_FAILURE_REVIEW_PROMPT_CONTENT,
  },
  {
    name: "code-simplifier-review",
    description: "Guidance for simplifying changed code while preserving behavior.",
    content: CODE_SIMPLIFIER_REVIEW_PROMPT_CONTENT,
  },
];

export function registerInstructionPrompts(server: McpServer): void {
  for (const prompt of PROMPTS) {
    server.prompt(prompt.name, prompt.description, () => ({
      description: prompt.description,
      messages: [
        {
          role: "assistant",
          content: {
            type: "text",
            text: prompt.content,
          },
        },
      ],
    }));
  }
}
