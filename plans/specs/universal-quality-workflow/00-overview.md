# Universal Quality Workflow Spec

> **Epic**: Universal Quality Workflow
> **Author**: Claude
> **Status**: Draft
> **Inspiration**: Dillon Mulroy's tracer workflow (@dillon_mulroy)

---

## 1. Overview

**What is this?**

Brain Dump's core value proposition is quality code regardless of which tool or environment you use. Whether you're working interactively in VS Code, using Cursor, running Ralph autonomously, or coding with Claude Code - the same quality workflow should be enforced.

This spec defines:

1. A universal ticket workflow with clear quality gates
2. MCP tools that enforce the workflow in ANY environment
3. Status cleanup (removing legacy `review` column)
4. Skills for each workflow step (portable across environments)

- **Problem being solved**: Quality varies based on tool/environment. Ralph produces different quality than interactive Claude Code. No consistent review → fix → demo → feedback loop.
- **User value delivered**: Guaranteed quality regardless of how you work. "Ship with confidence" because the workflow caught issues.
- **How it fits into the system**: MCP server becomes the workflow engine. All clients (Claude Code, VS Code, Cursor, Ralph) use the same tools and get the same enforcement.

### Key Insight

> **"Quality is enforced by tooling, not by hoping people follow instructions."**
>
> — The workflow engine (MCP) prevents bad patterns. You literally cannot skip steps because the tools won't let you.

---
