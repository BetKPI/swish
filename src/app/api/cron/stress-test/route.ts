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

// Real bets across every sport/type combo — FanDuel/DraftKings style
const TEST_BETS = [
  // ── NBA Player Props (7 markets) ──────────────────────────────
  { sport: "NBA", betType: "player_prop", teams: ["New York Knicks", "Chicago Bulls"], players: ["Jalen Brunson"], market: "Points", line: 26.5, odds: "-115", description: "Brunson Over 26.5 Points", confidence: 0.9 },
  { sport: "NBA", betType: "player_prop", teams: ["New York Knicks", "Chicago Bulls"], players: ["Karl-Anthony Towns"], market: "Rebounds", line: 11.5, odds: "-110", description: "KAT Over 11.5 Rebounds", confidence: 0.9 },
  { sport: "NBA", betType: "player_prop", teams: ["Philadelphia 76ers", "Minnesota Timberwolves"], players: ["Tyrese Maxey"], market: "Assists", line: 6.5, odds: "+100", description: "Maxey Over 6.5 Assists", confidence: 0.9 },
  { sport: "NBA", betType: "player_prop", teams: ["Houston Rockets", "Utah Jazz"], players: ["Alperen Sengun"], market: "Pts+Reb+Ast", line: 35.5, odds: "-110", description: "Sengun Over 35.5 PRA", confidence: 0.85 },
  { sport: "NBA", betType: "player_prop", teams: ["Boston Celtics", "Milwaukee Bucks"], players: ["Jaylen Brown"], market: "Three Pointers Made", line: 2.5, odds: "+110", description: "Brown Over 2.5 Threes", confidence: 0.85 },
  { sport: "NBA", betType: "player_prop", teams: ["Dallas Mavericks", "Orlando Magic"], players: ["Paolo Banchero"], market: "Steals", line: 1.5, odds: "+180", description: "Banchero Over 1.5 Steals", confidence: 0.8 },
  { sport: "NBA", betType: "player_prop", teams: ["Los Angeles Lakers", "Denver Nuggets"], players: ["Nikola Jokic"], market: "Blocks", line: 0.5, odds: "-130", description: "Jokic Over 0.5 Blocks", confidence: 0.85 },

  // ── NBA Team Bets ─────────────────────────────────────────────
  { sport: "NBA", betType: "moneyline", teams: ["Boston Celtics", "Milwaukee Bucks"], players: [], odds: "-150", description: "Celtics ML vs Bucks", confidence: 0.9 },
  { sport: "NBA", betType: "spread", teams: ["New York Knicks", "Chicago Bulls"], players: [], line: -8.5, odds: "-110", description: "Knicks -8.5 vs Bulls", confidence: 0.9 },
  { sport: "NBA", betType: "over_under", teams: ["Minnesota Timberwolves", "Philadelphia 76ers"], players: [], line: 215.5, odds: "-110", description: "Over 215.5 Wolves vs 76ers", confidence: 0.9 },

  // ── MLB Player Props (6 markets) ──────────────────────────────
  { sport: "MLB", betType: "player_prop", teams: ["New York Yankees", "Miami Marlins"], players: ["Aaron Judge"], market: "Home Runs", line: 0.5, odds: "+210", description: "Judge to Hit a HR", confidence: 0.85 },
  { sport: "MLB", betType: "player_prop", teams: ["New York Yankees", "Miami Marlins"], players: ["Giancarlo Stanton"], market: "Total Bases", line: 1.5, odds: "-120", description: "Stanton Over 1.5 TB", confidence: 0.85 },
  { sport: "MLB", betType: "player_prop", teams: ["Los Angeles Dodgers", "Washington Nationals"], players: ["Mookie Betts"], market: "Hits", line: 0.5, odds: "-180", description: "Betts Over 0.5 Hits", confidence: 0.9 },
  { sport: "MLB", betType: "player_prop", teams: ["Boston Red Sox", "San Diego Padres"], players: ["Wilyer Abreu"], market: "RBIs", line: 0.5, odds: "+120", description: "Abreu Over 0.5 RBIs", confidence: 0.85 },
  { sport: "MLB", betType: "player_prop", teams: ["Boston Red Sox", "San Diego Padres"], players: ["Roman Anthony"], market: "Stolen Bases", line: 0.5, odds: "+200", description: "Anthony Over 0.5 SB", confidence: 0.8 },
  { sport: "MLB", betType: "player_prop", teams: ["Houston Astros", "Athletics"], players: ["Framber Valdez"], market: "Strikeouts", line: 5.5, odds: "-115", description: "Valdez Over 5.5 K's", confidence: 0.85 },

  // ── MLB Team Bets ─────────────────────────────────────────────
  { sport: "MLB", betType: "moneyline", teams: ["Los Angeles Dodgers", "Washington Nationals"], players: [], odds: "-180", description: "Dodgers ML vs Nationals", confidence: 0.9 },
  { sport: "MLB", betType: "over_under", teams: ["New York Yankees", "Miami Marlins"], players: [], line: 8.5, odds: "-110", description: "Over 8.5 Yankees vs Marlins", confidence: 0.9 },
  { sport: "MLB", betType: "spread", teams: ["Houston Astros", "Athletics"], players: [], line: -1.5, odds: "+130", description: "Astros -1.5 vs Athletics", confidence: 0.9 },

  // ── NHL Player Props (5 markets) ──────────────────────────────
  { sport: "NHL", betType: "player_prop", teams: ["New York Rangers", "Carolina Hurricanes"], players: ["Alexis Lafreniere"], market: "Shots on Goal", line: 3.5, odds: "-120", description: "Lafreniere Over 3.5 SOG", confidence: 0.85 },
  { sport: "NHL", betType: "player_prop", teams: ["Edmonton Oilers", "Vancouver Canucks"], players: ["Connor McDavid"], market: "Points", line: 1.5, odds: "+110", description: "McDavid Over 1.5 Points", confidence: 0.85 },
  { sport: "NHL", betType: "player_prop", teams: ["Edmonton Oilers", "Vancouver Canucks"], players: ["Leon Draisaitl"], market: "Goals", line: 0.5, odds: "+120", description: "Draisaitl Over 0.5 Goals", confidence: 0.85 },
  { sport: "NHL", betType: "player_prop", teams: ["Toronto Maple Leafs", "Tampa Bay Lightning"], players: ["Auston Matthews"], market: "Shots on Goal", line: 4.5, odds: "-105", description: "Matthews Over 4.5 SOG", confidence: 0.85 },
  { sport: "NHL", betType: "player_prop", teams: ["Florida Panthers", "Boston Bruins"], players: ["Sergei Bobrovsky"], market: "Saves", line: 27.5, odds: "-115", description: "Bobrovsky Over 27.5 Saves", confidence: 0.85 },

  // ── NHL Team Bets ─────────────────────────────────────────────
  { sport: "NHL", betType: "moneyline", teams: ["Edmonton Oilers", "Vancouver Canucks"], players: [], odds: "-140", description: "Oilers ML vs Canucks", confidence: 0.9 },
  { sport: "NHL", betType: "spread", teams: ["Toronto Maple Leafs", "Tampa Bay Lightning"], players: [], line: -1.5, odds: "+160", description: "Leafs -1.5 vs Lightning", confidence: 0.85 },
  { sport: "NHL", betType: "over_under", teams: ["Florida Panthers", "Boston Bruins"], players: [], line: 5.5, odds: "-110", description: "Over 5.5 Panthers vs Bruins", confidence: 0.9 },

  // ── NFL Team Bets ─────────────────────────────────────────────
  { sport: "NFL", betType: "moneyline", teams: ["Kansas City Chiefs", "Buffalo Bills"], players: [], odds: "-130", description: "Chiefs ML vs Bills", confidence: 0.9 },
  { sport: "NFL", betType: "spread", teams: ["San Francisco 49ers", "Dallas Cowboys"], players: [], line: -3.5, odds: "-110", description: "49ers -3.5 vs Cowboys", confidence: 0.9 },
  { sport: "NFL", betType: "over_under", teams: ["Philadelphia Eagles", "Detroit Lions"], players: [], line: 48.5, odds: "-110", description: "Over 48.5 Eagles vs Lions", confidence: 0.9 },

  // ── Soccer ────────────────────────────────────────────────────
  { sport: "EPL", betType: "moneyline", teams: ["Arsenal", "Manchester City"], players: [], odds: "+180", description: "Arsenal ML vs Man City (EPL)", confidence: 0.85 },
  { sport: "MLS", betType: "moneyline", teams: ["Inter Miami", "LA Galaxy"], players: [], odds: "-120", description: "Inter Miami ML vs Galaxy (MLS)", confidence: 0.85 },

  // ── College ───────────────────────────────────────────────────
  { sport: "NCAAB", betType: "spread", teams: ["Duke Blue Devils", "North Carolina Tar Heels"], players: [], line: -4.5, odds: "-110", description: "Duke -4.5 vs UNC (CBB)", confidence: 0.85 },
  { sport: "NCAAF", betType: "over_under", teams: ["Alabama Crimson Tide", "Georgia Bulldogs"], players: [], line: 52.5, odds: "-110", description: "Over 52.5 Bama vs UGA (CFB)", confidence: 0.85 },

  // ── Golf ───────────────────────────────────────────────────────
  { sport: "Golf", betType: "moneyline", teams: ["The Masters"], players: ["Scottie Scheffler"], market: "Tournament Winner", odds: "+450", description: "Scheffler to win The Masters", confidence: 0.85 },
  { sport: "Golf", betType: "player_prop", teams: ["The Masters"], players: ["Rory McIlroy"], market: "Top 5", line: 5, odds: "+300", description: "McIlroy Top 5 at The Masters", confidence: 0.85 },

  // ── Edge cases ────────────────────────────────────────────────
  { sport: "Basketball", betType: "moneyline", teams: ["Knicks", "Bulls"], players: [], odds: "-200", description: "Knicks ML (short name)", confidence: 0.9 },
  { sport: "Hockey", betType: "moneyline", teams: ["Oilers", "Canucks"], players: [], odds: "-140", description: "Oilers ML (sport alias)", confidence: 0.85 },
  { sport: "MLB", betType: "moneyline", teams: ["Yankees", "Marlins"], players: [], odds: "-160", description: "Yankees ML (short name)", confidence: 0.9 },
  { sport: "NBA", betType: "parlay", teams: ["Celtics", "Knicks"], players: [], odds: "+450", description: "Parlay: Celtics + Knicks ML", confidence: 0.8 },
];

