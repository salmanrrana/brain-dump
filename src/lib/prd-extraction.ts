/**
 * PRD Extraction Utilities
 *
 * Parse structured content from ticket descriptions to create Loom-style PRDs
 * with comprehensive type definitions, design decisions, and implementation guides.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A TypeScript type/interface definition extracted from a ticket description
 */
export interface TypeDefinition {
  /** Name of the type/interface */
  name: string;
  /** Full code block including the interface/type definition */
  code: string;
  /** Optional JSDoc description if present */
  description?: string;
}

/**
 * A design decision explaining why a particular approach was chosen
 */
export interface DesignDecision {
  /** The decision being made (e.g., "Why MCP Tools vs stdout parsing") */
  decision: string;
  /** Alternative approaches that were considered */
  alternatives: string[];
  /** Numbered rationale for the chosen approach */
  rationale: string[];
}

/**
 * A step in the implementation guide
 */
export interface ImplementationStep {
  /** Step number */
  step: number;
  /** Description of what to do in this step */
  description: string;
  /** Optional code template to use */
  codeTemplate?: string;
  /** Files that will be created or modified */
  files: string[];
}

/**
 * Enhanced PRD item with Loom-style structure
 */
export interface EnhancedPRDItem {
  id: string;
  title: string;
  passes: boolean;

  /** WHY this feature exists (extracted from Context/Problem sections) */
  overview: string;

  /** Complete TypeScript type definitions */
  types: TypeDefinition[];

  /** Design decisions with alternatives and rationale */
  designDecisions: DesignDecision[];

  /** Step-by-step implementation guide */
  implementationGuide: ImplementationStep[];

  /** Acceptance criteria as a checklist */
  acceptanceCriteria: string[];

  /** References to other files, docs, or tickets */
  references: string[];

  /** Original description for fallback display */
  description: string | null;

  /** Priority level */
  priority: string | null;

  /** Tags for categorization */
  tags: string[];
}

/**
 * Project context extracted from CLAUDE.md
 */
export interface ProjectContext {
  /** Tech stack summary */
  techStack: string[];
  /** DO/DON'T guidelines */
  dosDonts: {
    category: string;
    dos: string[];
    donts: string[];
  }[];
  /** Verification steps required before completing work */
  verificationSteps: string[];
}

/**
 * Enhanced PRD document with Loom-style structure
 */
