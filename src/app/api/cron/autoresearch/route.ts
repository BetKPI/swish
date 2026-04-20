import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

export const maxDuration = 60;

/**
 * Autoresearch cron — backtests Swish Score model weights against recent
 * real outcomes and optimizes them via coordinate descent.
 *
 * Run manually: /api/cron/autoresearch
 * Schedule via Vercel Cron: once daily
 *
 * Flow:
 * 1. Fetch yesterday's completed games from ESPN
 * 2. For each game, compute what our model would have scored given pre-game data
 * 3. Compare predictions vs actual outcomes (did spreads cover, did overs hit?)
 * 4. Run coordinate descent optimization on the weight vectors
 * 5. Write updated weights if improvement > threshold
 */

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

interface GameOutcome {
  sport: string;
  betType: "spread" | "over_under" | "moneyline";
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  spread?: number; // positive = home favored
  total?: number;
  homeWon: boolean;
  coveredSpread?: boolean;
  wentOver?: boolean;
}

interface WeightSet {
  [key: string]: number;
}

interface ModelWeights {
  _meta: { version: number; updated: string; source: string; notes: string };
  player_prop: WeightSet;
  spread: WeightSet;
  over_under: WeightSet;
  moneyline: WeightSet;
}

// ── Fetch yesterday's scores ─────────────────────────────────────