// Questions people would ask in the chat
const CHAT_QUESTIONS = [
  { q: "Show home vs away splits", sport: "NBA", teams: ["New York Knicks", "Chicago Bulls"], players: [], betType: "moneyline" },
  { q: "How do the starting pitchers match up?", sport: "MLB", teams: ["Los Angeles Dodgers", "Washington Nationals"], players: [], betType: "moneyline" },
  { q: "What about his shots?", sport: "NHL", teams: ["New York Rangers", "Carolina Hurricanes"], players: ["Alexis Lafreniere"], betType: "player_prop", market: "Shots on Goal" },
  { q: "Show me Jalen Brunson's last 10 games", sport: "NBA", teams: ["New York Knicks", "Chicago Bulls"], players: ["Jalen Brunson"], betType: "player_prop", market: "Points" },
  { q: "Compare scoring trends", sport: "NHL", teams: ["Edmonton Oilers", "Vancouver Canucks"], players: [], betType: "moneyline" },
  { q: "What about his stats last year?", sport: "MLB", teams: ["Boston Red Sox", "San Diego Padres"], players: ["Roman Anthony"], betType: "player_prop", market: "Stolen Bases" },
  { q: "How does Scheffler do on Amen Corner?", sport: "Golf", teams: ["The Masters"], players: ["Scottie Scheffler"], betType: "player_prop", market: "Tournament Winner" },
];

