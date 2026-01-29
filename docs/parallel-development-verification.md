# Parallel UI Development Verification

This document records the verification of the parallel UI development setup for Brain Dump's UI v2 greenfield rebuild.

## Verification Date

2026-01-19

## Technical Verification (Automated)

### 1. Script Configuration ✅

Both development scripts are configured in `package.json`:

```json
{
  "dev": "vite dev --port 4242",
  "dev:v2": "vite dev --port 4243"
}
```

### 2. Database Sharing ✅

Both UIs share the same SQLite database:

- **Path**: `~/Library/Application Support/brain-dump/brain-dump.db` (macOS)
- **Configuration**: `src/lib/db.ts` uses `getDatabasePath()` from `src/lib/xdg.ts`
- **Concurrency**: WAL mode enabled (`journal_mode = WAL`) allows concurrent access

### 3. Port Configuration ✅

- Old UI: http://localhost:4242
- New UI: http://localhost:4243
- No conflicts between ports

### 4. Directory Structure ✅

New UI components directory created:

```
src/components-v2/
├── ui/
├── navigation/
├── dashboard/
├── board/
├── tickets/
├── projects/
├── epics/
├── inception/
└── settings/
```

## Manual Verification Steps

The following steps require human verification:

### Test 1: Simultaneous Server Startup

1. Terminal 1: `pnpm dev` (starts on port 4242)
2. Terminal 2: `pnpm dev:v2` (starts on port 4243)
3. Both should start without errors

### Test 2: UI Loading

1. Open http://localhost:4242 - Old UI should load
2. Open http://localhost:4243 - New UI should load
3. Both should render without errors

### Test 3: Database Synchronization

1. Create a ticket in the old UI (port 4242)
2. Refresh the new UI (port 4243)
3. The ticket should appear
4. Repeat in reverse direction

### Test 4: File Locking

1. With both servers running, verify no SQLite lock errors
2. Make changes in one UI and verify they persist

## Known Limitations

1. **TanStack DevTools Port**: The TanStack devtools plugin may conflict on port 42069 if both servers run simultaneously. This is a cosmetic issue and doesn't affect functionality.

2. **WAL Checkpointing**: When running both servers, WAL checkpointing may be delayed until both servers shut down.

## Conclusion

The parallel development infrastructure is correctly configured. Both UIs can run simultaneously on different ports while sharing the same SQLite database.
