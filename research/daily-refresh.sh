#!/bin/bash
# Daily data refresh — run via Windows Task Scheduler or cron
# Collects fresh data, commits, and deploys automatically.
#
# Setup (one time):
#   Windows Task Scheduler → Create Task → Trigger: Daily 6AM
#   Action: bash "C:\Users\scott\Desktop\swish\research\daily-refresh.sh"
#
# Or run manually: bash research/daily-refresh.sh

set -e
cd "$(dirname "$0")/.."

echo "=== Swish Daily Refresh — $(date) ==="

# 1. First basket data (NBA play-by-play — full season)
echo "[1/7] Collecting NBA first basket data..."
python research/collect-fullseason-fb.py 2>&1

# 2. NRFI data (MLB first inning)
echo "[2/7] Collecting MLB NRFI data..."
python research/collect-nrfi.py 2>&1 || echo "  (skipped — MLB data not available)"

# 3. NHL first goal data
echo "[3/7] Collecting NHL first goal data..."
python research/collect-firstgoal.py 2>&1 || echo "  (skipped — NHL data not available)"

# 4. Autoresearch — collect training data and optimize weights
echo "[4/7] Collecting training data..."
python research/collect_data.py --all --days 30 2>&1

echo "[5/7] Optimizing Swish Score weights..."
python research/optimize_weights.py --iterations 3000 2>&1

# 6. Chart audit
# 6. PGA tournament history
echo "[6/7] Refreshing PGA major tournament history..."
python research/collect-pga-history.py 2>&1 || echo "  (skipped — PGA data not available)"

echo "[7/7] Running chart audit..."
python research/audit-charts.py 2>&1 | tail -20

# Deploy if anything changed
echo "Deploying..."
if git diff --quiet models/ 2>/dev/null; then
  echo "  No changes to models — skipping deploy."
else
  git add models/
  git commit -m "Daily data refresh — $(date +%Y-%m-%d)

Updated first-basket-data.json and swish-weights.json
from $(date +%Y-%m-%d) training run."
  git push origin master
  echo "  Pushed to git — Vercel will auto-deploy."
fi

echo "=== Done ==="