export interface EnhancedPRDDocument {
  projectName: string;
  projectPath: string;
  epicTitle?: string;
  epicDescription?: string;
  testingRequirements: string[];
  userStories: EnhancedPRDItem[];
  projectContext: ProjectContext;
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the overview/context from a ticket description.
 * Looks for Context, Problem, and Overview sections.
 */
export function extractOverview(description: string | null): string {
  if (!description) return "";

  const lines = description.split("\n");
  const overviewParts: string[] = [];

  // Look for Context, Problem, or Overview sections
  const sectionPatterns = [
    /^##?\s*context/i,
    /^##?\s*problem/i,
    /^##?\s*overview/i,
    /^##?\s*background/i,
    /^##?\s*motivation/i,
  ];

  let inSection = false;
  let sectionDepth = 0;

  for (const line of lines) {
    // Check if we're entering a relevant section
    const isRelevantSection = sectionPatterns.some((pattern) => pattern.test(line));
    const sectionMatch = line.match(/^(#+)\s+/);

    if (isRelevantSection && sectionMatch) {
      inSection = true;
      sectionDepth = sectionMatch[1]?.length ?? 0;
      continue; // Don't include the header itself
    }

    // Check if we're leaving the section (hit another section of same or higher level)
    if (inSection && sectionMatch) {
      const newDepth = sectionMatch[1]?.length ?? 0;
      if (newDepth <= sectionDepth) {
        inSection = false;
      }
    }

    // Collect content while in a relevant section
    if (inSection && line.trim()) {
      overviewParts.push(line);
    }
  }

  return overviewParts.join("\n").trim();
}

/**
 * Extract TypeScript type definitions from code blocks in the description.
 */
export function extractTypeDefinitions(description: string | null): TypeDefinition[] {
  if (!description) return [];

  const types: TypeDefinition[] = [];

  // Match TypeScript code blocks
  const codeBlockPattern = /```(?:typescript|ts)\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockPattern.exec(description)) !== null) {
    const code = match[1];
    if (!code) continue;

    // Look for interface or type definitions
    const interfacePattern = /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?interface\s+(\w+)[\s\S]*?^\}/gm;
    const typePattern = /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?type\s+(\w+)\s*=/gm;

    let defMatch;

    // Extract interfaces
    while ((defMatch = interfacePattern.exec(code)) !== null) {
      const fullMatch = defMatch[0];
      const name = defMatch[2];
      if (!name) continue;

      // Extract JSDoc if present
      const jsdocMatch = fullMatch.match(/\/\*\*[\s\S]*?\*\//);
      const jsdocDescription = jsdocMatch
        ? jsdocMatch[0]
            .replace(/\/\*\*|\*\//g, "")
            .replace(/^\s*\*\s?/gm, "")
            .trim()
        : undefined;

      const typeDef: TypeDefinition = {
        name,
        code: fullMatch,
      };
      if (jsdocDescription) {
        typeDef.description = jsdocDescription;
      }
      types.push(typeDef);
    }

    // Extract type aliases (simpler pattern)
    while ((defMatch = typePattern.exec(code)) !== null) {
      const name = defMatch[2];
      if (!name) continue;

      // Find the full type definition (until semicolon or next definition)
      const startIndex = defMatch.index;
      let endIndex = code.indexOf(";", startIndex);
      if (endIndex === -1) endIndex = code.length;

      const fullCode = code.slice(startIndex, endIndex + 1);

      // Avoid duplicates
      if (!types.some((t) => t.name === name)) {
        types.push({
          name,
          code: fullCode,
        });
      }
    }
  }

  return types;
}

/**
 * Extract design decisions from the description.
 * Looks for "Why X vs Y" or "Design Decisions" sections.
 */
export function extractDesignDecisions(description: string | null): DesignDecision[] {
  if (!description) return [];

  const decisions: DesignDecision[] = [];
  const lines = description.split("\n");

  // Look for Design Decisions section or Why X vs Y patterns
  const sectionPatterns = [
    /^##?\s*design\s*decisions?/i,
    /^##?\s*why\s+\w+/i,
    /^###?\s*why\s+\w+\s+(?:vs|instead\s+of|not)/i,
  ];

  let inDecisionSection = false;
  let currentDecision: DesignDecision | null = null;
  let collectingRationale = false;
  let sectionDepth = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for section header
    const headerMatch = line.match(/^(#+)\s+(.*)/);
    if (headerMatch) {
      const headerMarks = headerMatch[1];
      const title = headerMatch[2];
      if (!headerMarks || !title) continue;

      const depth = headerMarks.length;

      // Check if this is a design decision section
      const isDecisionSection = sectionPatterns.some((pattern) => pattern.test(line));

      if (isDecisionSection) {
        // Save previous decision if exists
        if (currentDecision && currentDecision.decision) {
          decisions.push(currentDecision);
        }

        inDecisionSection = true;
        sectionDepth = depth;

        // Start new decision
        currentDecision = {
          decision: title.replace(/^why\s+/i, "").trim(),
          alternatives: [],
          rationale: [],
        };
        collectingRationale = false;
        continue;
      }

      // Check if we've left the decision section
      if (inDecisionSection && depth <= sectionDepth && !isDecisionSection) {
        if (currentDecision && currentDecision.decision) {
          decisions.push(currentDecision);
        }
        currentDecision = null;
        inDecisionSection = false;
      }
    }

    // Collect content within decision section
    if (inDecisionSection && currentDecision) {
      // Check for numbered rationale (e.g., "1. **Stability**: description" or "1. Stability: description")
      const numberedMatch = trimmedLine.match(
        /^(\d+)\.\s*(?:\*\*([^*]+)\*\*|\*([^*]+)\*|([^:]+)):\s*(.*)/
      );
      if (numberedMatch) {
        // Extract the label from whichever group matched (bold, italic, or plain)
        const label = numberedMatch[2] ?? numberedMatch[3] ?? numberedMatch[4] ?? "";
        const description = numberedMatch[5] ?? "";
        collectingRationale = true;
        const point = label.trim() + (description ? `: ${description.trim()}` : "");
        currentDecision.rationale.push(point);
        continue;
      }

      // Check for bullet points as alternatives
      const bulletMatch = trimmedLine.match(/^[-*]\s+(.+)/);
      if (bulletMatch && !collectingRationale) {
        const alt = bulletMatch[1];
        if (alt) {
          currentDecision.alternatives.push(alt);
        }
      }
    }
  }

  // Don't forget the last decision
  if (currentDecision && currentDecision.decision) {
    decisions.push(currentDecision);
  }

  return decisions;
}

/**
 * Extract implementation guide steps from the description.
 * Looks for numbered implementation steps or "Step X" headers.
 */
export function extractImplementationGuide(description: string | null): ImplementationStep[] {
  if (!description) return [];

  const steps: ImplementationStep[] = [];
  const lines = description.split("\n");

  let inImplementationSection = false;
  let currentStep: ImplementationStep | null = null;
  let collectingCode = false;
  let codeBuffer = "";

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for Implementation section header
    if (/^##?\s*implementation/i.test(line)) {
      inImplementationSection = true;
      continue;
    }

    // Check for other major sections that end implementation
    if (inImplementationSection && /^##\s+(?!step|implementation)/i.test(line)) {
      if (currentStep) {
        steps.push(currentStep);
      }
      inImplementationSection = false;
      continue;
    }

    if (!inImplementationSection) continue;

    // Check for step headers (### Step 1: ... or ### 1. ...)
    const stepHeaderMatch = trimmedLine.match(/^###?\s*(?:step\s+)?(\d+)[:.]\s*(.+)/i);
    if (stepHeaderMatch) {
      const stepNumStr = stepHeaderMatch[1];
      const stepDesc = stepHeaderMatch[2];
      if (!stepNumStr || !stepDesc) continue;

      // Save previous step
      if (currentStep) {
        if (codeBuffer) {
          currentStep.codeTemplate = codeBuffer.trim();
          codeBuffer = "";
        }
        steps.push(currentStep);
      }

      const stepNumber = parseInt(stepNumStr, 10);
      currentStep = {
        step: stepNumber,
        description: stepDesc,
        files: [],
      };
      collectingCode = false;
      continue;
    }

    // Collect code blocks for current step
    if (currentStep) {
      if (trimmedLine.startsWith("```")) {
        collectingCode = !collectingCode;
        if (!collectingCode && codeBuffer) {
          // End of code block
          currentStep.codeTemplate = codeBuffer.trim();
          codeBuffer = "";
        }
        continue;
      }

      if (collectingCode) {
        codeBuffer += line + "\n";
        continue;
      }

      // Extract file references
      const fileMatch = trimmedLine.match(/\*\*File\*\*:\s*`?([^`\n]+)`?/i);
      if (fileMatch) {
        const filePath = fileMatch[1];
        if (filePath) {
          currentStep.files.push(filePath);
        }
      }

      // Also look for file patterns in the description
      const inlineFileMatch = trimmedLine.match(/`(src\/[^`]+|[^`]+\.(?:ts|tsx|js|jsx))`/);
      if (inlineFileMatch) {
        const filePath = inlineFileMatch[1];
        if (filePath && !currentStep.files.includes(filePath)) {
          currentStep.files.push(filePath);
        }
      }
    }
  }

  // Save last step
  if (currentStep) {
    if (codeBuffer) {
      currentStep.codeTemplate = codeBuffer.trim();
    }
    steps.push(currentStep);
  }

  return steps;
}

/**
 * Extract acceptance criteria from the description.
 * Looks for checkbox items or items under "Acceptance Criteria" section.
 */
export function extractAcceptanceCriteria(description: string | null): string[] {
  if (!description) return [];

  const criteria: string[] = [];
  const lines = description.split("\n");

  let inCriteriaSection = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for Acceptance Criteria section
    if (/^##?\s*acceptance\s*criteria/i.test(line)) {
      inCriteriaSection = true;
      continue;
    }

    // Check for other sections that end criteria
    if (inCriteriaSection && /^##/.test(line)) {
      inCriteriaSection = false;
      continue;
    }

    // Extract checkbox items (even outside the section)
    const checkboxMatch = trimmedLine.match(/^-\s*\[[ x]\]\s*(.+)/i);
    if (checkboxMatch) {
      const criterion = checkboxMatch[1];
      if (criterion) {
        criteria.push(criterion);
      }
      continue;
    }

    // In criteria section, also accept plain bullet points
    if (inCriteriaSection) {
      const bulletMatch = trimmedLine.match(/^[-*]\s+(.+)/);
      if (bulletMatch) {
        const criterion = bulletMatch[1];
        if (criterion) {
          criteria.push(criterion);
        }
      }
    }
  }

  return criteria;
}

/**
 * Extract references from the description.
 * Looks for file paths, URLs, and explicit references sections.
 */
export function extractReferences(description: string | null): string[] {
  if (!description) return [];

  const references: string[] = [];
  const seenRefs = new Set<string>();

  // Look for explicit References section
  const refSectionMatch = description.match(/##?\s*references?\n([\s\S]*?)(?=\n##|$)/i);
  if (refSectionMatch) {
    const refContent = refSectionMatch[1];
    if (refContent) {
      const refLines = refContent.split("\n");
      for (const line of refLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
          const ref = trimmed.replace(/^[-*]\s+/, "").trim();
          if (ref && !seenRefs.has(ref)) {
            seenRefs.add(ref);
            references.push(ref);
          }
        }
      }
    }
  }

  // Extract inline file references
  const filePattern = /`((?:src|lib|mcp-server|plans)\/[^`]+)`/g;
  let match;
  while ((match = filePattern.exec(description)) !== null) {
    const ref = match[1];
    if (ref && !seenRefs.has(ref)) {
      seenRefs.add(ref);
      references.push(ref);
    }
  }

  // Extract explicit line number references
  const lineRefPattern = /`([^`]+)`\s*(?:lines?\s*|#L)(\d+(?:-\d+)?)/gi;
  while ((match = lineRefPattern.exec(description)) !== null) {
    const file = match[1];
    const lineNum = match[2];
    if (file && lineNum) {
      const ref = `${file}:${lineNum}`;
      if (!seenRefs.has(ref)) {
        seenRefs.add(ref);
        references.push(ref);
      }
    }
  }

  return references;
}

/**
 * Read and parse project context from CLAUDE.md
 */
export function getProjectContext(projectPath: string): ProjectContext {
  const claudeMdPath = join(projectPath, "CLAUDE.md");

  const defaultContext: ProjectContext = {
    techStack: [],
    dosDonts: [],
    verificationSteps: [
      "Run `pnpm type-check` - must pass with no errors",
      "Run `pnpm lint` - must pass with no errors",
      "Run `pnpm test` - all tests must pass",
    ],
  };

  if (!existsSync(claudeMdPath)) {
    return defaultContext;
  }

  try {
    const content = readFileSync(claudeMdPath, "utf-8");
    const context: ProjectContext = { ...defaultContext };

    // Extract tech stack from "## Architecture" or "### Tech Stack" section
    const techStackMatch = content.match(/###?\s*tech\s*stack\n([\s\S]*?)(?=\n##|\n###|$)/i);
    if (techStackMatch) {
      const techContent = techStackMatch[1];
      if (techContent) {
        const lines = techContent.split("\n");
        for (const line of lines) {
          const bulletMatch = line.match(/^[-*]\s+\*\*([^*]+)\*\*:\s*(.+)/);
          if (bulletMatch) {
            const tech = bulletMatch[1];
            const desc = bulletMatch[2];
            if (tech && desc) {
              context.techStack.push(`${tech}: ${desc}`);
            }
          }
        }
      }
    }

    // Extract DO/DON'T tables
    const dosDontsTablePattern =
      /###?\s*([^#\n]+)\n\n\|[^|]*DO[^|]*\|[^|]*DON'T[^|]*\|\n\|[-\s|]+\|\n((?:\|[^|\n]+\|[^|\n]+\|\n?)+)/gi;
    let tableMatch;
    while ((tableMatch = dosDontsTablePattern.exec(content)) !== null) {
      const category = tableMatch[1]?.trim() ?? "";
      const tableContent = tableMatch[2];
      if (!tableContent) continue;

      const tableRows = tableContent.split("\n").filter((row) => row.trim());

      const dos: string[] = [];
      const donts: string[] = [];

      for (const row of tableRows) {
        const cells = row.split("|").filter((c) => c.trim());
        if (cells.length >= 2) {
          const doItem = cells[0]?.trim() ?? "";
          const dontItem = cells[1]?.trim() ?? "";
          if (doItem) dos.push(doItem);
          if (dontItem) donts.push(dontItem);
        }
      }

      if (dos.length > 0 || donts.length > 0) {
        context.dosDonts.push({ category, dos, donts });
      }
    }

    // Extract verification steps from Verification Checklist
    const verificationMatch = content.match(
      /###?\s*(?:code\s*quality|verification|before\s*marking)/i
    );
    if (verificationMatch && verificationMatch.index !== undefined) {
      const sectionStart = verificationMatch.index;
      const nextSectionIdx = content.indexOf("\n## ", sectionStart + 1);
      const sectionContent = content.slice(
        sectionStart,
        nextSectionIdx === -1 ? content.length : nextSectionIdx
      );

      const checkboxes = sectionContent.match(/-\s*\[[ x]\]\s*([^\n]+)/g);
      if (checkboxes) {
        context.verificationSteps = checkboxes.map((cb) =>
          cb.replace(/-\s*\[[ x]\]\s*/, "").trim()
        );
      }
    }

    return context;
  } catch (error) {
    console.error("[prd-extraction] Failed to read CLAUDE.md:", error);
    return defaultContext;
  }
}
