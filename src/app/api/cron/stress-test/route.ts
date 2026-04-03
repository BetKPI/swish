import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Comprehensive stress test with real FanDuel/DraftKings-style bets.
 * Tests edge cases: player props, exotic markets, team name variants.
 * Run manually: /api/cron/stress-test
 */

interface TestResult {
  bet: string;
  status: "pass" | "fail" | "empty";
  error?: string;
  charts?: number;
  stats?: number;
  ms?: number;
}

const BASE_URL = "https://swish-jet.vercel.app";

// Real bets people would place today on FanDuel/DraftKings
const TEST_BETS = [
  // ── NBA Player Props ──────────────────────────────────────────
  { sport: "NBA", betType: "player_prop", teams: ["New York Knicks", "Chicago Bulls"], players: ["Jalen Brunson"], market: "Points", line: 26.5, odds: "-115", description: "Jalen Brunson Over 26.5 Points", confidence: 0.9 },
  { sport: "NBA", betType: "player_prop", teams: ["New York Knicks", "Chicago Bulls"], players: ["Karl-Anthony Towns"], market: "Rebounds", line: 11.5, odds: "-110", description: "Karl-Anthony Towns Over 11.5 Rebounds", confidence: 0.9 },
  { sport: "NBA", betType: "player_prop", teams: ["Philadelphia 76ers", "Minnesota Timberwolves"], players: ["Anthony Edwards"], market: "Points", line: 28.5, odds: "-120", description: "Anthony Edwards Over 28.5 Points", confidence: 0.9 },
  { sport: "NBA", betType: "player_prop", teams: ["Philadelphia 76ers", "Minnesota Timberwolves"], players: ["Tyrese Maxey"], market: "Assists", line: 6.5, odds: "+100", description: "Tyrese Maxey Over 6.5 Assists", confidence: 0.9 },
  { sport: "NBA", betType: "player_prop", teams: ["Houston Rockets", "Utah Jazz"], players: ["Alperen Sengun"], market: "Pts+Reb+Ast", line: 35.5, odds: "-110", description: "Alperen Sengun Over 35.5 PRA", confidence: 0.85 },
  { sport: "NBA", betType: "player_prop", teams: ["Dallas Mavericks", "Orlando Magic"], players: ["Paolo Banchero"], market: "Points", line: 22.5, odds: "-105", description: "Paolo Banchero Over 22.5 Points", confidence: 0.9 },
  { sport: "NBA", betType: "player_prop", teams: ["Boston Celtics", "Milwaukee Bucks"], players: ["Jaylen Brown"], market: "Three Pointers Made", line: 2.5, odds: "+110", description: "Jaylen Brown Over 2.5 Threes", confidence: 0.85 },

  // ── NBA Team Bets ─────────────────────────────────────────────
  { sport: "NBA", betType: "moneyline", teams: ["Boston Celtics", "Milwaukee Bucks"], players: [], odds: "-150", description: "Celtics ML vs Bucks", confidence: 0.9 },
  { sport: "NBA", betType: "spread", teams: ["New York Knicks", "Chicago Bulls"], players: [], line: -8.5, odds: "-110", description: "Knicks -8.5 vs Bulls", confidence: 0.9 },
  { sport: "NBA", betType: "over_under", teams: ["Minnesota Timberwolves", "Philadelphia 76ers"], players: [], line: 215.5, odds: "-110", description: "Over 215.5 Wolves vs 76ers", confidence: 0.9 },

  // ── MLB Player Props ──────────────────────────────────────────
  { sport: "MLB", betType: "player_prop", teams: ["New York Yankees", "Miami Marlins"], players: ["Aaron Judge"], market: "Home Runs", line: 0.5, odds: "+210", description: "Aaron Judge to Hit a HR", confidence: 0.85 },
  { sport: "MLB", betType: "player_prop", teams: ["New York Yankees", "Miami Marlins"], players: ["Giancarlo Stanton"], market: "Total Bases", line: 1.5, odds: "-120", description: "Stanton Over 1.5 Total Bases", confidence: 0.85 },
  { sport: "MLB", betType: "player_prop", teams: ["Los Angeles Dodgers", "Washington Nationals"], players: ["Mookie Betts"], market: "Hits", line: 0.5, odds: "-180", description: "Mookie Betts Over 0.5 Hits", confidence: 0.9 },
  { sport: "MLB", betType: "player_prop", teams: ["Boston Red Sox", "San Diego Padres"], players: ["Wilyer Abreu"], market: "RBIs", line: 0.5, odds: "+120", description: "Wilyer Abreu Over 0.5 RBIs", confidence: 0.85 },
  { sport: "MLB", betType: "player_prop", teams: ["Cleveland Guardians", "Chicago Cubs"], players: ["Jose Ramirez"], market: "Hits", line: 1.5, odds: "+130", description: "Jose Ramirez Over 1.5 Hits", confidence: 0.85 },

  // ── MLB Team Bets ─────────────────────────────────────────────
  { sport: "MLB", betType: "moneyline", teams: ["Los Angeles Dodgers", "Washington Nationals"], players: [], odds: "-180", description: "Dodgers ML vs Nationals", confidence: 0.9 },
  { sport: "MLB", betType: "over_under", teams: ["New York Yankees", "Miami Marlins"], players: [], line: 8.5, odds: "-110", description: "Over 8.5 Yankees vs Marlins", confidence: 0.9 },
  { sport: "MLB", betType: "spread", teams: ["Houston Astros", "Athletics"], players: [], line: -1.5, odds: "+130", description: "Astros -1.5 vs Athletics", confidence: 0.9 },

  // ── Edge cases: name variants ─────────────────────────────────
  { sport: "Basketball", betType: "moneyline", teams: ["Knicks", "Bulls"], players: [], odds: "-200", description: "Knicks ML (short name test)", confidence: 0.9 },
  { sport: "MLB", betType: "moneyline", teams: ["Yankees", "Marlins"], players: [], odds: "-160", description: "Yankees ML (short name test)", confidence: 0.9 },

  // ── Edge case: parlay ─────────────────────────────────────────
  { sport: "NBA", betType: "parlay", teams: ["Celtics", "Knicks"], players: [], odds: "+450", description: "Parlay: Celtics + Knicks ML", confidence: 0.8 },

  // ── Chat follow-up questions people would ask ─────────────────
  // (These test the chat endpoint, not stats)
];

