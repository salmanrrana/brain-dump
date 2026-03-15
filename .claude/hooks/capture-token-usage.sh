#!/bin/bash
# Event: Stop
# Parses Claude Code transcript JSONL for real token usage and records to Brain Dump.
#
# Reads transcript_path from stdin JSON, calls the TypeScript parser to extract
# per-model token counts, then records each via the Brain Dump CLI.
#
# All errors exit 0 — this hook must never block Claude Code shutdown.

set -e
trap 'exit 0' ERR

# --- Resolve project directory ---
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
    PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
fi

if [ -z "$PROJECT_DIR" ]; then
    echo "[capture-token-usage] No project directory found, skipping" >&2
    exit 0
fi

if ! command -v jq &>/dev/null; then
    echo "[capture-token-usage] jq not found, skipping token capture" >&2
    exit 0
fi

# --- Log helper ---
LOG_FILE="$PROJECT_DIR/.claude/capture-token-usage.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date -Iseconds)] $1" >> "$LOG_FILE" 2>/dev/null || true
}

# --- Read stdin JSON and extract transcript_path ---
INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null || echo "")

if [ -z "$TRANSCRIPT_PATH" ]; then
    # No transcript_path in stop event — normal, exit silently
    exit 0
fi

if [ ! -f "$TRANSCRIPT_PATH" ]; then
    log "Transcript file not found: $TRANSCRIPT_PATH"
    exit 0
fi

log "Processing transcript: $TRANSCRIPT_PATH"

# --- Locate Brain Dump CLI (as array to avoid eval) ---
BRAIN_DUMP_CMD=()
if command -v brain-dump &>/dev/null; then
    BRAIN_DUMP_CMD=(brain-dump)
elif [ -x "$PROJECT_DIR/node_modules/.bin/brain-dump" ]; then
    BRAIN_DUMP_CMD=("$PROJECT_DIR/node_modules/.bin/brain-dump")
elif [ -f "$PROJECT_DIR/package.json" ] && command -v pnpm &>/dev/null; then
    BRAIN_DUMP_CMD=(pnpm --dir "$PROJECT_DIR" brain-dump)
fi

if [ ${#BRAIN_DUMP_CMD[@]} -eq 0 ]; then
    log "brain-dump CLI not found, skipping token capture"
    exit 0
fi

# --- Locate parser script (global install copies it alongside hook, else project) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER=""
if [ -f "$SCRIPT_DIR/parse-transcript-tokens.ts" ]; then
    PARSER="$SCRIPT_DIR/parse-transcript-tokens.ts"
elif [ -f "$PROJECT_DIR/scripts/parse-transcript-tokens.ts" ]; then
    PARSER="$PROJECT_DIR/scripts/parse-transcript-tokens.ts"
fi

if [ -z "$PARSER" ]; then
    log "parse-transcript-tokens.ts not found, skipping"
    exit 0
fi

# --- Parse the transcript ---
PARSER_OUTPUT=$(npx tsx "$PARSER" "$TRANSCRIPT_PATH" 2>>"$LOG_FILE") || {
    log "Parser failed (exit $?), skipping"
    exit 0
}

if [ -z "$PARSER_OUTPUT" ] || [ "$PARSER_OUTPUT" = "[]" ]; then
    log "No token usage data found in transcript"
    exit 0
fi

# --- Detect active Ralph session (optional) ---
SESSION_ARGS=()
RALPH_STATE="$PROJECT_DIR/.claude/ralph-state.json"
if [ -f "$RALPH_STATE" ]; then
    SESSION_ID=$(jq -r '.sessionId // ""' "$RALPH_STATE" 2>/dev/null || echo "")
    if [ -n "$SESSION_ID" ]; then
        SESSION_ARGS=(--session "$SESSION_ID")
    fi
fi

# --- Record each model's usage via CLI ---
# Extract all fields per model in a single jq call (tab-separated)
MODEL_COUNT=$(echo "$PARSER_OUTPUT" | jq 'length' 2>/dev/null || echo "0")
RECORDED=0

for i in $(seq 0 $((MODEL_COUNT - 1))); do
    read -r MODEL INPUT_TOKENS OUTPUT_TOKENS CACHE_READ CACHE_CREATE <<< \
        "$(echo "$PARSER_OUTPUT" | jq -r ".[$i] | [.model, .inputTokens, .outputTokens, .cacheReadTokens, .cacheCreationTokens] | @tsv" 2>/dev/null)"

    if [ -z "$MODEL" ] || [ "$MODEL" = "null" ]; then
        continue
    fi

    # Build args array — no eval, no shell injection
    ARGS=(telemetry record-usage --model "$MODEL" --input "$INPUT_TOKENS" --output "$OUTPUT_TOKENS" --source jsonl-hook)

    if [ ${#SESSION_ARGS[@]} -gt 0 ]; then
        ARGS+=("${SESSION_ARGS[@]}")
    fi

    if [ "$CACHE_READ" != "0" ]; then
        ARGS+=(--cache-read "$CACHE_READ")
    fi

    if [ "$CACHE_CREATE" != "0" ]; then
        ARGS+=(--cache-create "$CACHE_CREATE")
    fi

    if "${BRAIN_DUMP_CMD[@]}" "${ARGS[@]}" >> "$LOG_FILE" 2>&1; then
        RECORDED=$((RECORDED + 1))
    else
        log "Failed to record usage for model: $MODEL"
    fi
done

log "Recorded token usage for $RECORDED/$MODEL_COUNT model(s)"
exit 0
