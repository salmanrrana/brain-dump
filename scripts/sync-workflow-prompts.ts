import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  renderCursorRuleSection,
  renderDocsStatusFlow,
  renderHowToAddWorkflowStepDocs,
  renderKanbanWorkflowStatusSection,
  renderMcpSkillSection,
  renderMermaidStatusDiagram,
  renderPiCliWorkflowSection,
  renderPiPromptWorkflowSection,
} from "../core/workflow-prompt-spec.ts";

const PROJECT_ROOT = join(import.meta.dirname, "..");
const GENERATED_ID = "workflow-sequence";
const BEGIN_MARKER = `<!-- BEGIN GENERATED: ${GENERATED_ID} -->`;
const END_MARKER = `<!-- END GENERATED: ${GENERATED_ID} -->`;

interface Target {
  path: string;
  render: () => string;
}

const targets: Target[] = [
  { path: ".claude/skills/brain-dump-workflow/SKILL.md", render: renderMcpSkillSection },
  { path: ".cursor/skills/brain-dump-workflow/SKILL.md", render: renderMcpSkillSection },
  { path: ".cursor/rules/brain-dump-workflow.md", render: renderCursorRuleSection },
  { path: ".github/copilot-instructions.md", render: renderMcpSkillSection },
  { path: ".github/agents/ralph.agent.md", render: renderMcpSkillSection },
  { path: ".github/agents/ticket-worker.agent.md", render: renderMcpSkillSection },
  { path: ".github/prompts/complete-ticket.prompt.md", render: renderMcpSkillSection },
  { path: ".github/prompts/start-ticket.prompt.md", render: renderMcpSkillSection },
  { path: ".github/skills/brain-dump-tickets/SKILL.md", render: renderDocsStatusFlow },
  { path: ".github/skills/brain-dump-workflow.skill.md", render: renderMcpSkillSection },
  { path: ".github/skills/ralph-workflow/SKILL.md", render: renderMcpSkillSection },
  { path: ".opencode/skill/brain-dump-workflow/SKILL.md", render: renderMcpSkillSection },
  { path: ".opencode/skill/ralph-autonomous/SKILL.md", render: renderMcpSkillSection },
  { path: ".opencode/agent/ralph.md", render: renderMcpSkillSection },
  { path: ".opencode/agent/ticket-worker.md", render: renderMcpSkillSection },
  { path: ".pi/skills/brain-dump-workflow/SKILL.md", render: renderPiCliWorkflowSection },
  { path: ".pi/prompts/start-ticket.md", render: renderPiPromptWorkflowSection },
  { path: ".pi/prompts/complete-ticket.md", render: renderPiPromptWorkflowSection },
  { path: ".pi/prompts/review-ticket.md", render: renderPiPromptWorkflowSection },
  { path: ".pi/prompts/demo-ticket.md", render: renderPiPromptWorkflowSection },
  { path: ".pi/prompts/next-ticket.md", render: renderPiPromptWorkflowSection },
  { path: "docs/claude-flow-ticket-lifecycle.md", render: renderMermaidStatusDiagram },
  { path: "docs/universal-workflow.md", render: renderDocsStatusFlow },
  { path: "docs/flows/kanban-workflow.md", render: renderKanbanWorkflowStatusSection },
  { path: "CLAUDE.md", render: renderHowToAddWorkflowStepDocs },
];

const checkOnly = process.argv.includes("--check");
const changed: string[] = [];

for (const target of targets) {
  const filePath = join(PROJECT_ROOT, target.path);
  const current = readFileSync(filePath, "utf8");
  const next = replaceGeneratedSection(current, target.render());
  if (next === current) continue;
  changed.push(target.path);
  if (!checkOnly) {
    writeFileSync(filePath, next, "utf8");
  }
}

if (checkOnly && changed.length > 0) {
  console.error("Workflow prompt/docs generated sections are out of date:");
  for (const filePath of changed) {
    console.error(`- ${filePath}`);
  }
  console.error("Run: pnpm workflow:prompts");
  process.exit(1);
}

if (!checkOnly) {
  console.log(`Synced ${targets.length} workflow prompt/doc sections.`);
}

function replaceGeneratedSection(content: string, generated: string): string {
  const beginIndex = content.indexOf(BEGIN_MARKER);
  const endIndex = content.indexOf(END_MARKER);
  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new Error(`Missing generated section markers: ${BEGIN_MARKER} ... ${END_MARKER}`);
  }

  const before = content.slice(0, beginIndex + BEGIN_MARKER.length);
  const after = content.slice(endIndex);
  return `${before}\n${generated.trim()}\n${after}`;
}
