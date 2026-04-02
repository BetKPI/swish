#!/bin/bash
set -euo pipefail

RALPH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$RALPH_DIR")"
LOG_DIR="$RALPH_DIR/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/ralph-${TIMESTAMP}.log"
JSON_LOG="$LOG_DIR/ralph-${TIMESTAMP}.jsonl"

echo "Ralph Wiggum loop started at $(date)" | tee "$LOG_FILE"
echo "Project: $PROJECT_DIR" | tee -a "$LOG_FILE"
echo "Log: $LOG_FILE" | tee -a "$LOG_FILE"
echo "JSON log: $JSON_LOG" | tee -a "$LOG_FILE"
echo "---" | tee -a "$LOG_FILE"

ITERATION=0

while true; do
  ITERATION=$((ITERATION + 1))

  if [ -f "$RALPH_DIR/DONE" ]; then
    echo "=== COMPLETE after $ITERATION iterations ===" | tee -a "$LOG_FILE"
    cat "$RALPH_DIR/DONE" | tee -a "$LOG_FILE"
    exit 0
  fi

  echo "=== Iteration $ITERATION — $(date) ===" | tee -a "$LOG_FILE"

  cd "$PROJECT_DIR"

  # --output-format stream-json captures the full reasoning trail:
  # tool calls, file operations, thinking, and results — not just final text.
  # --verbose ensures detailed output including internal decisions.
  claude -p "$(cat "$RALPH_DIR/context.md")" \
    --output-format stream-json \
    --verbose \
    --dangerously-skip-permissions \
    2>&1 | tee -a "$JSON_LOG" | \
    python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
        t = msg.get('type', '')
        if t == 'assistant' and msg.get('message', {}).get('content'):
            for block in msg['message']['content']:
                if block.get('type') == 'text':
                    print(block['text'])
                elif block.get('type') == 'tool_use':
                    print(f\"[TOOL] {block['name']}: {json.dumps(block.get('input', {}))[:200]}\")
        elif t == 'result':
            print(f\"[RESULT] Cost: \${msg.get('cost_usd', 'n/a')} | Duration: {msg.get('duration_ms', 'n/a')}ms\")
    except (json.JSONDecodeError, KeyError):
        pass
" 2>/dev/null | tee -a "$LOG_FILE"

  echo "=== End iteration $ITERATION — $(date) ===" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
done
