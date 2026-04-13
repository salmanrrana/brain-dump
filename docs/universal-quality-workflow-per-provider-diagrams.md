# Universal Quality Workflow Per Provider Diagrams

This is the visual companion to `docs/universal-quality-workflow-per-provider.md`.

It gives you multiple diagram variations so you can understand the system at different zoom levels:

- high-level architecture
- shared workflow state machine
- start-work launch variations
- full ticket lifecycle
- provider-by-provider enforcement differences
- review/demo gate loop
- comment creation flow
- state enforcement model

## Existing Diagram Docs In This Repo

If you want even more visuals, these existing pages are the most relevant:

- `docs/architecture.md`
  High-level system architecture, data flow, and ERD.

- `docs/claude-flow-ticket-lifecycle.md`
  Deep, step-by-step ticket lifecycle with sequences and state transitions.

- `docs/uqw-multi-environment.md`
  Cross-environment explanation of hooks/plugins/enforcement.

- `docs/flows/ralph-workflow.md`
  Ralph autonomous loop and state machine.

- `docs/flows/code-review-pipeline.md`
  Review agent pipeline and review marker flow.

- `docs/flows/kanban-workflow.md`
  Broader ticket and board workflow visuals.

## Diagram 1: The Big Picture

This is the simplest architecture view.

```mermaid
flowchart TB
    subgraph Providers["AI Providers / Environments"]
        CC["Claude Code"]
        CUR["Cursor Editor"]
        CA["Cursor Agent CLI"]
        VS["VS Code / Copilot Chat"]
        CP["Copilot CLI"]
        CX["Codex"]
        OC["OpenCode"]
    end

    subgraph ProviderLayer["Provider-Specific Guidance / Enforcement"]
        PROMPTS["Prompts / Context Files / Agents / Skills"]
        HOOKS["Hooks"]
        PLUGINS["Plugins"]
        RULES["Rules / Instructions"]
    end

    subgraph SharedEngine["Brain Dump Shared Workflow Engine"]
        MCP["MCP Server\nworkflow / session / comment / review"]
        CORE["Core Logic\nstartWork / completeWork / generateDemo / session state"]
        STATE[".claude/ralph-state.json"]
    end

    subgraph Persistence["Persistence / Audit Trail"]
        DB["SQLite DB\ntickets, comments, findings, demos, sessions"]
        GIT["Git / PR State"]
    end

    CC --> PROMPTS
    CUR --> PROMPTS
    CA --> PROMPTS
    VS --> RULES
    CP --> PROMPTS
    CX --> PROMPTS
    OC --> PROMPTS

    CC --> HOOKS
    CUR --> HOOKS
    CA --> HOOKS
    CP --> HOOKS
    OC --> PLUGINS

    PROMPTS --> MCP
    RULES --> MCP
    HOOKS -. reads .-> STATE
    PLUGINS -. reads .-> STATE

    MCP --> CORE
    CORE --> DB
    CORE --> GIT
    CORE --> STATE
```

## Diagram 2: Universal Ticket State Machine

This is the shared lifecycle regardless of provider.

```mermaid
stateDiagram-v2
    [*] --> backlog
    backlog --> ready: user prepares ticket
    ready --> in_progress: workflow.start-work
    in_progress --> ai_review: workflow.complete-work
    ai_review --> ai_review: findings submitted / fixed / rechecked
    ai_review --> human_review: review.generate-demo
    human_review --> human_review: human rejects / requests changes
    human_review --> done: review.submit-feedback passed=true
    done --> [*]

    note right of in_progress
        Branch exists
        Session active
        Test report required
    end note

    note right of ai_review
        submit-finding
        mark-fixed
        check-complete
    end note

    note right of human_review
        Demo exists
        AI must stop here
        Human decides done
    end note
```

## Diagram 3: Who Actually Moves The Ticket?

This is the best “explain it to people” diagram.

```mermaid
flowchart LR
    A["LLM decides next action"] --> B["Calls Brain Dump MCP tool"]
    B --> C["MCP tool validates request"]
    C --> D["Core function mutates real state"]
    D --> E["DB updates ticket / session / comments / findings"]
    D --> F["Git branch / PR metadata updates"]
    D --> G["State file updated for enforcement"]

    H["Hooks or plugins"] -. do not own workflow .-> B
    H -. enforce timing / safety .-> G
    I["Prompts / skills / context"] -. tell the LLM what to call .-> A

    style B fill:#1e293b,stroke:#a855f7,color:#fff
    style D fill:#1e293b,stroke:#22c55e,color:#fff
    style E fill:#1e293b,stroke:#3b82f6,color:#fff
```

## Diagram 4: Two Start Paths

This shows the important nuance that some launch modes bootstrap start-work server-side before the LLM begins.