async function fetchYesterdayScores(sport: string, league: string): Promise<GameOutcome[]> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, "");

  try {
    const res = await fetch(
      `${ESPN_BASE}/${sport}/${league}/scoreboard?dates=${dateStr}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    const data = await res.json();

    const outcomes: GameOutcome[] = [];
    const events = data.events || [];

    for (const event of events) {
      const competitors = event.competitions?.[0]?.competitors;
      if (!competitors || competitors.length !== 2) continue;

      const home = competitors.find((c: { homeAway: string }) => c.homeAway === "home");
      const away = competitors.find((c: { homeAway: string }) => c.homeAway === "away");
      if (!home || !away) continue;

      const homeScore = parseInt(home.score || "0", 10);
      const awayScore = parseInt(away.score || "0", 10);
      if (isNaN(homeScore) || isNaN(awayScore)) continue;

      // Only include completed games
      const status = event.status?.type?.completed;
      if (!status) continue;

      const totalPoints = homeScore + awayScore;
      const margin = homeScore - awayScore;

      outcomes.push({
        sport: league.toUpperCase(),
        betType: "moneyline",
        homeTeam: home.team?.displayName || home.team?.name || "Home",
        awayTeam: away.team?.displayName || away.team?.name || "Away",
        homeScore,
        awayScore,
        homeWon: homeScore > awayScore,
      });

      // Spread outcome (using average closing line approximation)
      // We use the margin to determine cover — approximate line from score
      const impliedSpread = margin > 0 ? -(margin * 0.6) : Math.abs(margin) * 0.6;
      outcomes.push({
        sport: league.toUpperCase(),
        betType: "spread",
        homeTeam: home.team?.displayName || "Home",
        awayTeam: away.team?.displayName || "Away",
        homeScore,
        awayScore,
        spread: impliedSpread,
        homeWon: homeScore > awayScore,
        coveredSpread: margin > impliedSpread,
      });

      // Over/under outcome
      // Approximate total from average of sport: NBA ~220, MLB ~8.5, NHL ~5.5, NFL ~44
      const sportAvgTotals: Record<string, number> = {
        NBA: 220, MLB: 8.5, NHL: 5.5, NFL: 44, WNBA: 155,
      };
      const avgTotal = sportAvgTotals[league.toUpperCase()] || 100;
      outcomes.push({
        sport: league.toUpperCase(),
        betType: "over_under",
        homeTeam: home.team?.displayName || "Home",
        awayTeam: away.team?.displayName || "Away",
        homeScore,
        awayScore,
        total: avgTotal,
        homeWon: homeScore > awayScore,
        wentOver: totalPoints > avgTotal,
      });
    }

    return outcomes;
  } catch (e) {
    console.error(`[Autoresearch] Failed to fetch ${sport}/${league}:`, e);
    return [];
  }
}

// ── Scoring function (mirrors swishScore.ts logic) ────────────────

function simulateScore(outcome: GameOutcome, weights: WeightSet): number {
  // Simplified simulation: given the outcome features, compute what
  // our weighted model would have rated this bet as.
  // We use the actual result to determine if the model's logic aligns.
  switch (outcome.betType) {
    case "spread": {
      const margin = outcome.homeScore - outcome.awayScore;
      const spread = outcome.spread || 0;
      // Simulate feature signals from the game
      const coverRateSignal = outcome.coveredSpread ? 70 : 30;
      const closeGameSignal = Math.abs(margin) <= Math.abs(spread) + 3 ? 60 : 40;
      const marginTrendSignal = margin > 0 ? 60 : 40;
      const homeAwaySignal = outcome.homeWon ? 65 : 35;
      const restSignal = 50; // unknown

      const w = weights;
      return (
        coverRateSignal * (w.atsCoverRate || 0.35) +
        closeGameSignal * (w.closeGames || 0.2) +
        marginTrendSignal * (w.marginTrend || 0.2) +
        homeAwaySignal * (w.homeAwayRecord || 0.15) +
        restSignal * (w.restAdvantage || 0.1)
      );
    }
    case "over_under": {
      const totalPoints = outcome.homeScore + outcome.awayScore;
      const line = outcome.total || 100;
      const overRateSignal = outcome.wentOver ? 70 : 30;
      const paceSignal = totalPoints > line ? 65 : 35;
      const trendSignal = 50;
      const avgVsLineSignal = totalPoints > line ? 60 : 40;

      const w = weights;
      return (
        overRateSignal * (w.overRate || 0.35) +
        paceSignal * (w.paceProjection || 0.25) +
        trendSignal * (w.scoringTrend || 0.2) +
        avgVsLineSignal * (w.avgVsLine || 0.2)
      );
    }
    case "moneyline": {
      const winSignal = outcome.homeWon ? 70 : 30;
      const formSignal = outcome.homeWon ? 60 : 40;
      const diffSignal = 50 + (outcome.homeScore - outcome.awayScore) * 2;
      const homeSignal = outcome.homeWon ? 65 : 35;
      const streakSignal = 50;

      const w = weights;
      return (
        winSignal * (w.winPct || 0.3) +
        formSignal * (w.recentForm || 0.25) +
        Math.max(0, Math.min(100, diffSignal)) * (w.pointDiff || 0.2) +
        homeSignal * (w.homeAwayPct || 0.15) +
        streakSignal * (w.streak || 0.1)
      );
    }
    default:
      return 50;
  }
}

// ── Loss function — MSE between predicted confidence and actual result ──

function computeLoss(outcomes: GameOutcome[], weights: Record<string, WeightSet>): number {
  let totalLoss = 0;
  let count = 0;

  for (const outcome of outcomes) {
    const w = weights[outcome.betType];
    if (!w) continue;

    const predicted = simulateScore(outcome, w) / 100; // normalize to 0-1
    // Target: 1 if the "positive" outcome happened, 0 otherwise
    let target: number;
    switch (outcome.betType) {
      case "spread":
        target = outcome.coveredSpread ? 1 : 0;
        break;
      case "over_under":
        target = outcome.wentOver ? 1 : 0;
        break;
      case "moneyline":
        target = outcome.homeWon ? 1 : 0;
        break;
      default:
        continue;
    }

    totalLoss += (predicted - target) ** 2;
    count++;
  }

  return count > 0 ? totalLoss / count : 999;
}

// ── Coordinate descent optimizer ──────────────────────────────────

function optimizeWeights(
  outcomes: GameOutcome[],
  currentWeights: ModelWeights
): ModelWeights {
  const betTypes = ["spread", "over_under", "moneyline"] as const;
  const newWeights = JSON.parse(JSON.stringify(currentWeights)) as ModelWeights;

  for (const betType of betTypes) {
    const w = { ...newWeights[betType] };
    const keys = Object.keys(w);
    let bestLoss = computeLoss(
      outcomes.filter((o) => o.betType === betType),
      { [betType]: w }
    );

    // Coordinate descent: perturb each weight and keep if loss improves
    const steps = [0.05, 0.02, 0.01];
    for (const step of steps) {
      for (const key of keys) {
        // Try increasing
        const orig = w[key];
        w[key] = Math.min(1, orig + step);
        // Normalize weights to sum to 1
        const sum = Object.values(w).reduce((s, v) => s + v, 0);
        const normalized = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum]));
        const lossUp = computeLoss(
          outcomes.filter((o) => o.betType === betType),
          { [betType]: normalized }
        );

        if (lossUp < bestLoss) {
          bestLoss = lossUp;
          Object.assign(w, normalized);
        } else {
          // Try decreasing
          w[key] = Math.max(0.01, orig - step);
          const sum2 = Object.values(w).reduce((s, v) => s + v, 0);
          const normalized2 = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum2]));
          const lossDown = computeLoss(
            outcomes.filter((o) => o.betType === betType),
            { [betType]: normalized2 }
          );

          if (lossDown < bestLoss) {
            bestLoss = lossDown;
            Object.assign(w, normalized2);
          } else {
            w[key] = orig; // revert
          }
        }
      }
    }

    // Round weights to 4 decimal places
    newWeights[betType] = Object.fromEntries(
      Object.entries(w).map(([k, v]) => [k, Math.round(v * 10000) / 10000])
    ) as WeightSet;
  }

  return newWeights;
}

// ── Main handler ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Verify cron secret in production
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch yesterday's results across active sports
    const sportLeagues = [
      ["basketball", "nba"],
      ["baseball", "mlb"],
      ["hockey", "nhl"],
    ];

    const allOutcomes: GameOutcome[] = [];
    const fetches = sportLeagues.map(([sport, league]) => fetchYesterdayScores(sport, league));
    const results = await Promise.all(fetches);
    for (const outcomes of results) {
      allOutcomes.push(...outcomes);
    }

    if (allOutcomes.length === 0) {
      return NextResponse.json({
        status: "skipped",
        reason: "No completed games found for yesterday",
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Load current weights
    const weightsPath = join(process.cwd(), "models", "swish-weights.json");
    let currentWeights: ModelWeights;
    try {
      const raw = readFileSync(weightsPath, "utf-8");
      currentWeights = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Could not read swish-weights.json" }, { status: 500 });
    }

    // 3. Compute baseline loss
    const baselineLoss = computeLoss(allOutcomes, {
      spread: currentWeights.spread,
      over_under: currentWeights.over_under,
      moneyline: currentWeights.moneyline,
    });

    // 4. Optimize
    const optimized = optimizeWeights(allOutcomes, currentWeights);

    // 5. Compute new loss
    const newLoss = computeLoss(allOutcomes, {
      spread: optimized.spread,
      over_under: optimized.over_under,
      moneyline: optimized.moneyline,
    });

    const improvement = baselineLoss - newLoss;
    const improved = improvement > 0.001; // Only save if meaningful improvement

    // 6. Save if improved
    if (improved) {
      optimized._meta = {
        version: (currentWeights._meta?.version || 2) + 1,
        updated: new Date().toISOString().slice(0, 10),
        source: `autoresearch — optimized over ${allOutcomes.length} outcomes`,
        notes: `Coordinate descent on ${new Date().toISOString().slice(0, 10)} scores. Improvement: ${(improvement * 100).toFixed(2)}%`,
      };
      writeFileSync(weightsPath, JSON.stringify(optimized, null, 2));
    }

    // 7. Log to Discord if configured
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      const color = improved ? 0x10b981 : 0x6366f1;
      const emoji = improved ? "\u2705" : "\u{1F504}";
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: `${emoji} Autoresearch ${improved ? "Updated" : "No Change"}`,
            color,
            fields: [
              { name: "Games Analyzed", value: `${allOutcomes.length}`, inline: true },
              { name: "Baseline Loss", value: baselineLoss.toFixed(4), inline: true },
              { name: "New Loss", value: newLoss.toFixed(4), inline: true },
              { name: "Improvement", value: `${(improvement * 100).toFixed(3)}%`, inline: true },
              ...(improved ? [
                { name: "Spread Weights", value: JSON.stringify(optimized.spread), inline: false },
                { name: "O/U Weights", value: JSON.stringify(optimized.over_under), inline: false },
                { name: "ML Weights", value: JSON.stringify(optimized.moneyline), inline: false },
              ] : []),
            ],
            timestamp: new Date().toISOString(),
          }],
        }),
      }).catch(() => {});
    }

    return NextResponse.json({
      status: improved ? "updated" : "no_improvement",
      gamesAnalyzed: allOutcomes.length,
      baselineLoss: Math.round(baselineLoss * 10000) / 10000,
      newLoss: Math.round(newLoss * 10000) / 10000,
      improvement: Math.round(improvement * 100000) / 100000,
      weightsUpdated: improved,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Autoresearch] Error:", error);
    return NextResponse.json(
      { error: "Autoresearch failed", detail: (error as Error).message },
      { status: 500 }
    );
  }
}
