import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  extractOverview,
  extractTypeDefinitions,
  extractDesignDecisions,
  extractImplementationGuide,
  extractAcceptanceCriteria,
  extractReferences,
  getProjectContext,
} from "./prd-extraction";

describe("extractOverview", () => {
  it("returns empty string for null description", () => {
    expect(extractOverview(null)).toBe("");
  });

  it("returns empty string for empty description", () => {
    expect(extractOverview("")).toBe("");
  });

  it("extracts content from Context section", () => {
    const description = `## Context
This feature exists because users need better error handling.
It improves the user experience.

## Implementation
Some implementation details.`;

    const result = extractOverview(description);
    expect(result).toContain("users need better error handling");
    expect(result).toContain("improves the user experience");
    expect(result).not.toContain("Implementation");
  });

  it("extracts content from Problem section", () => {
    const description = `## Problem
The current system has poor error handling.
Users don't know what went wrong.

## Solution
Fix it.`;

    const result = extractOverview(description);
    expect(result).toContain("poor error handling");
    expect(result).toContain("don't know what went wrong");
    expect(result).not.toContain("Fix it");
  });

  it("extracts content from multiple relevant sections", () => {
    const description = `## Context
Background info.

## Problem
The actual problem.

## Implementation
Details.`;

    const result = extractOverview(description);
    expect(result).toContain("Background info");
    expect(result).toContain("actual problem");
  });
});

describe("extractTypeDefinitions", () => {
  it("returns empty array for null description", () => {
    expect(extractTypeDefinitions(null)).toEqual([]);
  });

  it("extracts interface definitions from TypeScript code blocks", () => {
    const description = `## Types

\`\`\`typescript
interface User {
  id: string;
  name: string;
}
\`\`\``;

    const result = extractTypeDefinitions(description);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("User");
    expect(result[0]?.code).toContain("interface User");
  });

  it("extracts multiple interfaces", () => {
    const description = `\`\`\`typescript
interface First {
  a: string;
}

interface Second {
  b: number;
}
\`\`\``;

    const result = extractTypeDefinitions(description);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.name)).toContain("First");
    expect(result.map((t) => t.name)).toContain("Second");
  });

  it("extracts JSDoc descriptions", () => {
    const description = `\`\`\`typescript
/**
 * A user in the system
 */
interface User {
  id: string;
}
\`\`\``;

    const result = extractTypeDefinitions(description);
    expect(result).toHaveLength(1);
    expect(result[0]?.description).toContain("user in the system");
  });

  it("ignores non-TypeScript code blocks", () => {
    const description = `\`\`\`javascript
interface NotTypescript {
  x: number;
}
\`\`\``;

    const result = extractTypeDefinitions(description);
    expect(result).toEqual([]);
  });
});

describe("extractDesignDecisions", () => {
  it("returns empty array for null description", () => {
    expect(extractDesignDecisions(null)).toEqual([]);
  });

  it("extracts design decisions section", () => {
    const description = `## Why MCP Tools vs stdout parsing

1. **Stability**: MCP tool interface is under our control
2. **Structured Data**: Returns JSON, not text to parse`;

    const result = extractDesignDecisions(description);
    expect(result).toHaveLength(1);
    expect(result[0]?.decision).toContain("MCP Tools vs stdout parsing");
    expect(result[0]?.rationale).toHaveLength(2);
    expect(result[0]?.rationale[0]).toContain("Stability");
  });

  it("extracts multiple design decisions", () => {
    const description = `## Why Approach A

1. Reason one

## Why Approach B

1. Reason two`;

    const result = extractDesignDecisions(description);
    expect(result).toHaveLength(2);
  });
});

