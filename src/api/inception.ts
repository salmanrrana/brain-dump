import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { settings } from "../lib/schema";
import { eq } from "drizzle-orm";
import { detectTerminal, isTerminalAvailable, buildTerminalCommand } from "./terminal-utils";

// ============================================================================
// TYPES
// ============================================================================

interface LaunchInceptionResult {
  success: boolean;
  message: string;
  terminalUsed?: string;
  warnings?: string[];
}

// ============================================================================
// PROJECT INCEPTION PROMPT
// ============================================================================

function getProjectInceptionPrompt(defaultProjectsDir: string | null): string {
  const dirInstruction = defaultProjectsDir
    ? `Default projects directory: ${defaultProjectsDir}`
    : `Ask the user where they want to create the project directory.`;

  return `You are a senior software architect helping a user start a brand new project from scratch.

## CRITICAL: Interview Method

**ALWAYS use the AskUserQuestion tool** for your interview questions. Structure EVERY question with 2-4 multiple choice options. The user can quickly click an option OR choose "Other" to type a custom answer.

Example format:
- Question: "What type of application is this?"
- Options with descriptions:
  - "Web application" - React, Vue, full-stack web app
  - "Mobile app" - iOS, Android, or cross-platform
  - "CLI tool" - Command-line utility or backend service
  - "Desktop app" - Electron, Tauri, native desktop

**NEVER** ask open-ended text questions. Always provide thoughtful options.

## Interview Flow

### Phase 1: Foundation (one AskUserQuestion each)
1. **Application type**: Web, mobile, CLI, desktop, API
2. **Primary problem**: What does it solve? (offer patterns based on type)
3. **Target users**: Developers, consumers, enterprise, internal team
4. **Scale**: Personal project, startup MVP, enterprise scale

### Phase 2: Technical Stack (one AskUserQuestion each)
1. **Frontend**: React/Next, Vue/Nuxt, Svelte, HTMX, none
2. **Backend**: Node, Python, Go, Rust, serverless, none
3. **Database**: PostgreSQL, SQLite, MongoDB, none
4. **Deployment**: Vercel, AWS, self-hosted, local only

### Phase 3: Architecture (one AskUserQuestion each)
1. **Style**: Monolith, microservices, serverless, hybrid
2. **Real-time**: WebSockets, SSE, polling, none
3. **Auth**: OAuth, JWT, sessions, magic links, none
4. **Integrations**: Payment, email, storage, analytics (multiSelect)

### Phase 4: Features & UX (one AskUserQuestion each)
1. **Core feature #1**: Options based on app type
2. **Core feature #2**: Options based on app type
3. **Visual style**: Minimal, modern, playful, corporate
4. **Responsiveness**: Mobile-first, desktop-first, both equally

### Phase 5: Constraints (one AskUserQuestion each)
1. **Timeline**: Hackathon, 1 month, 3 months, ongoing
2. **Priority**: Speed vs quality
3. **Security level**: Basic, standard, high-security
4. **Budget**: Free tier only, modest budget, enterprise budget

### Phase 6: Confirmation
Summarize all answers, then ask:
- Project name (suggest one based on description)
- Directory location
  ${dirInstruction}

## Question Design Guidelines

Make questions **insightful, not obvious**:

BAD: "Do you need a database?"
GOOD: "How will your app handle data?"
- PostgreSQL (relational, complex queries)
- SQLite (simple, file-based, local-first)
- MongoDB (flexible schema, documents)
- No database (stateless, external APIs)

Once the interview is complete and confirmed, execute these steps:

1. **Create the project directory:**
   \`\`\`bash
   mkdir -p {directory}/{project-name}
   cd {directory}/{project-name}
   \`\`\`

2. **Write spec.md** - A comprehensive specification document with:
   - Project overview
   - Problem statement
   - Target users
   - Core features (MVP)
   - Future features (nice-to-have)
   - Technical architecture
   - Tech stack decisions
   - UI/UX guidelines
   - Non-functional requirements
   - Open questions/risks

3. **Set up plans/ folder:**
   \`\`\`bash
   mkdir -p plans
   \`\`\`

   Create these files:
   - \`plans/prd.json\` - Initialize with empty structure:
     \`\`\`json
     {
       "projectName": "{project-name}",
       "projectPath": "{full-path}",
       "userStories": [],
       "generatedAt": "{timestamp}"
     }
     \`\`\`
   - \`plans/progress.txt\` - Initialize with:
     \`\`\`
     # {Project Name} Progress Log

     ## Project Created
     Date: {timestamp}
     Created via Brain Dump Project Inception

     Next step: Run Spec Breakdown to generate tickets
     \`\`\`

4. **Initialize git repository:**
   \`\`\`bash
   git init
   git add .
   git commit -m "Initial project setup with spec"
   \`\`\`

5. **Register in Brain Dump:**
   Use the Brain Dump MCP tool \`create_project\` with:
   - name: The project name
   - path: The full path to the project directory

   This registers the project in Brain Dump so you can create tickets for it.

6. **Final output:**
   After completing all steps, output exactly:
   \`\`\`
   PROJECT_INCEPTION_COMPLETE
   Project: {project-name}
   Path: {full-path}
   Next Step: Run the Spec Breakdown to generate tickets from the spec
   \`\`\`

## Important Guidelines
- Be thorough but not tedious - adapt to the user's energy level
- If they want to skip ahead, let them
- If something is unclear, ask clarifying questions
- Make sensible default suggestions based on their requirements
- The spec.md should be detailed enough that another developer could implement it
- Use the AskUserQuestion tool for interview questions when appropriate`;
}

