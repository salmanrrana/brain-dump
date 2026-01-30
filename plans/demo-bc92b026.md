# Demo Script: bc92b026 - Ralph Workflow Enforcement

**Ticket ID**: bc92b026-b826-4f9b-8cc1-9541f395b90e
**Title**: Update Ralph script to enforce full workflow: ai_review → human_review → done
**Status**: human_review (awaiting manual verification)

## Overview

This ticket updates the Ralph autonomous agent prompt to enforce the Universal Quality Workflow, ensuring Ralph cannot complete tickets directly to `done` status and must follow all 4 phases (Implementation, AI Review, Demo, Stop).

## Changes Made

### 1. Updated `.ralph-prompt.md` with 4-phase structure

**File**: `.ralph-prompt.md` (lines 5-32)
**Changes**:
- Restructured task from flat 12-step list into 4 distinct phases
- Phase 1: Implementation (9 steps - includes explicit verification)
- Phase 2: AI Review (4 steps - runs all 3 review agents, REQUIRED)
- Phase 3: Demo Generation (1 step - generates demo script)
- Phase 4: STOP (2 steps - complete session, wait for human approval)

**Key Addition**: Phase 2 explicitly marked as "(REQUIRED)" to prevent skipping

### 2. Added critical enforcement rules

**File**: `.ralph-prompt.md` (line 41)
**New Rule**: "NEVER auto-approve tickets - always stop at human_review and wait for human feedback via submit_demo_feedback"

### 3. Added ticket status filtering

**File**: `.ralph-prompt.md` (lines 9-10)
**Changes**:
- When picking ONE ticket, Ralph must skip tickets in 'human_review'
- Only pick from 'ready' or 'backlog' status
- Prevents Ralph from attempting to work on tickets in wrong workflow phases

### 4. Added explicit verification step

**File**: `.ralph-prompt.md` (line 7)
**Changes**:
- Expanded "Implement" step to include "verify acceptance criteria"
- Added separate "Run tests" step with explicit command: `pnpm type-check && pnpm lint && pnpm test`
- Ensures CLAUDE.md verification checklist is followed before completing

### 5. Fixed error handling

**File**: `.ralph-prompt.md` (lines 13-14)
**Changes**:
- Added explicit error handling for `check_review_complete` response
- If `canProceedToHumanReview: false`: **STOP and fix remaining critical/major findings**
- If `canProceedToHumanReview: true`: Continue to Phase 3
- Prevents tickets with critical findings from reaching human_review

### 6. Resolved documentation inconsistencies

**File**: `.ralph-prompt.md` (multiple locations)
**Changes**:
- Removed `metadata` parameter from session state example (was causing confusion)
- Updated "reviewing" state description to reflect Phase 2 (AI review, not self-review)
- Ensured step numbering is consistent across all phases

## AI Review Findings (Fixed)

The extended review pipeline identified 7 issues:

1. ✅ **Ticket status filtering lost** - FIXED: Restored status filter in Phase 1, step 3
2. ✅ **No error handling for check_review_complete=false** - FIXED: Added explicit STOP condition
3. ✅ **Missing verification step** - FIXED: Added type-check, lint, test steps
4. ✅ **Metadata inconsistency** - FIXED: Removed metadata from examples
5. ✅ **"Reviewing" state not in table** - VERIFIED: Already present (line 106)
6. ✅ **Conditional findings submission** - FIXED: Added "(if any)" to steps 11-12
7. ✅ **Unclear Phase 2 completion** - FIXED: Added explicit error handling

## How to Verify

### Step 1: Verify Ralph prompt structure
**Action**: Open `.ralph-prompt.md` and verify:
- [ ] Lines 5-32 show 4-phase structure
- [ ] Phase 2 is labeled "(REQUIRED)"
- [ ] Phase 4 explicitly says "Never auto-complete"
- [ ] Example workflow shows all 4 phases (lines 109-146)

**Expected Outcome**: All checkboxes pass

### Step 2: Verify ticket filtering
**Action**: Check Phase 1, step 3 in `.ralph-prompt.md`:
- [ ] Includes "Skip tickets in 'human_review'"
- [ ] Includes "Only pick tickets in 'ready' or 'backlog'"

**Expected Outcome**: Both sub-bullets present

### Step 3: Verify verification step
**Action**: Check Phase 1 in `.ralph-prompt.md`:
- [ ] Step 6 includes "verify acceptance criteria"
- [ ] Step 7 includes `pnpm type-check && pnpm lint && pnpm test`

**Expected Outcome**: Both verification steps explicit

### Step 4: Verify error handling
**Action**: Check Phase 2, step 13 in `.ralph-prompt.md`:
- [ ] Shows handling for `canProceedToHumanReview: false` → **STOP**
- [ ] Shows handling for `canProceedToHumanReview: true` → Continue

**Expected Outcome**: Both conditions documented

### Step 5: Verify no auto-approval
**Action**: Check Phase 4, steps 15-16 in `.ralph-prompt.md`:
- [ ] Step 15 completes session
- [ ] Step 16 says "STOP - Human must approve"
- [ ] Line 41 says "NEVER auto-approve tickets"

**Expected Outcome**: All anti-auto-approval measures in place

### Step 6: Verify MCP tool enforcement
**Action**: Check MCP server tools:
- [ ] `complete_ticket_work` sets status to `ai_review` (not `done`)
- [ ] `generate_demo_script` requires status `ai_review`
- [ ] `submit_demo_feedback` requires status `human_review`
- [ ] MCP tools prevent bypassing workflow

**Expected Outcome**: Tools enforce workflow at database level

## Result

✅ **Implementation Complete**: Ralph prompt now includes clear 4-phase workflow with:
- Phase 1 (Implementation): With verification step
- Phase 2 (AI Review): REQUIRED, with error handling
- Phase 3 (Demo): With precondition checks
- Phase 4 (Stop): With anti-auto-approval enforcement

✅ **Enforcement**: Multiple layers:
1. Documentation layer: `.ralph-prompt.md` explicitly guides Ralph
2. Rule layer: CLAUDE.md verification checklist + new rules
3. Tool layer: MCP tools enforce status transitions
4. Error handling: Explicit STOP conditions if workflows fail

✅ **Safety**: Ralph cannot:
- Skip AI review phase (Phase 2 is REQUIRED)
- Auto-complete to `done` (must stop at `human_review`)
- Bypass critical finding fixes (error handling blocks progression)
- Pick wrong tickets (status filtering prevents it)

## Testing the Fix

When Ralph reads the updated `.ralph-prompt.md` prompt:
1. Ralph will understand 4 distinct phases
2. Ralph will run review agents after implementation
3. Ralph will fix critical/major findings
4. Ralph will generate demo script
5. Ralph will STOP and wait for human approval
6. Ralph cannot call `submit_demo_feedback` to auto-approve

This ensures the Universal Quality Workflow is properly enforced.