```mermaid
sequenceDiagram
    participant User
    participant UI as Brain Dump UI
    participant Launch as Launch Orchestrator
    participant Core as Core Workflow
    participant Provider as Provider Runtime
    participant LLM as LLM Session

    alt UI-launched provider session
        User->>UI: Click "Start with <Provider>"
        UI->>Launch: launchRalphForTicket / launchInProvider
        Launch->>Core: startWork(...)
        Core-->>Launch: branch + in_progress + initial comment
        Launch->>Provider: Open provider with context/prompt
        Provider->>LLM: Start LLM with workflow context
        LLM->>Core: session.create
    else LLM starts directly inside provider
        User->>Provider: Ask LLM to work ticket
        Provider->>LLM: prompt/instructions loaded
        LLM->>Core: workflow.start-work
        Core-->>LLM: branch + in_progress + initial comment
        LLM->>Core: session.create
    end
```

## Diagram 5: Full Generic Ticket Journey

This is the end-to-end diagram that works for every provider.

```mermaid
sequenceDiagram
    participant Human
    participant LLM
    participant MCP as Brain Dump MCP
    participant Core as Core Logic
    participant DB as DB / Comments / Findings

    Human->>LLM: Work on ticket
    LLM->>MCP: workflow.start-work
    MCP->>Core: startWork()
    Core->>DB: ticket -> in_progress
    Core->>DB: add starting progress comment

    LLM->>MCP: session.create
    MCP->>Core: createSession()
    Core->>DB: create Ralph session
    Core->>DB: write ralph-state.json

    LLM->>MCP: session.update-state(analyzing)
    LLM->>MCP: session.update-state(implementing)
    LLM->>MCP: comment.add(test_report)

    LLM->>MCP: workflow.complete-work
    MCP->>Core: completeWork()
    Core->>DB: ticket -> ai_review
    Core->>DB: add work summary comment

    loop Review loop
        LLM->>MCP: review.submit-finding
        MCP->>Core: submitFinding()
        Core->>DB: store finding + audit comment
        LLM->>MCP: review.mark-fixed
        MCP->>Core: markFixed()
        Core->>DB: finding updated + audit comment
        LLM->>MCP: review.check-complete
        MCP->>Core: checkComplete()
    end

    LLM->>MCP: review.generate-demo
    MCP->>Core: generateDemo()
    Core->>DB: ticket -> human_review
    Core->>DB: add demo-generated comment

    LLM->>MCP: session.complete
    MCP->>Core: completeSession()

    Human->>MCP: review.submit-feedback(passed=true)
    MCP->>Core: submitFeedback()
    Core->>DB: ticket -> done
```

## Diagram 6: Provider Variations At A Glance

This one is useful when you want to compare providers side-by-side.

```mermaid
flowchart TB
    subgraph Claude["Claude Code"]
        C1["Prompt + skills"] --> C2["Hooks"] --> C3["MCP"]
    end

    subgraph Cursor["Cursor Editor"]
        U1["Context file + subagents"] --> U2["Hooks"] --> U3["MCP"]
    end

    subgraph CursorAgent["Cursor Agent CLI"]
        A1["Headless prompt"] --> A2["Optional/shared hook model"] --> A3["MCP"]
    end

    subgraph VSCode["VS Code / Copilot Chat"]
        V1["copilot-instructions + agents + prompts"] --> V2["MCP"]
    end

    subgraph CopilotCLI["Copilot CLI"]
        P1["Prompt + agents + skills"] --> P2["Global hook"] --> P3["MCP"]
    end

    subgraph Codex["Codex"]
        X1["Context prompt + MCP config"] --> X2["MCP"]
    end

    subgraph OpenCode["OpenCode"]
        O1["Agent docs + AGENTS + prompt"] --> O2["Plugins"] --> O3["MCP"]
    end

    C3 --> S["Shared Brain Dump workflow engine"]
    U3 --> S
    A3 --> S
    V2 --> S
    P3 --> S
    X2 --> S
    O3 --> S
```

## Diagram 7: State Enforcement Model

This zooms in on the write-blocking behavior.

```mermaid
flowchart LR
    S1["session.create / session.update-state"] --> S2["core/session.ts writes .claude/ralph-state.json"]

    S2 --> H1["Claude hook"]
    S2 --> H2["Cursor hook"]
    S2 --> H3["Copilot CLI hook"]
    S2 --> P1["OpenCode plugin"]

    H1 --> D{"Trying to Write/Edit?"}
    H2 --> D
    H3 --> D
    P1 --> D

    D -->|Valid state| ALLOW["Allow write"]
    D -->|Invalid state| BLOCK["Block / error with exact session.update-state guidance"]

    VS["VS Code"] -. no hook blocker .-> ALLOW
    CX["Codex"] -. no hook blocker .-> ALLOW
```

## Diagram 8: Review And Demo Gate Loop

This is the most important “quality” diagram.

```mermaid
flowchart TB
    A["workflow.complete-work"] --> B["Ticket enters ai_review"]
    B --> C["review.submit-finding"]
    C --> D{"Any open critical/major findings?"}

    D -->|Yes| E["Fix code"]
    E --> F["review.mark-fixed"]
    F --> G["review.check-complete"]
    G --> D

    D -->|No| H["review.generate-demo"]
    H --> I["Ticket enters human_review"]
    I --> J["Human runs demo steps"]
    J --> K{"Human approves?"}
    K -->|Yes| L["review.submit-feedback passed=true"]
    L --> M["Ticket enters done"]
    K -->|No| N["review.submit-feedback passed=false"]
    N --> I

    style B fill:#1e293b,stroke:#f59e0b,color:#fff
    style I fill:#1e293b,stroke:#3b82f6,color:#fff
    style M fill:#1e293b,stroke:#22c55e,color:#fff
```