export async function GET(request: NextRequest) {
  const results: TestResult[] = [];
  const chatResults: { question: string; type: string; message: string }[] = [];
  const start = Date.now();

  // Run ALL bets + chat in one big parallel blast
  await Promise.all([
    ...TEST_BETS.map((bet) => testBet(results, bet)),
    ...CHAT_QUESTIONS.map((cq) => testChat(chatResults, cq)),
  ]);

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
  cq: { q: string; sport: string; teams: string[]; players?: string[]; betType?: string; market?: string }
) {
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: cq.q,
        extraction: {
          sport: cq.sport,
          betType: cq.betType || "moneyline",
          teams: cq.teams,
          players: cq.players || [],
          market: cq.market,
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

  // Chart counts per bet — shows what's actually rendering
  const chartDetail = passed.slice(0, 20).map((r) =>
    `${r.charts === 0 ? "\u26A0\uFE0F" : "\u2705"} **${r.bet}** — ${r.charts} charts, ${r.stats} stats (${((r.ms || 0) / 1000).toFixed(1)}s)`
  ).join("\n");
  if (chartDetail) {
    embeds.push({ title: "Chart Counts", color: 0x6366f1, fields: [{ name: "\u200b", value: chartDetail.slice(0, 1024), inline: false }], timestamp: new Date().toISOString() });
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