// ============================================================================
// SPEC BREAKDOWN PROMPT
// ============================================================================

function getSpecBreakdownPrompt(projectPath: string, projectName: string): string {
  return `You are a senior software architect breaking down a project specification into actionable tickets.

## Your Mission
Read the spec.md file in this project and create a comprehensive set of tickets in Brain Dump.

## Input
Project name: ${projectName}
Project path: ${projectPath}
Read the file: ${projectPath}/spec.md

## Process

### Step 1: Analyze the Spec
Read and understand the entire specification. Identify:
- Core features that make up the MVP
- Supporting features that enable the core
- Nice-to-have features for later
- Technical infrastructure needs (setup, CI/CD, etc.)

### Step 2: Create Epics
Group related work into epics. Common epic patterns:
- "Project Setup" - Initial scaffolding, tooling, CI/CD
- "Core Feature: [Name]" - Main features
- "User Authentication" - If applicable
- "Data Layer" - Database, APIs
- "UI/UX" - Common components, styling
- "Testing & QA" - Test infrastructure
- "Documentation" - README, API docs

Use Brain Dump MCP tool \`create_epic\` for each epic with:
- projectId: (get from find_project_by_path first)
- title: Epic title
- description: Brief description

### Step 3: Create Tickets
For each epic, create granular, actionable tickets. Each ticket should:
- Be completable in 1-4 hours of focused work
- Have a clear definition of done
- Be properly prioritized (high/medium/low)

Use Brain Dump MCP tool \`create_ticket\` for each ticket with:
- projectId: The project ID
- epicId: The epic ID this ticket belongs to
- title: Short, descriptive title
- description: Detailed description with acceptance criteria
- priority: high, medium, or low
- tags: Relevant tags like ["setup"], ["backend"], ["frontend"], ["testing"]

**Ticket Guidelines:**
- Start with setup/infrastructure tickets (high priority)
- Order tickets by dependency (what needs to be done first?)
- Include test tickets for each feature
- Don't forget documentation tickets
- Break large features into multiple smaller tickets

### Step 4: Generate PRD
Update the plans/prd.json file with all tickets:

\`\`\`json
{
  "projectName": "${projectName}",
  "projectPath": "${projectPath}",
  "userStories": [
    {
      "id": "ticket-uuid-from-brain-dump",
      "title": "Ticket title",
      "description": "Ticket description",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "priority": "high",
      "tags": ["setup"],
      "passes": false
    }
  ],
  "generatedAt": "{ISO timestamp}"
}
\`\`\`

### Step 5: Update Progress Log
Append to plans/progress.txt:
\`\`\`
## Spec Breakdown Complete
Date: {timestamp}
Epics created: {count}
Tickets created: {count}
Ready for development!
\`\`\`

### Step 6: Commit Changes
\`\`\`bash
git add plans/
git commit -m "chore: generate PRD and tickets from spec"
\`\`\`

## Output Format
After completing breakdown, output exactly:
\`\`\`
SPEC_BREAKDOWN_COMPLETE
Epics: {count}
Tickets: {count}
High Priority: {count}
Ready to start development with Claude or Ralph!
\`\`\``;
}

// ============================================================================
// LAUNCH FUNCTIONS
// ============================================================================

