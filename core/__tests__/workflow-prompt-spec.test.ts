import { describe, expect, it } from "vitest";
import { TICKET_STATUSES, WORKFLOW_TRANSITIONS } from "../workflow-steps.ts";
import {
  getStatusFlowText,
  renderDocsStatusFlow,
  renderMcpWorkflowPromptContent,
  renderMermaidStatusDiagram,
  WORKFLOW_PHASES,
} from "../workflow-prompt-spec.ts";

describe("workflow prompt specification", () => {
  it("derives status flow text from the canonical status order", () => {
    expect(getStatusFlowText()).toBe(TICKET_STATUSES.join(" -> "));
  });

  it("renders docs from the canonical status metadata", () => {
    const docs = renderDocsStatusFlow();

    for (const status of TICKET_STATUSES) {
      expect(docs).toContain(`\`${status}\``);
    }
  });

  it("renders workflow phases into MCP prompt content", () => {
    const prompt = renderMcpWorkflowPromptContent();

    for (const phase of WORKFLOW_PHASES) {
      expect(prompt).toContain(phase.title);
      for (const toolCall of phase.toolCalls) {
        expect(prompt).toContain(toolCall);
      }
    }
  });

  it("renders the docs state diagram from the current transition labels", () => {
    const diagram = renderMermaidStatusDiagram();

    for (const transition of WORKFLOW_TRANSITIONS) {
      expect(diagram).toContain(`${transition.from} --> ${transition.to}`);
    }
  });
});
