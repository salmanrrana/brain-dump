# Code Review Pipeline

> **Three specialized AI reviewers catching what you missed, before you push.**

Never ship code without a second opinion. Brain Dump runs three review agents in parallel—each looking for different issues—so bugs, security holes, and code smells get caught early.

---

## TL;DR — Quick Reference

| Action                      | How                                               |
| --------------------------- | ------------------------------------------------- |
| Run review manually         | `/review` command                                 |
| Check review status         | `ls -la .claude/.review-completed`                |
| Review marker valid for     | 30 minutes (push) or 5 minutes (conversation end) |
| Skip review (minor changes) | Automatic if ≤2 files, <50 lines changed          |

**Three agents run in parallel:**

- **Code Reviewer** — Style, security, logic errors
- **Silent Failure Hunter** — Empty catches, missing error handling
- **Code Simplifier** — Redundancy, complexity, naming

---

## See the Pipeline in Action

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  You: "I finished the login feature, ready to push"                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  Claude: Running /review to check your changes...                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────┐                   │
│  │  PARALLEL REVIEW IN PROGRESS                        │                   │
│  ├─────────────────────────────────────────────────────┤                   │
│  │  🔍 Code Reviewer................ analyzing         │                   │
│  │  🐛 Silent Failure Hunter........ analyzing         │                   │
│  │  ✨ Code Simplifier.............. analyzing         │                   │
│  └─────────────────────────────────────────────────────┘                   │
│                                                                             │
│  [30 seconds later]                                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────┐                   │
│  │  ✅ Code Reviewer: Complete (2 issues)              │                   │
│  │  ✅ Silent Failure Hunter: Complete (1 issue)       │                   │
│  │  ✅ Code Simplifier: Complete (0 suggestions)       │                   │
│  └─────────────────────────────────────────────────────┘                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ## Review Summary                                                          │
│                                                                             │
│  ### 🔴 Critical (1)                                                        │
│  - `src/api/auth.ts:67` — Password comparison vulnerable to timing attack   │
│    Use crypto.timingSafeEqual() instead of ===                             │
│                                                                             │
│  ### 🟡 Important (2)                                                       │
│  - `src/api/auth.ts:45` — Catch block logs error but doesn't return        │
│    error response to client                                                │
│  - `src/components/LoginForm.tsx:89` — Missing loading state during        │
│    authentication request                                                  │
│                                                                             │
│  Review complete. Fix critical issues before pushing?                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Pipeline Architecture

```mermaid
flowchart TB
    A["📝 Code changes detected"] --> B["/review command"]

    B --> C["Launch 3 agents<br/>in parallel"]

    subgraph Agents["⚡ Parallel Review (~30 seconds)"]
        D["🔍 Code Reviewer<br/>──────────────<br/>• Style & conventions<br/>• Security issues<br/>• Logic errors"]
        E["🐛 Silent Failure Hunter<br/>──────────────<br/>• Empty catch blocks<br/>• Missing error states<br/>• Fire-and-forget async"]
        F["✨ Code Simplifier<br/>──────────────<br/>• Redundant code<br/>• Complex conditionals<br/>• Naming clarity"]
    end

    C --> D
    C --> E
    C --> F

    D --> G["Consolidate findings"]
    E --> G
    F --> G

    G --> H["Present summary:<br/>🔴 Critical → 🟡 Important → 💡 Suggestions"]
    H --> I["Touch .review-completed"]

    style D fill:#6366f1,color:#fff
    style E fill:#ec4899,color:#fff
    style F fill:#f59e0b,color:#000
```

---

## The Three Agents

### 🔍 Code Reviewer

**Focus:** Does the code follow project conventions and best practices?

```mermaid
flowchart LR
    A["Code Reviewer"] --> B["Read CLAUDE.md"]
    B --> C["Analyze changes"]
    C --> D["Check against<br/>DO/DON'T rules"]
    D --> E["Report issues"]

    style A fill:#6366f1,color:#fff
```

**What it catches:**

- Style inconsistencies (naming, formatting)
- Security vulnerabilities (injection, XSS, OWASP top 10)
- Logic errors (edge cases, race conditions)
- Error handling gaps (async operations, error reporting)
- Comment quality (should explain "why" not "what")

---

### 🐛 Silent Failure Hunter

**Focus:** Are errors being handled properly or silently swallowed?

```mermaid
flowchart LR
    A["Silent Failure Hunter"] --> B["Scan for try/catch"]
    B --> C["Find async operations"]
    C --> D["Check error flows"]
    D --> E["Report silent failures"]

    style A fill:#ec4899,color:#fff
```

**Severity Levels:**