// Questions people would ask in the chat
const CHAT_QUESTIONS = [
  { q: "Show home vs away splits", sport: "NBA", teams: ["New York Knicks", "Chicago Bulls"] },
  { q: "How do the starting pitchers match up?", sport: "MLB", teams: ["Los Angeles Dodgers", "Washington Nationals"] },
  { q: "What's the injury report?", sport: "NBA", teams: ["Boston Celtics", "Milwaukee Bucks"] },
  { q: "Show me Jalen Brunson's last 10 games", sport: "NBA", teams: ["New York Knicks", "Chicago Bulls"] },
  { q: "Compare scoring trends", sport: "NBA", teams: ["Minnesota Timberwolves", "Philadelphia 76ers"] },
];

export async function GET(request: NextRequest) {
  const results: TestResult[] = [];
  const chatResults: { question: string; type: string; message: string }[] = [];
  const start = Date.now();

  // Run bets in parallel (batches of 5 to avoid hammering)
  for (let i = 0; i < TEST_BETS.length; i += 5) {
    const batch = TEST_BETS.slice(i, i + 5);
    await Promise.all(batch.map((bet) => testBet(results, bet)));
  }

  // Run chat questions in parallel
  await Promise.all(
    CHAT_QUESTIONS.map((cq) => testChat(chatResults, cq))
  );

  const totalMs = Date.now() - start;
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const empty = results.filter((r) => r.status === "empty").length;

  // Report to Discord
  await reportToDiscord(results, chatResults, totalMs);

  return NextResponse.json({
    bets: { tested: results.length, passed, failed, empty },
    chat: { tested: chatResults.length, results: chatResults },
    timeMs: totalMs,
    failures: results.filter((r) => r.status !== "pass").map((r) => ({
      bet: r.bet,
      status: r.status,
      error: r.error,
    })),
  });
}