## Diagram 9: Who Creates Which Comment?

This is a good “audit trail” diagram.

```mermaid
flowchart TB
    A["workflow.start-work"] --> B["core/startWork()"] --> C["Progress comment:\nStarted work on ticket"]

    D["LLM runs validation"] --> E["comment.add commentType=test_report"] --> F["Test report comment"]

    G["workflow.complete-work"] --> H["core/completeWork()"] --> I["Work summary comment"]

    J["review.submit-finding"] --> K["review tool"] --> L["Finding audit comment"]
    M["review.mark-fixed"] --> N["review tool"] --> O["Fix audit comment"]
    P["review.generate-demo"] --> Q["review tool"] --> R["Demo generated comment"]
```

## Diagram 10: Where Provider Identity Comes From

This helps explain how Brain Dump knows whether a comment should look like `claude`, `copilot`, `codex`, `cursor-agent`, and so on.

```mermaid
flowchart LR
    A["Provider launch / MCP config"] --> B["Environment vars or runtime patterns"]
    B --> C["mcp-server/lib/environment.ts detectEnvironment()"]
    C --> D["detectAuthor()"]
    D --> E["comment.add author auto-detected"]

    F["Examples"] --> G["COPILOT_CLI=1 -> copilot"]
    F --> H["OPENCODE=1 -> opencode"]
    F --> I["CURSOR_AGENT=1 -> cursor-agent"]
    F --> J["Claude runtime vars -> claude"]
    F --> K["VS Code runtime vars -> vscode"]
```

## Diagram 11: High-Level Provider Buckets

This is the simplest mental model.

```mermaid
flowchart LR
    subgraph HookDriven["Hook-Driven"]
        A["Claude Code"]
        B["Cursor Editor"]
        C["Copilot CLI"]
    end

    subgraph PluginDriven["Plugin-Driven"]
        D["OpenCode"]
    end

    subgraph PromptDriven["Prompt / Instruction Driven"]
        E["VS Code / Copilot Chat"]
        F["Codex"]
        G["Cursor Agent CLI"]
    end

    HookDriven --> H["Same MCP workflow engine"]
    PluginDriven --> H
    PromptDriven --> H
```

## Diagram 12: Zoomed-In Start Work Internals

This is the “what really happens when start-work runs” close-up.

```mermaid
sequenceDiagram
    participant LLM
    participant MCP as workflow tool
    participant Core as core/workflow.ts startWork
    participant Git
    participant DB
    participant Comments

    LLM->>MCP: workflow.start-work(ticketId)
    MCP->>Core: startWork(db, ticketId, git)
    Core->>DB: load ticket + project
    Core->>Git: verify repo
    Core->>Git: create or checkout branch
    Core->>DB: ticket.status = in_progress
    Core->>DB: initialize/reset ticket_workflow_state
    Core->>Comments: add "Started work on ticket" comment
    Core-->>MCP: branch + warnings + ticket context
    MCP-->>LLM: full context response
```

## Diagram 13: Zoomed-In Complete Work Internals

This is the close-up for the handoff into AI review.

```mermaid
sequenceDiagram
    participant LLM
    participant MCP as workflow tool
    participant Core as core/workflow.ts completeWork
    participant DB
    participant Comments

    LLM->>MCP: workflow.complete-work(ticketId, summary)
    MCP->>Core: completeWork(...)
    Core->>DB: load ticket
    Core->>DB: verify fresh test_report exists
    Core->>DB: ticket.status = ai_review
    Core->>DB: workflow phase = ai_review
    Core->>Comments: add work summary comment
    Core-->>MCP: next review steps
    MCP-->>LLM: now in ai_review
```

## Diagram 14: Human-Friendly Summary

If you only show one “storyboard” to someone, use this one.

```mermaid
flowchart LR
    A["Provider opens with context"] --> B["LLM calls start-work"]
    B --> C["Brain Dump creates branch + in_progress + start comment"]
    C --> D["LLM creates session and writes code"]
    D --> E["LLM adds test_report comment"]
    E --> F["LLM calls complete-work"]
    F --> G["Brain Dump moves ticket to ai_review"]
    G --> H["LLM submits/fixes findings"]
    H --> I["LLM generates demo"]
    I --> J["Brain Dump moves ticket to human_review"]
    J --> K["Human approves"]
    K --> L["Ticket becomes done"]
```

## Best Pages To Open Next

If you want more depth after this file, open these in order:

1. `docs/universal-quality-workflow-per-provider.md`
2. `docs/claude-flow-ticket-lifecycle.md`
3. `docs/uqw-multi-environment.md`
4. `docs/architecture.md`
5. `docs/flows/code-review-pipeline.md`
