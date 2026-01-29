# Ralph E2E Integration Tests

This directory contains integration tests for the Ralph autonomous agent workflow. These tests are **not part of the regular test suite** and must be run separately on demand.

## Philosophy

Following Kent C. Dodds' testing philosophy:

> "The more your tests resemble the way your software is used, the more confidence they can give you."

These tests:

- Use **real SQLite databases** (not mocks)
- Create **actual git repositories** in temp directories
- Test the **full Ralph workflow** end-to-end
- Verify **user-facing behavior** not implementation details

## Running the Tests

```bash
# Run all integration tests
pnpm test:integration

# Run in watch mode for development
pnpm test:integration:watch
```

## Test Coverage

### 1. Ralph Session Lifecycle (3 tests)

- Complete a ticket from start to finish
- Handle timeout gracefully by recording session state
- Handle Claude errors and maintain consistent state

### 2. Git Integration (4 tests)

- Create feature branch on start_ticket_work
- Checkout existing branch if already created
- Capture commits made during session
- Use correct branch naming convention

### 3. Database Integrity (3 tests)

- Maintain referential integrity after session
- Cascade delete comments when ticket is deleted
- Preserve ticket history through status changes

### 4. PRD File Management (3 tests)

- Update PRD passes field when ticket is completed
- Suggest next ticket based on priority after completion
- Indicate when all tickets are complete

### 5. Error Handling (5 tests)

- Fail gracefully when ticket does not exist
- Fail gracefully when project path does not exist
- Fail gracefully when not a git repository
- Handle already in_progress tickets gracefully
- Handle already completed tickets gracefully

## Why Separate from Regular Tests?

1. **Slower execution**: Integration tests take ~30 seconds vs ~10 seconds for unit tests
2. **Different concerns**: Unit tests focus on component correctness, integration tests on workflow correctness
3. **CI optimization**: Regular PR builds run fast unit tests; integration tests run on demand or nightly
4. **Independence**: Integration tests create real file system artifacts that need cleanup

## Configuration

- `vitest.integration.config.ts` - Separate Vitest config for integration tests
- Integration tests are excluded from regular `pnpm test` via `vitest.config.ts`

## Test Fixtures

Each test creates:

- A temporary directory in `/tmp/ralph-integration-*`
- A fresh SQLite database with the Brain Dump schema
- A git repository with an initial commit
- A PRD file in `plans/prd.json`

All fixtures are cleaned up after each test.
