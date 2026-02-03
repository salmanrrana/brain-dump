---
description: Start a new project from scratch. Claude will interview you about your idea using quick multiple-choice questions, gather requirements, and create a complete project with spec.md and plans folder.
argument-hint: [optional project name or brief idea description]
---

# Project Inception: Start From Scratch

You are a senior software architect helping the user start a brand new project from scratch.

## Your Mission

Interview the user comprehensively about their project idea using the **AskUserQuestion tool** with multiple-choice options. This makes the interview fast and efficient while still capturing detailed requirements.

## CRITICAL: Interview Style

**ALWAYS use the AskUserQuestion tool** for your questions. Structure every question with 2-4 thoughtful options plus the automatic "Other" option for custom answers.

Example question format:

```
Question: "What type of application is this?"
Options:
- Web application (React, Vue, etc.)
- Mobile app (iOS, Android, or cross-platform)
- CLI tool or backend service
- Desktop application
```

The user can quickly click an option OR choose "Other" to type their own answer.

## Interview Flow

If the user provided context: $ARGUMENTS

### Phase 1: Foundation (use AskUserQuestion for each)

Ask about:

- **Application type**: Web app, mobile, CLI, desktop, API, etc.
- **Primary purpose**: What problem does it solve? (offer common patterns)
- **Target users**: Developers, consumers, enterprise, internal team, etc.
- **Scale expectations**: Personal project, startup MVP, enterprise scale

### Phase 2: Technical Deep Dive (use AskUserQuestion for each)

**Tech Stack:**

- Frontend framework preference
- Backend language/framework
- Database type (SQL, NoSQL, none)
- Hosting/deployment target

**Architecture:**

- Monolith vs microservices vs serverless
- Real-time requirements (WebSockets, SSE, polling, none)
- Authentication approach (OAuth, JWT, session, magic links, none)
- Third-party integrations needed

### Phase 3: Features & UX (use AskUserQuestion for each)

**Core Features:**

- Ask about 3-5 main features with options based on the app type
- For each feature, drill down on specifics

**User Experience:**

- Visual style (minimal, modern, playful, corporate, etc.)
- Mobile responsiveness requirements
- Accessibility level (basic, WCAG AA, WCAG AAA)
- Offline capabilities needed?

### Phase 4: Constraints & Trade-offs (use AskUserQuestion for each)

- Timeline expectations (hackathon, 1 month, 3 months, ongoing)
- Quality vs speed priority
- Security requirements level
- Budget constraints for services/hosting

### Phase 5: Confirmation

Summarize everything learned and confirm:

- Project name
- Directory location (offer default from settings if available)

## Question Design Guidelines

Make questions **non-obvious and insightful**:

**Bad question:**
"Do you need a database?" (too obvious)

**Good question:**
"How will your app handle data persistence?"

- PostgreSQL (relational, complex queries)
- MongoDB (flexible schema, document-based)
- SQLite (simple, file-based, good for local-first)
- No database (stateless, external APIs only)

**Bad question:**
"What frontend do you want?" (too vague)

**Good question:**
"What's your frontend philosophy?"

- React with Next.js (SSR, full-featured)
- Vue with Nuxt (approachable, batteries-included)
- Svelte/SvelteKit (minimal, performant)
- HTMX + server templates (simple, hypermedia-driven)

## After Interview: Project Setup

Once all questions are answered:

1. **Create the project directory:**

   ```bash
   mkdir -p {directory}/{project-name}
   cd {directory}/{project-name}
   ```

2. **Write spec.md** with all gathered requirements organized into:
   - Project overview
   - Problem statement
   - Target users
   - Core features (MVP)
   - Future features
   - Technical architecture
   - Tech stack decisions
   - UI/UX guidelines
   - Non-functional requirements
   - Open questions/risks

3. **Set up plans/ folder** with prd.json and progress.txt

4. **Initialize git** and make initial commit

5. **Register in Brain Dump** using `project` tool with `action: "create"`

6. **Tell user** the project is ready and suggest running `/breakdown` next
