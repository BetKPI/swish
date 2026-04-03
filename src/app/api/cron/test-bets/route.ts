import { NextRequest, NextResponse } from "next/server";

// Vercel free tier: 60s max. Keep test count low.
export const maxDuration = 60;

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

// Common prop bet templates per sport
const NBA_PROPS = [
  { market: "Points", lineFn: (pts: number) => Math.round(pts) - 1.5 },
  { market: "Rebounds", lineFn: () => 6.5 },
  { market: "Assists", lineFn: () => 5.5 },
  { market: "Pts+Reb+Ast", lineFn: (pts: number) => Math.round(pts) + 8.5 },
  { market: "Three Pointers Made", lineFn: () => 2.5 },
];

const MLB_PROPS = [
  { market: "Hits", lineFn: () => 0.5 },
  { market: "Home Runs", lineFn: () => 0.5 },
  { market: "RBIs", lineFn: () => 0.5 },
  { market: "Strikeouts (Pitcher)", lineFn: () => 5.5 },
  { market: "Total Bases", lineFn: () => 1.5 },
];

interface TestResult {
  bet: string;
  betType: string;
  sport: string;
  status: "pass" | "fail" | "empty";
  error?: string;
  chartsCount?: number;
  statsCount?: number;
  timeMs?: number;
}

// Verify cron secret to prevent unauthorized access
function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // Allow if no secret configured
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: TestResult[] = [];
  const startTime = Date.now();

  try {
    // Fetch today's games
    const [nbaGames, mlbGames] = await Promise.all([
      fetchGames("basketball", "nba"),
      fetchGames("baseball", "mlb"),
    ]);

    console.log(`[QA] Found ${nbaGames.length} NBA, ${mlbGames.length} MLB games`);

    // Build all bet configs first
    const bets: Record<string, unknown>[] = [];

    // NBA — 1 game, 4 bet types
    const nbaGame = nbaGames[0];
    if (nbaGame) {
      const t = [nbaGame.away.name, nbaGame.home.name];
      bets.push(
        { sport: "NBA", betType: "moneyline", teams: t, players: [], odds: "-110", description: `${t[0]} ML vs ${t[1]}`, confidence: 0.9 },
        { sport: "NBA", betType: "spread", teams: t, players: [], line: -3.5, odds: "-110", description: `${t[0]} -3.5 vs ${t[1]}`, confidence: 0.9 },
        { sport: "NBA", betType: "over_under", teams: t, players: [], line: 220.5, odds: "-110", description: `Over 220.5 — ${t[0]} vs ${t[1]}`, confidence: 0.9 },
      );
      const p = nbaGame.players[0];
      if (p) {
        const prop = NBA_PROPS[Math.floor(Math.random() * NBA_PROPS.length)];
        const line = prop.lineFn(p.pts || 20);
        bets.push({ sport: "NBA", betType: "player_prop", teams: t, players: [p.name], market: prop.market, line, odds: "-115", description: `${p.name} Over ${line} ${prop.market}`, confidence: 0.85 });
      }
    }

    // MLB — 1 game, 4 bet types
    const mlbGame = mlbGames[0];
    if (mlbGame) {
      const t = [mlbGame.away.name, mlbGame.home.name];
      bets.push(
        { sport: "MLB", betType: "moneyline", teams: t, players: [], odds: "+130", description: `${t[0]} ML vs ${t[1]}`, confidence: 0.9 },
        { sport: "MLB", betType: "over_under", teams: t, players: [], line: 8.5, odds: "-110", description: `Over 8.5 — ${t[0]} vs ${t[1]}`, confidence: 0.9 },
        { sport: "MLB", betType: "spread", teams: t, players: [], line: -1.5, odds: "+140", description: `${t[0]} -1.5 vs ${t[1]}`, confidence: 0.9 },
      );
      const p = mlbGame.players[0];
      if (p) {
        const prop = MLB_PROPS[Math.floor(Math.random() * MLB_PROPS.length)];
        const line = prop.lineFn();
        bets.push({ sport: "MLB", betType: "player_prop", teams: t, players: [p.name], market: prop.market, line, odds: "-120", description: `${p.name} Over ${line} ${prop.market}`, confidence: 0.85 });
      }
    }

    // Run all bets in parallel (all at once — they hit different endpoints)
    console.log(`[QA] Running ${bets.length} bets in parallel`);
    await Promise.all(bets.map((bet) => testBet(results, bet)));

    // Report to Discord
    await reportToDiscord(results, Date.now() - startTime);

    return NextResponse.json({
      tested: results.length,
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status === "fail").length,
      empty: results.filter((r) => r.status === "empty").length,
      timeMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[QA] Fatal error:", error);
    await reportError(error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "QA run failed" }, { status: 500 });
  }
}

// ── Fetch today's games from ESPN ──────────────────────────────────

interface GameInfo {
  home: { name: string; abbrev: string };
  away: { name: string; abbrev: string };
  players: { name: string; stat: string; pts?: number }[];
}