| Level           | Pattern                  | Example                              |
| --------------- | ------------------------ | ------------------------------------ |
| 🔴 **CRITICAL** | Empty catch blocks       | `catch (e) {}`                       |
| 🔴 **CRITICAL** | Fire-and-forget async    | `fetch(url)` without `.catch()`      |
| 🟡 **HIGH**     | console.log only         | `catch (e) { console.log(e) }`       |
| 🟡 **HIGH**     | Overly broad catches     | `catch (Error e)` catches everything |
| 🟠 **MEDIUM**   | Missing UI error state   | No error display to user             |
| ⚪ **LOW**      | Fallback hiding failures | Default values masking issues        |

---

### ✨ Code Simplifier

**Focus:** Can the code be clearer and more maintainable?

```mermaid
flowchart LR
    A["Code Simplifier"] --> B["Analyze complexity"]
    B --> C["Find redundancy"]
    C --> D["Check naming"]
    D --> E["Suggest improvements"]

    style A fill:#f59e0b,color:#000
```

**What it looks for:**

- Nested ternaries (prefer switch/if-else)
- Duplicate code patterns
- Unclear variable names
- Over-engineered abstractions
- Dead code and unused imports

**Key rule:** Never changes functionality, only clarity.

---

## Hook Enforcement

Brain Dump uses hooks to enforce review before push. You can't accidentally skip review.

### How It Works

```mermaid
sequenceDiagram
    participant Dev as You
    participant Claude
    participant Hook as PreToolUse Hook
    participant Review as /review

    Dev->>Claude: "Push my changes"
    Claude->>Hook: Bash(git push)
    Hook->>Hook: Check .review-completed
    Hook-->>Claude: 🚫 BLOCKED: Review required

    Note over Claude: Reads block message

    Claude->>Review: /review
    Review->>Review: Run 3 agents in parallel
    Review-->>Claude: Findings summary
    Review->>Review: Touch .review-completed ✅

    Claude->>Hook: Bash(git push)
    Hook->>Hook: Check .review-completed ✓
    Hook-->>Claude: ✅ ALLOWED
    Claude->>Dev: Pushed successfully
```

### Two Types of Review Checks

| Hook                | When It Runs                       | Marker Age Limit | Purpose                 |
| ------------------- | ---------------------------------- | ---------------- | ----------------------- |
| **Stop Hook**       | Conversation ending                | 5 minutes        | Remind before you leave |
| **PreToolUse Hook** | Before `git push` / `gh pr create` | 30 minutes       | Block unreviewed pushes |

**Why different timeouts?**

- **5 minutes for conversation end:** You might have made changes after review
- **30 minutes for push:** Gives you time to fix issues before pushing

---

## Review Marker

The `.claude/.review-completed` file tracks when review was done:

```mermaid
flowchart LR
    A["/review completes"] --> B["touch .review-completed"]
    B --> C["Timestamp recorded"]
    C --> D["Valid for 30 minutes"]
    D --> E["Allows git push ✅"]

    style B fill:#22c55e,color:#fff
```

**Why it expires:**

- Prevents pushing old, unreviewed code
- Encourages re-review after more changes
- Balances convenience and safety

---

## Configuration

### auto-review.config.json

```json
{
  "enabled": true,
  "agents": {
    "code-reviewer": { "enabled": true },
    "silent-failure-hunter": { "enabled": true },
    "code-simplifier": { "enabled": true }
  },
  "triggerOn": {
    "sourceCodeChanges": true,
    "testFileChanges": true,
    "configChanges": false,
    "documentationChanges": false
  },
  "filePatterns": {
    "include": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    "exclude": ["**/node_modules/**", "**/dist/**", "**/*.d.ts"]
  }
}
```

### Skip Conditions

Review is **automatically skipped** for:

- Documentation only (`.md` files)
- Config files (`package.json`, `tsconfig.json`)
- Generated files (`*.d.ts`, `dist/`)
- Minor changes (≤2 files, <50 lines)

---

## Integration with Tickets

Review agents can post findings to your tickets:

```mermaid
flowchart LR
    A["Code Reviewer"] --> B["add_ticket_comment"]
    B --> C["Post findings<br/>to ticket"]
    C --> D["Visible in<br/>Brain Dump UI"]

    style D fill:#6366f1,color:#fff
```

**Example ticket comment:**

```markdown
## Code Review Summary

### 🔴 Critical Issues (1)

- `src/api/auth.ts:45` - SQL injection vulnerability

### 🟡 Important (2)

- `src/components/Form.tsx:23` - Missing error boundary
- `src/lib/utils.ts:89` - Async operation without error handling

### 💡 Suggestions (1)

- Consider extracting validation logic to separate function
```

---

## Agent Handoffs

Agents can hand off to each other for a complete workflow:

