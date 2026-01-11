# VS Code Integration Specification

## Overview

Enable Brain Dumpy to work seamlessly in BOTH Claude Code AND VS Code through MCP server compatibility and cross-environment agents. Each ticket should be worked on with fresh context for best results.

## Core Principle: Fresh Context Per Ticket

Each ticket is designed to be completed in a single focused session. When a ticket is done:
1. AI signals context reset
2. User starts fresh conversation for next ticket
3. No accumulated assumptions or stale context

## Epics

### 1. MCP Server Enhancements
**Epic ID:** 9d3f47a0-e707-418d-bc68-e2c0ff4ef310
**Color:** #10b981 (green)

New MCP tools and server improvements for both Claude Code and VS Code.

| Ticket | Priority | Description |
|--------|----------|-------------|
| Verify MCP server works with Claude Code | High | Baseline testing |
| Test MCP server with VS Code native MCP | High | VS Code compatibility |
| Create .vscode/mcp.json template | High | Config file |
| Create start_ticket_work MCP tool | High | Branch + status |
| Create complete_ticket_work MCP tool | High | Finish + reset signal |
| Create link_commit_to_ticket MCP tool | Medium | Git integration |
| Create link_files_to_ticket MCP tool | Medium | File associations |
| Create get_tickets_for_file MCP tool | Low | Context lookup |

### 2. Cross-Environment Support
**Epic ID:** d12f58d0-9c98-462a-b4f2-38dc4753442b
**Color:** #8b5cf6 (purple)

Environment detection, settings, and cross-platform behavior.

| Ticket | Priority | Description |
|--------|----------|-------------|
| Create environment detection utility | High | Detect Claude vs VS Code |
| Create get_environment MCP tool | High | Expose detection via MCP |
| Add context reset signal on ticket completion | High | Fresh eyes workflow |
| Add working_method field to project schema | Medium | Database change |
| Create get_project_settings MCP tool | Medium | Read settings |
| Create update_project_settings MCP tool | Medium | Write settings |
| Add working method UI to project settings | Low | UI for settings |

### 3. VS Code Configuration
**Epic ID:** 416ac1a8-3777-45fa-8a48-9d1a6ecee04e
**Color:** #0ea5e9 (blue)

VS Code-specific config files, agents, and documentation.

| Ticket | Priority | Description |
|--------|----------|-------------|
| Create breakdown.agent.md for VS Code | High | Agent file |
| Create inception.agent.md for VS Code | High | Agent file |
| Create ralph.agent.md for VS Code | High | Agent file |
| Create simplify.agent.md for VS Code | Medium | Agent file |
| Configure agent handoffs in VS Code agents | Medium | Workflow transitions |
| Test VS Code agents with GitHub Copilot | Medium | Compatibility |
| Test VS Code agents with Continue extension | Low | Compatibility |
| Write Quick Start guide for VS Code | Medium | Documentation |
| Write troubleshooting guide for VS Code | Low | Documentation |

### 4. Development Workflows
**Epic ID:** 0f9806ca-7994-4556-a67e-fd3ff1aa92ca
**Color:** #f59e0b (amber)

End-to-end workflow definitions and tools.

| Ticket | Priority | Description |
|--------|----------|-------------|
| Define ticket-to-code workflow spec | High | Workflow doc |
| Define code-to-ticket workflow spec | Medium | Workflow doc |
| Create create_ticket_from_context MCP tool | Medium | Code → ticket |
| Define agent-driven development workflow spec | Medium | Full workflow doc |

## Implementation Order

### Phase 1: Foundation (Start Here)
1. Verify MCP server works with Claude Code
2. Test MCP server with VS Code native MCP
3. Create environment detection utility
4. Create .vscode/mcp.json template

### Phase 2: Core MCP Tools
5. Create get_environment MCP tool
6. Create start_ticket_work MCP tool
7. Create complete_ticket_work MCP tool
8. Add context reset signal on ticket completion

### Phase 3: VS Code Agents
9. Create breakdown.agent.md
10. Create inception.agent.md
11. Create ralph.agent.md
12. Create simplify.agent.md
13. Configure agent handoffs

### Phase 4: Settings & Workflows
14. Add working_method field to project schema
15. Create settings MCP tools
16. Define workflow specs
17. Create create_ticket_from_context MCP tool

### Phase 5: Polish & Testing
18. Test agents with Copilot/Continue
19. Write Quick Start guide
20. Write troubleshooting guide
21. Add working method UI

## Ticket Guidelines

Each ticket should be:
- **Atomic**: Single focused change
- **Independent**: Minimal dependencies on other tickets
- **Testable**: Clear acceptance criteria
- **Documented**: What file(s) to modify

## Context Reset Workflow

```
┌─────────────────┐
│ Pick Ticket     │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ start_ticket_   │
│ work (branch,   │
│ status=in_prog) │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ AI implements   │
│ (fresh context) │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ complete_ticket_│
│ work (review,   │
│ clearContext)   │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ USER: Clear     │
│ context / new   │
│ conversation    │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Pick next       │
│ ticket (fresh!) │
└─────────────────┘
```

## Resources

- [VS Code MCP Servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [VS Code Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [VS Code Agent Skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
