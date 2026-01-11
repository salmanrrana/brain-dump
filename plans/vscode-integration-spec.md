# VS Code Integration Specification

## Epic: Working with VS Code
**Epic ID:** d7af1fab-599a-46f6-a4b1-bc15a29cfb3f
**Created:** 2026-01-11
**Branch:** feature/vscode-integration

## Overview

Enable Brain Dumpy to work seamlessly with VS Code through MCP server compatibility and custom agents. Users should be able to use all Brain Dumpy features from VS Code's AI chat window without needing a separate extension UI.

## User Requirements (from Inception Interview)

### Approach
- **MCP Server Only** - Make existing MCP server work with VS Code's AI chat window
- **Agent Compatibility** - Ensure Brain Dumpy agents work seamlessly within VS Code environment
- **No Extension UI** - Chat-only interaction, no sidebar panels or status bar

### Features Required
- Complete Brain Dumpy functionality through MCP server
- VS Code-specific agent variants with settings to choose working method
- Ralph agent must work in both Claude Code and VS Code environments
- All workflows: ticket-to-code, code-to-ticket, agent-driven development
- Native MCP support + maximum compatibility with VS Code AI extensions

## Technical Context

### VS Code MCP Server Configuration
```json
// .vscode/mcp.json
{
  "servers": {
    "brain-dumpy": {
      "type": "stdio",
      "command": "node",
      "args": ["path/to/brain-dumpy/mcp-server"]
    }
  }
}
```

### VS Code Custom Agents
Located in `.github/agents/` with YAML frontmatter:
```markdown
---
description: "Agent description"
tools:
  - tool-name
model: gpt-4
handoffs:
  - other-agent: "Handoff description"
---

# Agent Instructions
...
```

### VS Code Agent Skills
Located in `.github/skills/skill-name/SKILL.md`:
- Portable across VS Code, GitHub Copilot CLI, and Copilot coding agent
- Progressive disclosure: metadata first, full instructions on match

### VS Code Prompt Files
Located in `.github/prompts/*.prompt.md`:
- Reusable prompts with variables
- Triggered with `/prompt-name` in chat

## Implementation Phases

### Phase 1: Core Foundation (High Priority)
1. MCP Server VS Code Compatibility
2. Environment Detection System
3. Working Method Settings

### Phase 2: Agent Support (High Priority)
4. VS Code Custom Agent Files
5. Ralph Cross-Environment Support

### Phase 3: Workflows (Mixed Priority)
6. Project Auto-Detection in VS Code
7. Ticket-to-Code Workflow
8. Code-to-Ticket Workflow
9. Agent-Driven Development Workflow

### Phase 4: Polish (Lower Priority)
10. Multi-Extension MCP Support
11. File/Folder Context Linking
12. VS Code Setup Documentation

## Ticket Breakdown Analysis

### Well-Sized Tickets (1-4 hours each)
- MCP Server VS Code Compatibility - Testing/config work
- Multi-Extension MCP Support - Testing task
- Working Method Settings - Settings schema + UI
- Project Auto-Detection - Uses existing `find_project_by_path`
- Code-to-Ticket Workflow - Single MCP tool + logic
- Agent-Driven Development Workflow - Configuration work

### Potentially Large Tickets (may need splitting)

#### VS Code Custom Agent Files
Contains 4 separate agents. Consider splitting into:
- `breakdown.agent.md` creation
- `inception.agent.md` creation
- `ralph.agent.md` creation
- `simplify.agent.md` creation

#### Ticket-to-Code Workflow
Contains 3 new MCP tools. Consider splitting into:
- `start_ticket_work` MCP tool
- `link_commit_to_ticket` MCP tool
- `complete_ticket_work` MCP tool

#### File/Folder Context Linking
Contains 2-3 MCP tools. Consider splitting into:
- `link_files_to_ticket` MCP tool
- `get_tickets_for_file` MCP tool
- Auto-linking on commit feature

#### VS Code Setup Documentation
Large documentation scope. Consider splitting into:
- Quick Start guide
- Workflow guides
- Troubleshooting guide

## Dependencies

```
MCP Server Compatibility
         |
         v
Environment Detection <---> Working Method Settings
         |
         v
   Custom Agent Files
         |
         v
Ralph Cross-Environment Support
         |
         v
    Ticket-to-Code Workflow
         |
         v
    Code-to-Ticket Workflow
         |
         v
Agent-Driven Development Workflow
```

## Acceptance Criteria (Epic Level)

- [ ] Brain Dumpy MCP server works in VS Code
- [ ] All Brain Dumpy agents available in VS Code chat dropdown
- [ ] Ralph agent works identically in Claude Code and VS Code
- [ ] Users can configure "VS Code" or "Claude Code" working method
- [ ] Ticket-to-code workflow creates branches and links commits
- [ ] Documentation covers complete setup process

## Resources

- [VS Code MCP Servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [VS Code Custom Agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [VS Code Agent Skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [VS Code Prompt Files](https://code.visualstudio.com/docs/copilot/customization/prompt-files)
- [VS Code Copilot Agents Overview](https://code.visualstudio.com/docs/copilot/agents/overview)