```mermaid
flowchart LR
    A["Code Reviewer<br/>finds issue"] --> B{"Needs<br/>fix?"}
    B -->|"Fix it"| C["→ ticket-worker"]
    B -->|"Cleanup"| D["→ code-simplifier"]

    E["Silent Failure Hunter<br/>finds issue"] --> F["→ ticket-worker"]

    G["Code Simplifier<br/>makes changes"] --> H["→ code-reviewer<br/>to verify"]

    style C fill:#22c55e,color:#fff
    style D fill:#f59e0b,color:#000
    style F fill:#22c55e,color:#fff
    style H fill:#6366f1,color:#fff
```

---

## Troubleshooting

### Review keeps blocking push

**Cause:** Review marker expired or was never created

**Fix:**

```bash
# Check if marker exists and its age
ls -la .claude/.review-completed

# Run review again
# (In Claude conversation)
/review
```

### One agent keeps failing

**Cause:** Usually a configuration or permissions issue

**Fix:**

1. Check the agent is enabled in `auto-review.config.json`
2. Try running `/review` with verbose output
3. Check Claude Code logs for errors

### Review takes too long

**Cause:** Large number of changed files

**Fix:**

- Review runs on changed files only
- Break up large PRs into smaller chunks
- Consider reviewing incrementally as you work

### False positives

**Cause:** Agent doesn't understand your codebase context

**Fix:**

- Add exceptions to your CLAUDE.md
- Use `// review-ignore: reason` comments for known issues
- Configure exclusion patterns in `auto-review.config.json`

---

## Extended Review Pipeline

After the initial pr-review-toolkit agents complete, an **extended review pipeline** provides deeper analysis with specialized agents.

### Extended Review Agents

| Agent                       | Focus                                  | When It Runs        |
| --------------------------- | -------------------------------------- | ------------------- |
| context7-library-compliance | Verifies library usage against docs    | Always              |
| react-best-practices        | React/Next.js patterns and performance | If .tsx/.jsx files  |
| cruft-detector              | Unnecessary code and shallow tests     | Always              |
| senior-engineer             | Synthesizes all findings (runs last)   | After others finish |

### How to Trigger Extended Review

**Automatic (Claude Code):**

After `/review` completes, the `chain-extended-review.sh` hook automatically triggers extended review.

**Manual:**

```
/extended-review
```

### Extended Review Flow

```mermaid
flowchart TB
    A["/review completes"] --> B["SubagentStop hook fires"]
    B --> C["chain-extended-review.sh"]
    C --> D["Triggers /extended-review"]

    subgraph Phase1["⚡ Phase 1 - Parallel"]
        E["🔍 context7-library-compliance"]
        F["⚛️ react-best-practices"]
        G["🧹 cruft-detector"]
    end

    D --> E
    D --> F
    D --> G

    E --> H["Phase 1 Complete"]
    F --> H
    G --> H

    subgraph Phase2["📊 Phase 2 - Synthesis"]
        I["👨‍💼 senior-engineer"]
    end

    H --> I
    I --> J["Final Report"]

    style E fill:#6366f1,color:#fff
    style F fill:#ec4899,color:#fff
    style G fill:#f59e0b,color:#000
    style I fill:#22c55e,color:#fff
```

### What Each Extended Agent Does

**context7-library-compliance:**

- Queries Context7 for up-to-date documentation
- Compares code patterns against official best practices
- Flags deprecated APIs and anti-patterns

**react-best-practices:**

- Server vs Client Component usage
- Hooks rules and anti-patterns
- Performance optimizations (memoization, code splitting)
- Accessibility compliance

**cruft-detector:**

- Comments that describe "what" instead of "why"
- Dead/commented-out code
- Shallow tests that don't test real behavior
- Over-engineered abstractions

**senior-engineer:**

- Synthesizes all findings from previous agents
- Applies priority matrix (P0-P3)
- Provides final APPROVE / APPROVE WITH FIXES / REQUEST CHANGES recommendation

---

## Ready to Try the Review Pipeline?

1. **Make some code changes** — Edit a few source files
2. **Run `/review`** — Watch the three agents work in parallel
3. **Extended review runs automatically** — Four more specialized agents analyze your code
4. **Review the findings** — Critical issues first
5. **Fix and retry** — Review again to confirm fixes
6. **Push with confidence** — You've earned it

**Pro tip:** Run `/review` frequently as you work, not just before pushing. Catching issues early is easier than fixing them later.

---

## Related Documentation

- [Ralph Workflow](./ralph-workflow.md) — Autonomous agent with built-in review
- [CLAUDE.md](../../CLAUDE.md) — Project conventions the reviewer checks
- [Auto Review Hook](../auto-review-hook.md) — Detailed hook documentation
- [Main README](../../README.md) — Quick start