async function fetchGames(sport: string, league: string): Promise<GameInfo[]> {
  try {
    const res = await fetch(`${ESPN_BASE}/${sport}/${league}/scoreboard`);
    if (!res.ok) return [];
    const data = await res.json();
    const events = data.events || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return events.map((e: any) => {
      const comp = e.competitions?.[0];
      if (!comp) return null;

      const competitors = comp.competitors || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const home = competitors.find((c: any) => c.homeAway === "home");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const away = competitors.find((c: any) => c.homeAway === "away");

      // Extract player leaders
      const players: { name: string; stat: string; pts?: number }[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const team of competitors) {
        const leaders = team.leaders || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const cat of leaders) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const leader of (cat.leaders || []).slice(0, 1)) {
            const name = leader.athlete?.displayName;
            if (name && !players.find((p) => p.name === name)) {
              const ptsMatch = leader.displayValue?.match(/^(\d+)/);
              players.push({
                name,
                stat: cat.name,
                pts: ptsMatch ? parseInt(ptsMatch[1], 10) : undefined,
              });
            }
          }
        }
      }

      return {
        home: {
          name: home?.team?.displayName || "Unknown",
          abbrev: home?.team?.abbreviation || "?",
        },
        away: {
          name: away?.team?.displayName || "Unknown",
          abbrev: away?.team?.abbreviation || "?",
        },
        players,
      };
    }).filter(Boolean) as GameInfo[];
  } catch {
    return [];
  }
}

// ── Test a single bet ──────────────────────────────────────────────

async function testBet(
  results: TestResult[],
  extraction: Record<string, unknown>
): Promise<void> {
  const start = Date.now();
  const label = extraction.description as string;

  try {
    // Call our own stats endpoint
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : null)
      || (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://swish-jet.vercel.app");

    console.log(`[QA] Testing: ${label} → ${baseUrl}/api/stats`);
    const res = await fetch(`${baseUrl}/api/stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extraction }),
    });

    const timeMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      results.push({
        bet: label,
        betType: extraction.betType as string,
        sport: extraction.sport as string,
        status: "fail",
        error: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
        timeMs,
      });
      return;
    }

    const data = await res.json();

    if (data.unsupported) {
      results.push({
        bet: label,
        betType: extraction.betType as string,
        sport: extraction.sport as string,
        status: "fail",
        error: "Returned unsupported",
        timeMs,
      });
      return;
    }

    if (data.parlay) {
      results.push({
        bet: label,
        betType: extraction.betType as string,
        sport: extraction.sport as string,
        status: "pass",
        chartsCount: 0,
        statsCount: 0,
        timeMs,
      });
      return;
    }

    const charts = data.charts?.length || 0;
    const stats = data.stats?.length || 0;
    const hasSummary = !!data.summary;

    if (charts === 0 && stats === 0 && !hasSummary) {
      results.push({
        bet: label,
        betType: extraction.betType as string,
        sport: extraction.sport as string,
        status: "empty",
        error: "No charts, stats, or summary returned",
        timeMs,
      });
      return;
    }

    results.push({
      bet: label,
      betType: extraction.betType as string,
      sport: extraction.sport as string,
      status: "pass",
      chartsCount: charts,
      statsCount: stats,
      timeMs,
    });
  } catch (error) {
    results.push({
      bet: label,
      betType: extraction.betType as string,
      sport: extraction.sport as string,
      status: "fail",
      error: error instanceof Error ? error.message : "Unknown error",
      timeMs: Date.now() - start,
    });
  }
}

// ── Report to Discord ──────────────────────────────────────────────

async function reportToDiscord(results: TestResult[], totalMs: number) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("[QA] No Discord webhook, skipping report");
    return;
  }

  const passed = results.filter((r) => r.status === "pass");
  const failed = results.filter((r) => r.status === "fail");
  const empty = results.filter((r) => r.status === "empty");

  const color = failed.length > 0 ? 0xef4444 : empty.length > 0 ? 0xf59e0b : 0x10b981;

  const embeds = [
    {
      title: `QA Run — ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`,
      color,
      fields: [
        { name: "Tested", value: `${results.length}`, inline: true },
        { name: "Passed", value: `${passed.length}`, inline: true },
        { name: "Failed", value: `${failed.length}`, inline: true },
        { name: "Empty", value: `${empty.length}`, inline: true },
        { name: "Total Time", value: `${(totalMs / 1000).toFixed(1)}s`, inline: true },
        {
          name: "Avg per Bet",
          value: `${results.length > 0 ? ((totalMs / results.length) / 1000).toFixed(1) : 0}s`,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    },
  ];

  // Add failure details
  if (failed.length > 0) {
    const failList = failed
      .slice(0, 10)
      .map((f) => `\u274C **${f.bet}**\n${f.error}`)
      .join("\n\n");
    embeds.push({
      title: "Failures",
      color: 0xef4444,
      fields: [{ name: "\u200b", value: failList.slice(0, 1024), inline: false }],
      timestamp: new Date().toISOString(),
    });
  }

  // Add empty results
  if (empty.length > 0) {
    const emptyList = empty
      .slice(0, 5)
      .map((e) => `\u26A0\uFE0F **${e.bet}**\n${e.error}`)
      .join("\n\n");
    embeds.push({
      title: "Empty Results",
      color: 0xf59e0b,
      fields: [{ name: "\u200b", value: emptyList.slice(0, 1024), inline: false }],
      timestamp: new Date().toISOString(),
    });
  }

  // Add slowest bets
  const slowest = [...results]
    .sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0))
    .slice(0, 3);
  if (slowest.length > 0 && slowest[0].timeMs && slowest[0].timeMs > 5000) {
    const slowList = slowest
      .map((s) => `\u{1F422} **${s.bet}** — ${((s.timeMs || 0) / 1000).toFixed(1)}s`)
      .join("\n");
    embeds.push({
      title: "Slowest Bets",
      color: 0x6366f1,
      fields: [{ name: "\u200b", value: slowList, inline: false }],
      timestamp: new Date().toISOString(),
    });
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds }),
    });
  } catch (e) {
    console.error("[QA] Discord report failed:", e);
  }
}

async function reportError(message: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "QA Run CRASHED",
          color: 0xef4444,
          description: message.slice(0, 2000),
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch { /* silent */ }
}
