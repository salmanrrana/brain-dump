## 3. Type Definitions

```typescript
/**
 * Ticket status - CLEANED UP (removed legacy 'review')
 */
export type TicketStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "ai_review"
  | "human_review"
  | "done";

/**
 * Workflow state tracked per ticket
 */
export interface TicketWorkflowState {
  ticketId: string;

  // Implementation phase
  planWritten: boolean; // TaskCreate was used
  implementationStarted: boolean;
  validationPassed: boolean; // pnpm check passed

  // AI Review phase
  aiReviewStarted: boolean;
  reviewFindingsCount: number;
  reviewIteration: number;
  allFindingsFixed: boolean;

  // Human Review phase
  demoScriptGenerated: boolean;
  demoScript: string | null;
  humanRanDemo: boolean;
  humanFeedback: string | null;
  humanApproved: boolean;

  // Completion
  learningsReconciled: boolean;
  learnings: string | null;

  // Timestamps
  startedAt: string;
  completedAt: string | null;
}

/**
 * Epic workflow state
 */
export interface EpicWorkflowState {
  epicId: string;

  // Ticket completion
  totalTickets: number;
  completedTickets: number;
  allTicketsComplete: boolean;

  // DoD Audit
  dodAuditPassed: boolean;
  dodAuditFindings: string[];

  // Epic Review
  epicReviewPassed: boolean;
  epicReviewIteration: number;
  epicFindingsCount: number;

  // Demo & Feedback
  epicDemoScript: string | null;
  epicHumanFeedback: string | null;
  epicApproved: boolean;

  // Learnings & PR
  learningsReconciled: boolean;
  prUrl: string | null;
  prNumber: number | null;
}

/**
 * Review finding from any agent
 */
export interface ReviewFinding {
  id: string;
  ticketId: string | null; // null = epic-level
  epicId: string;

  agent: ReviewAgentType;
  priority: "P0" | "P1" | "P2" | "P3" | "P4";

  filePath: string;
  lineNumber: number | null;
  summary: string;
  description: string;
  suggestedFix: string | null;

  status: "open" | "fixed" | "wontfix";
  fixDescription: string | null;

  iteration: number;
  createdAt: string;
  fixedAt: string | null;
}

type ReviewAgentType =
  | "code-reviewer"
  | "silent-failure-hunter"
  | "code-simplifier"
  | "context7-library-compliance"
  | "react-best-practices"
  | "cruft-detector"
  | "senior-engineer";

/**
 * Demo script for manual testing
 */
export interface DemoScript {
  id: string;
  ticketId: string | null;
  epicId: string;

  title: string;
  description: string;

  steps: DemoStep[];

  generatedAt: string;
  executedAt: string | null;
  executedBy: string | null;
}

interface DemoStep {
  order: number;
  instruction: string;
  expectedResult: string;
  passed: boolean | null;
  notes: string | null;
}
```

---