async function testBet(results: TestResult[], extraction: Record<string, unknown>) {
  const label = extraction.description as string;
  const t = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extraction }),
    });
    const ms = Date.now() - t;

    if (!res.ok) {
      const err = await res.text().catch(() => "?");
      results.push({ bet: label, status: "fail", error: `HTTP ${res.status}: ${err.slice(0, 150)}`, ms });
      return;
    }

    const data = await res.json();

    // Parlay should return parlay: true
    if (data.parlay) {
      results.push({ bet: label, status: "pass", charts: 0, stats: 0, ms });
      return;
    }

    if (data.unsupported) {
      results.push({ bet: label, status: "fail", error: "Returned unsupported", ms });
      return;
    }

    const charts = data.charts?.length || 0;
    const stats = data.stats?.length || 0;
    const hasSummary = !!data.summary;

    if (charts === 0 && stats === 0 && !hasSummary) {
      results.push({ bet: label, status: "empty", error: "No charts/stats/summary", ms });
    } else {
      results.push({ bet: label, status: "pass", charts, stats, ms });
    }
  } catch (e) {
    results.push({ bet: label, status: "fail", error: (e as Error).message?.slice(0, 150), ms: Date.now() - t });
  }
}

async function testChat(
  results: { question: string; type: string; message: string }[],
  cq: { q: string; sport: string; teams: string[] }
) {
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: cq.q,
        extraction: {
          sport: cq.sport,
          betType: "moneyline",
          teams: cq.teams,
          players: [],
          odds: "-110",
          description: `${cq.teams.join(" vs ")}`,
          confidence: 0.9,
        },
        computedData: {},
      }),
    });

    const data = await res.json();
    results.push({
      question: cq.q,
      type: data.type || "unknown",
      message: (data.message || "no message").slice(0, 100),
    });
  } catch (e) {
    results.push({
      question: cq.q,
      type: "error",
      message: (e as Error).message?.slice(0, 100) || "unknown error",
    });
  }
}

async function reportToDiscord(
  betResults: TestResult[],
  chatResults: { question: string; type: string; message: string }[],
  totalMs: number
) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const passed = betResults.filter((r) => r.status === "pass");
  const failed = betResults.filter((r) => r.status === "fail");
  const empty = betResults.filter((r) => r.status === "empty");
  const color = failed.length > 0 ? 0xef4444 : empty.length > 0 ? 0xf59e0b : 0x10b981;

  const embeds: Record<string, unknown>[] = [
    {
      title: `\u{1F9EA} Stress Test — ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`,
      color,
      fields: [
        { name: "Bets Tested", value: `${betResults.length}`, inline: true },
        { name: "Passed", value: `${passed.length}`, inline: true },
        { name: "Failed", value: `${failed.length}`, inline: true },
        { name: "Empty", value: `${empty.length}`, inline: true },
        { name: "Chat Tested", value: `${chatResults.length}`, inline: true },
        { name: "Total Time", value: `${(totalMs / 1000).toFixed(1)}s`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    },
  ];

  if (failed.length > 0) {
    const list = failed.slice(0, 8).map((f) => `\u274C **${f.bet}**\n${f.error}`).join("\n\n");
    embeds.push({ title: "Bet Failures", color: 0xef4444, fields: [{ name: "\u200b", value: list.slice(0, 1024), inline: false }], timestamp: new Date().toISOString() });
  }

  if (empty.length > 0) {
    const list = empty.slice(0, 5).map((e) => `\u26A0\uFE0F **${e.bet}**`).join("\n");
    embeds.push({ title: "Empty Results", color: 0xf59e0b, fields: [{ name: "\u200b", value: list.slice(0, 1024), inline: false }], timestamp: new Date().toISOString() });
  }

  // Chat results
  const chartChats = chatResults.filter((c) => c.type === "chart").length;
  const noDataChats = chatResults.filter((c) => c.type === "no_data").length;
  const errorChats = chatResults.filter((c) => c.type === "error").length;
  const chatSummary = chatResults.map((c) => {
    const icon = c.type === "chart" ? "\u2705" : c.type === "no_data" ? "\u{1F6AB}" : "\u274C";
    return `${icon} "${c.question}" → ${c.type}: ${c.message}`;
  }).join("\n");

  embeds.push({
    title: `Chat Tests (${chartChats} charts, ${noDataChats} no-data, ${errorChats} errors)`,
    color: errorChats > 0 ? 0xef4444 : 0x6366f1,
    fields: [{ name: "\u200b", value: chatSummary.slice(0, 1024), inline: false }],
    timestamp: new Date().toISOString(),
  });

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds }),
    });
  } catch { /* silent */ }
}