describe("extractImplementationGuide", () => {
  it("returns empty array for null description", () => {
    expect(extractImplementationGuide(null)).toEqual([]);
  });

  it("extracts numbered steps from Implementation section", () => {
    const description = `## Implementation

### Step 1: Create the schema

Create a new schema file.

**File**: \`src/lib/schema.ts\`

### Step 2: Add the API

Add the server function.`;

    const result = extractImplementationGuide(description);
    expect(result).toHaveLength(2);
    expect(result[0]?.step).toBe(1);
    expect(result[0]?.description).toBe("Create the schema");
    expect(result[0]?.files).toContain("src/lib/schema.ts");
    expect(result[1]?.step).toBe(2);
  });

  it("extracts code templates from steps", () => {
    const description = `## Implementation

### Step 1: Add code

\`\`\`typescript
const foo = "bar";
\`\`\``;

    const result = extractImplementationGuide(description);
    expect(result).toHaveLength(1);
    expect(result[0]?.codeTemplate).toContain('const foo = "bar"');
  });
});

describe("extractAcceptanceCriteria", () => {
  it("returns empty array for null description", () => {
    expect(extractAcceptanceCriteria(null)).toEqual([]);
  });

  it("extracts checkbox items", () => {
    const description = `## Acceptance Criteria
- [ ] Feature works correctly
- [x] Tests pass
- [ ] Documentation updated`;

    const result = extractAcceptanceCriteria(description);
    expect(result).toHaveLength(3);
    expect(result).toContain("Feature works correctly");
    expect(result).toContain("Tests pass");
  });

  it("extracts checkbox items from anywhere in description", () => {
    const description = `## Tasks
- [ ] First task
- [ ] Second task

## Notes
Some notes here.`;

    const result = extractAcceptanceCriteria(description);
    expect(result).toHaveLength(2);
  });

  it("extracts bullet points in Acceptance Criteria section", () => {
    const description = `## Acceptance Criteria
- Feature works
- Tests pass`;

    const result = extractAcceptanceCriteria(description);
    expect(result).toHaveLength(2);
  });
});

describe("extractReferences", () => {
  it("returns empty array for null description", () => {
    expect(extractReferences(null)).toEqual([]);
  });

  it("extracts references from References section", () => {
    const description = `## References
- Related ticket #123
- See documentation`;

    const result = extractReferences(description);
    expect(result).toHaveLength(2);
    expect(result).toContain("Related ticket #123");
    expect(result).toContain("See documentation");
  });

  it("extracts inline file references", () => {
    const description = `Check the code in \`src/api/ralph.ts\` for details.`;

    const result = extractReferences(description);
    expect(result).toContain("src/api/ralph.ts");
  });

  it("extracts line number references", () => {
    const description = `See \`src/lib/db.ts\` lines 10-20 for the schema.`;

    const result = extractReferences(description);
    expect(result).toContain("src/lib/db.ts:10-20");
  });
});

describe("getProjectContext", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `prd-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("returns default context when CLAUDE.md does not exist", () => {
    const result = getProjectContext(testDir);
    expect(result.verificationSteps).toHaveLength(3);
    expect(result.techStack).toEqual([]);
    expect(result.dosDonts).toEqual([]);
  });

  it("extracts tech stack from CLAUDE.md", () => {
    const claudeMd = `# Project

### Tech Stack

- **Framework**: TanStack Start
- **Database**: SQLite with Drizzle
`;
    writeFileSync(join(testDir, "CLAUDE.md"), claudeMd);

    const result = getProjectContext(testDir);
    expect(result.techStack).toHaveLength(2);
    expect(result.techStack[0]).toContain("Framework: TanStack Start");
    expect(result.techStack[1]).toContain("Database: SQLite with Drizzle");
  });

  it("extracts verification steps from CLAUDE.md", () => {
    const claudeMd = `# Project

### Code Quality (Always Required)

- [ ] Run \`pnpm type-check\`
- [ ] Run \`pnpm lint\`
- [ ] Run \`pnpm test\`

## Other Section
`;
    writeFileSync(join(testDir, "CLAUDE.md"), claudeMd);

    const result = getProjectContext(testDir);
    expect(result.verificationSteps).toHaveLength(3);
    expect(result.verificationSteps[0]).toContain("pnpm type-check");
  });
});
