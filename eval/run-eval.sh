#!/usr/bin/env bash
# Submit each bet in bets.json to the live /api/stats endpoint and save the
# JSON response to eval/results/<id>.json. The eval is then graded by reading
# the saved responses through a sharp-bettor lens.
#
# Usage: bash eval/run-eval.sh
#   Optional env: EVAL_BASE_URL (default https://swish-jet.vercel.app)

set -euo pipefail

BASE_URL="${EVAL_BASE_URL:-https://swish-jet.vercel.app}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULTS_DIR"

# Convert paths to native form so Python on Windows can read them
BETS_FILE_NATIVE=$(cygpath -w "$SCRIPT_DIR/bets.json" 2>/dev/null || echo "$SCRIPT_DIR/bets.json")

echo "Eval target: $BASE_URL/api/stats"
echo "Results dir: $RESULTS_DIR"
echo "Bets file: $BETS_FILE_NATIVE"
echo

ids=$(python -c "
import json
with open(r'$BETS_FILE_NATIVE') as f:
    data = json.load(f)
print('\n'.join(b['id'] for b in data['bets']))
")

for id in $ids; do
  # Strip any stray CR (Windows line endings) so the id matches exactly
  id="${id%$'\r'}"
  echo "  -> $id"
  body=$(BETS_PATH="$BETS_FILE_NATIVE" BET_ID="$id" python -c "
import json, os
with open(os.environ['BETS_PATH']) as f:
    data = json.load(f)
bet = next(b for b in data['bets'] if b['id'] == os.environ['BET_ID'])
print(json.dumps({'extraction': bet['extraction']}))
")

  out="$RESULTS_DIR/$id.json"
  http_code=$(curl -s -o "$out" -w "%{http_code}" -X POST "$BASE_URL/api/stats" \
    -H "Content-Type: application/json" \
    --max-time 90 \
    -d "$body")
  size=$(wc -c < "$out" 2>/dev/null || echo 0)
  echo "     status=$http_code  size=${size}B"
done

echo
echo "Done. Results in $RESULTS_DIR"
