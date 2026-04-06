#!/bin/bash
# Swish Autoresearch Loop
# Pattern: karpathy/autoresearch
#
# Two modes:
#   1. Manual: python-only hill climbing (no Claude needed)
#   2. Agent:  Claude Code reads program.md and runs autonomously
#
# Usage:
#   bash research/run_loop.sh              # manual mode, one pass
#   bash research/run_loop.sh --agent      # Claude Code autonomous mode
#   bash research/run_loop.sh --manual 5   # manual mode, 5 passes

set -e
cd "$(dirname "$0")/.."

MODE="manual"
PASSES=1

while [[ $# -gt 0 ]]; do
  case $1 in
    --agent) MODE="agent"; shift ;;
    --manual) MODE="manual"; PASSES=${2:-1}; shift 2 ;;
    *) shift ;;
  esac
done

echo "=== Swish Autoresearch ==="
echo "Mode: $MODE"
echo ""

if [ "$MODE" = "agent" ]; then
  # Agent mode: Claude Code reads program.md and loops autonomously
  echo "Launching Claude Code agent..."
  echo "It will modify models/swish-weights.json, backtest, and iterate."
  echo "Press Ctrl+C to stop."
  echo ""

  # Ensure data exists
  python research/collect_data.py --all --days 60

  # Hand off to Claude Code
  claude -p "Read research/program.md and follow its instructions. Start the research loop now. The data has already been collected in research/data/."
else
  # Manual mode: python hill-climbing
  for i in $(seq 1 $PASSES); do
    echo "--- Pass $i/$PASSES ---"

    echo "[1/3] Collecting data..."
    python research/collect_data.py --all --days 30

    echo "[2/3] Optimizing weights..."
    python research/optimize_weights.py --iterations 3000

    echo "[3/3] Done."
    echo ""
  done

  echo "=== Complete ==="
  echo "Review models/swish-weights.json, then commit + deploy."
fi