// Launch Project Inception skill
export const launchProjectInception = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { preferredTerminal?: string | null }) => data
  )
  .handler(async ({ data }): Promise<LaunchInceptionResult> => {
    const { preferredTerminal } = data;
    const { exec } = await import("child_process");
    const { writeFileSync, mkdirSync, chmodSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");
    const { randomUUID } = await import("crypto");

    // Get settings for default projects directory
    const currentSettings = db
      .select()
      .from(settings)
      .where(eq(settings.id, "default"))
      .get();

    const defaultProjectsDir = currentSettings?.defaultProjectsDirectory ?? null;

    // Determine which terminal to use
    let terminal: string | null = null;
    const warnings: string[] = [];

    if (preferredTerminal) {
      const result = await isTerminalAvailable(preferredTerminal);
      if (result.available) {
        terminal = preferredTerminal;
      } else {
        // Preferred terminal not available - add warning
        const reason = result.error || "not installed";
        warnings.push(`Your preferred terminal "${preferredTerminal}" is not available (${reason}). Using auto-detected terminal instead.`);
      }
    }

    if (!terminal) {
      terminal = await detectTerminal();
    }

    if (!terminal) {
      return {
        success: false,
        message: "No terminal emulator found. Please install one or set a preference in Settings.",
        ...(warnings.length > 0 && { warnings }),
      };
    }

    // Create the script directory
    const scriptDir = join(homedir(), ".brain-dump", "scripts");
    mkdirSync(scriptDir, { recursive: true });

    // Create prompt file
    const promptId = randomUUID();
    const promptFile = join(scriptDir, `inception-prompt-${promptId}.md`);
    const prompt = getProjectInceptionPrompt(defaultProjectsDir);
    writeFileSync(promptFile, prompt, { mode: 0o600 });

    // Create launch script
    const scriptPath = join(scriptDir, `inception-${promptId}.sh`);
    const workDir = defaultProjectsDir || homedir();

    const script = `#!/bin/bash
set -e

echo ""
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;32m🧠 Brain Dump - Project Inception\\033[0m"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m🚀 Starting new project from scratch...\\033[0m"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

# Launch Claude with the prompt
claude "${promptFile}"

# Cleanup prompt file
rm -f "${promptFile}"

echo ""
echo -e "\\033[0;32m✅ Inception session ended.\\033[0m"
exec bash
`;

    writeFileSync(scriptPath, script, { mode: 0o700 });
    chmodSync(scriptPath, 0o700);

    // Build and execute terminal command
    const terminalCommand = buildTerminalCommand(terminal, workDir, scriptPath);

    try {
      exec(terminalCommand, (error) => {
        if (error) {
          console.error("Terminal launch error:", error);
        }
      });

      return {
        success: true,
        message: `Launched Project Inception in ${terminal}`,
        terminalUsed: terminal,
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to launch terminal: ${error instanceof Error ? error.message : "Unknown error"}`,
        ...(warnings.length > 0 && { warnings }),
      };
    }
  });

// Launch Spec Breakdown skill for an existing project
export const launchSpecBreakdown = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { projectPath: string; projectName: string; preferredTerminal?: string | null }) => data
  )
  .handler(async ({ data }): Promise<LaunchInceptionResult> => {
    const { projectPath, projectName, preferredTerminal } = data;
    const { exec } = await import("child_process");
    const { writeFileSync, mkdirSync, chmodSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");
    const { randomUUID } = await import("crypto");

    // Verify spec.md exists
    const specPath = join(projectPath, "spec.md");
    if (!existsSync(specPath)) {
      return {
        success: false,
        message: `No spec.md found at ${specPath}. Run Project Inception first or create a spec.md manually.`,
      };
    }

    // Determine which terminal to use
    let terminal: string | null = null;
    const warnings: string[] = [];

    if (preferredTerminal) {
      const result = await isTerminalAvailable(preferredTerminal);
      if (result.available) {
        terminal = preferredTerminal;
      } else {
        // Preferred terminal not available - add warning
        const reason = result.error || "not installed";
        warnings.push(`Your preferred terminal "${preferredTerminal}" is not available (${reason}). Using auto-detected terminal instead.`);
      }
    }

    if (!terminal) {
      terminal = await detectTerminal();
    }

    if (!terminal) {
      return {
        success: false,
        message: "No terminal emulator found.",
        ...(warnings.length > 0 && { warnings }),
      };
    }

    // Create the script directory
    const scriptDir = join(homedir(), ".brain-dump", "scripts");
    mkdirSync(scriptDir, { recursive: true });

    // Create prompt file in the project directory so Claude can easily read the spec
    const promptId = randomUUID();
    const promptFile = join(projectPath, `.brain-dump-breakdown-prompt-${promptId}.md`);
    const prompt = getSpecBreakdownPrompt(projectPath, projectName);
    writeFileSync(promptFile, prompt, { mode: 0o600 });

    // Create launch script
    const scriptPath = join(scriptDir, `breakdown-${promptId}.sh`);

    const script = `#!/bin/bash
set -e

cd "${projectPath}"

echo ""
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;32m🧠 Brain Dump - Spec Breakdown\\033[0m"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📋 Project:\\033[0m ${projectName}"
echo -e "\\033[1;33m📁 Path:\\033[0m ${projectPath}"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

# Launch Claude with the prompt
claude "${promptFile}"

# Cleanup prompt file
rm -f "${promptFile}"

echo ""
echo -e "\\033[0;32m✅ Spec Breakdown session ended.\\033[0m"
exec bash
`;

    writeFileSync(scriptPath, script, { mode: 0o700 });
    chmodSync(scriptPath, 0o700);

    // Build and execute terminal command
    const terminalCommand = buildTerminalCommand(terminal, projectPath, scriptPath);

    try {
      exec(terminalCommand, (error) => {
        if (error) {
          console.error("Terminal launch error:", error);
        }
      });

      return {
        success: true,
        message: `Launched Spec Breakdown in ${terminal}`,
        terminalUsed: terminal,
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to launch terminal: ${error instanceof Error ? error.message : "Unknown error"}`,
        ...(warnings.length > 0 && { warnings }),
      };
    }
  });
