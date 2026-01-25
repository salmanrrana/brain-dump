## 5. Design Decisions

### Why Remove the `review` Status?

1. **Ambiguity**: "Review" could mean AI review, human review, or both
2. **Workflow Clarity**: Two distinct phases (AI then Human) need distinct statuses
3. **Automation**: MCP tools need to know exactly where in the workflow a ticket is
4. **Migration**: Existing `review` tickets → `ai_review` (conservative choice)

### Why MCP as the Workflow Engine?

1. **Universal**: Works in Claude Code, VS Code, Cursor, OpenCode, Ralph
2. **Structured**: Returns JSON, not text to parse
3. **Stateful**: Tracks workflow state in database
4. **Blocking**: Can prevent bad transitions with clear error messages

### Why Skills Instead of Hard-Coded Prompts?

1. **Portable**: Skills work in any environment that supports prompts
2. **Updatable**: Change skill content without changing code
3. **Composable**: Ralph can invoke skills just like humans do
4. **Documented**: Skills are self-documenting (see skill files)

### Why Human-in-the-Loop for Demo?

1. **Automation Limits**: Automated tests don't catch UX issues
2. **Confidence**: Human approval means "I verified this works"
3. **Feedback Loop**: Human catches what automation misses
4. **Accountability**: Clear ownership of quality sign-off

### Why Reconcile Learnings?

1. **Institutional Memory**: CLAUDE.md improves with every task
2. **Future Quality**: Next developer (human or AI) benefits
3. **Spec Accuracy**: Specs stay accurate, not outdated
4. **Pattern Discovery**: New DO/DON'T rules emerge from experience

---
