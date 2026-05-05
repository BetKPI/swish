import { NextRequest, NextResponse } from "next/server";
import * as mlb from "@/lib/mlbstats";
import * as bdl from "@/lib/balldontlie";
import * as nhl from "@/lib/nhlstats";
import { fetchAllTeamData, fetchGolfLeaderboard } from "@/lib/espn";
import { getMarketContext } from "@/lib/markets";
import { fetchWithRetry } from "@/lib/fetch";
import { fetchMastersHistory, analyzeHoleHistory, analyzeAmenCorner, analyzeSundayScoring } from "@/lib/masters";
import { computeHitRate, computeTrend, computeConsistency } from "@/lib/stat-tools";

/**
 * Chat endpoint - two-step flow:
 * 1. AI decides if it can answer from existing data or needs a data fetch
 * 2. If fetch needed, we call the API, then AI generates the chart with real data
 */

async function callGemini(prompt: string, apiKey: string): Promise<string | null> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 3000 },
  });
  const headers = { "Content-Type": "application/json" };
  const MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"];

  for (const model of MODELS) {
    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: "POST", headers, body },
      1,
      2000
    );
    if (response.ok) {
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
    if (response.status === 503 || response.status === 429 || response.status === 404) {
      console.log(`[Chat] ${model} returned ${response.status}, trying fallback...`);
      continue;
    }
    return null;
  }
  return null;
}

function parseJSON(text: string): Record<string, unknown> {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  // Direct parse
  try { return JSON.parse(t); } catch { /* fall through */ }
  // Try to extract the largest balanced { ... } block
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const sub = t.slice(first, last + 1);
    try { return JSON.parse(sub); } catch { /* fall through */ }
  }
  // Strip code fences anywhere
  const cleaned = t
    .replace(/```(?:json)?/gi, "")
    .replace(/^[^{]*?(?=\{)/, "")
    .replace(/\}[^}]*$/, "}");
  if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
    return JSON.parse(cleaned);
  }
  throw new Error("non-json");
}

// Available data-fetching actions the AI can request
type FetchAction =
  | { action: "mlb_player"; playerName: string; season?: number }
  | { action: "mlb_pitcher_matchup"; team1: string; team2: string }
  | { action: "mlb_pitcher_h2h"; pitcher1Name: string; pitcher2Name: string; team1: string; team2: string }
  | { action: "nba_player"; playerName: string; season?: number }
  | { action: "nhl_player"; playerName: string; season?: string }
  | { action: "nhl_team_goalie"; teamName: string }
  | { action: "team_schedule"; sport: string; teamName: string }
  | { action: "golf_player"; playerName: string }
  | { action: "masters_hole"; playerName: string; hole?: number }
  | { action: "pga_tournament"; playerName: string; tournament?: string };

async function executeFetch(
  fetchReq: FetchAction,
  sport: string
): Promise<Record<string, unknown> | null> {
  try {
    switch (fetchReq.action) {
      case "mlb_player": {
        const player = await mlb.searchPlayer(fetchReq.playerName);
        if (!player) return null;
        const season = fetchReq.season;
        const [stats, gameLog, splits] = await Promise.all([
          mlb.getPlayerSeasonStats(player.id, season),
          mlb.getPlayerGameLog(player.id, season),
          mlb.getPlayerSplits(player.id, season),
        ]);
        return { player, seasonStats: stats, gameLog, splits, season: season || new Date().getFullYear() };
      }

      case "mlb_pitcher_matchup": {
        const team1 = await mlb.searchTeam(fetchReq.team1);
        const team2 = await mlb.searchTeam(fetchReq.team2);
        const pitchers: Record<string, unknown> = {};

        for (const [label, team] of [["team1", team1], ["team2", team2]] as const) {
          if (!team) { pitchers[label] = null; continue; }
          const pp = await mlb.getProbablePitchers((team as { id: number }).id);
          if (pp) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ppAny = pp as any;
            for (const key of ["homePitcher", "awayPitcher"] as const) {
              if (ppAny[key]?.id) {
                const data = await mlb.fetchPitcherData(ppAny[key].id);
                if (data) ppAny[key] = { ...ppAny[key], ...data };
              }
            }
          }
          pitchers[label] = { team, probablePitchers: pp };
        }
        return pitchers;
      }

      case "mlb_pitcher_h2h": {
        // Find both pitchers
        const p1 = await mlb.searchPlayer(fetchReq.pitcher1Name);
        const p2 = await mlb.searchPlayer(fetchReq.pitcher2Name);
        if (!p1 || !p2) return null;

        // Find both teams for cross-referencing
        const t1 = await mlb.searchTeam(fetchReq.team1);
        const t2 = await mlb.searchTeam(fetchReq.team2);
        if (!t1 || !t2) return null;

        const h2h = await mlb.getPitcherMatchupHistory(
          p1.id, p1.fullName, t1.id,
          p2.id, p2.fullName, t2.id
        );
        return h2h;
      }

      case "nba_player": {
        const player = await bdl.searchPlayer(fetchReq.playerName);
        if (!player) return null;
        const [avg, log] = await Promise.all([
          bdl.getSeasonAverages(player.id, fetchReq.season),
          bdl.getPlayerGameLog(player.id, 15),
        ]);
        return { player, seasonAverages: avg, gameLog: log, season: fetchReq.season || new Date().getFullYear() };
      }

      case "nhl_player": {
        const player = await nhl.searchPlayer(fetchReq.playerName);
        if (!player) return null;
        const [stats, log] = await Promise.all([
          nhl.getPlayerStats(player.playerId),
          nhl.getPlayerGameLog(player.playerId, fetchReq.season),
        ]);
        return { player, stats, gameLog: log, season: fetchReq.season || "current" };
      }

      case "nhl_team_goalie": {
        const abbrev = nhl.findTeamAbbrev(fetchReq.teamName);
        if (!abbrev) return null;
        const goalieData = await nhl.getTeamStartingGoalie(abbrev);
        if (!goalieData) return null;
        return {
          goalie: {
            name: `${goalieData.player.firstName?.default || ""} ${goalieData.player.lastName?.default || ""}`.trim(),
            team: abbrev,
            position: "G",
          },
          stats: goalieData.stats,
          gameLog: goalieData.gameLog,
        };
      }

      case "team_schedule": {
        const data = await fetchAllTeamData(sport, [fetchReq.teamName]);
        return data[fetchReq.teamName] as Record<string, unknown> || null;
      }

      case "golf_player": {
        const data = await fetchGolfLeaderboard([fetchReq.playerName]);
        const players = data._players as Record<string, unknown> | undefined;
        const playerInfo = players?.[fetchReq.playerName] as Record<string, unknown> | null;
        // Also include leaderboard context and tournament info
        return {
          player: playerInfo,
          tournament: data.tournament,
          status: data.status,
          leaderboard: (data.leaderboard as unknown[])?.slice(0, 10),
        };
      }

      case "masters_hole": {
        const history = await fetchMastersHistory(fetchReq.playerName);
        if (!history) return null;
        if (fetchReq.hole) {
          return { player: fetchReq.playerName, hole: analyzeHoleHistory(history, fetchReq.hole), amenCorner: analyzeAmenCorner(history) };
        }
        return {
          player: fetchReq.playerName,
          amenCorner: analyzeAmenCorner(history),
          sundays: analyzeSundayScoring(history),
          allHoles: Array.from({ length: 18 }, (_, i) => analyzeHoleHistory(history, i + 1)),
        };
      }

      case "pga_tournament": {
        // Try PGA history module first, fall back to Masters + leaderboard
        try {
          const { getPlayerTournamentHistory } = await import("@/lib/pga-history");
          const result = getPlayerTournamentHistory(fetchReq.playerName, fetchReq.tournament);
          if (result) return result;
        } catch { /* pga-history module not available yet, fall through */ }
        // Fall back: if Masters-related, use Masters history
        const t = (fetchReq.tournament || "").toLowerCase();
        if (t.includes("master") || t.includes("augusta")) {
          const history = await fetchMastersHistory(fetchReq.playerName);
          if (history) {
            return {
              player: fetchReq.playerName,
              tournament: "The Masters",
              amenCorner: analyzeAmenCorner(history),
              sundays: analyzeSundayScoring(history),
              allHoles: Array.from({ length: 18 }, (_, i) => analyzeHoleHistory(history, i + 1)),
            };
          }
        }
        // Fall back to current leaderboard
        const data = await fetchGolfLeaderboard([fetchReq.playerName]);
        const players = data._players as Record<string, unknown> | undefined;
        return {
          player: players?.[fetchReq.playerName] || null,
          tournament: data.tournament,
          status: data.status,
          leaderboard: (data.leaderboard as unknown[])?.slice(0, 10),
        };
      }

      default:
        return null;
    }
  } catch (e) {
    console.error("[Chat] Fetch error:", e);
    return null;
  }
}

async function logChatToDiscord(
  question: string,
  extraction: { sport?: string; betType?: string; teams?: string[]; description?: string },
  result: "chart" | "no_data" | "fetched" | "error",
  detail?: string
) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const colors: Record<string, number> = {
    chart: 0x10b981,    // green - answered
    fetched: 0x6366f1,  // purple - had to fetch new data
    no_data: 0xf59e0b,  // yellow - couldn't answer
    error: 0xef4444,    // red - crashed
  };

  const icons: Record<string, string> = {
    chart: "\u2705", fetched: "\u{1F50D}", no_data: "\u{1F6AB}", error: "\u274C",
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `${icons[result] || "?"} Chat: "${question.slice(0, 80)}"`,
          color: colors[result] || 0x6366f1,
          fields: [
            { name: "Bet", value: extraction.description || `${extraction.sport} ${extraction.betType}`, inline: true },
            { name: "Teams", value: extraction.teams?.join(" vs ") || "?", inline: true },
            { name: "Result", value: result, inline: true },
            ...(detail ? [{ name: "Detail", value: detail.slice(0, 200), inline: false }] : []),
          ],
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch { /* silent */ }
}

export async function POST(request: NextRequest) {
  try {
    const { message, extraction, computedData, swishScore, insights, history } = await request.json();
    const chatHistory = Array.isArray(history) ? history : [];

    if (!message || !extraction) {
      return NextResponse.json({ error: "Missing message or extraction" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const sport = extraction.sport?.toUpperCase() || "";

    // Step 1: Ask AI what it needs
    const currentYear = new Date().getFullYear();
    const players = extraction.players?.length ? extraction.players.join(", ") : "none";
    const isGolf = ["GOLF", "PGA", "PGA TOUR", "THE MASTERS", "MASTERS"].includes(sport);
    const isMasters = sport === "THE MASTERS" || sport === "MASTERS" || (extraction.description || "").toLowerCase().includes("master");

    // Pre-compute stat model results from existing data so the AI
    // references deterministic calculations instead of doing its own math.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cd = computedData as any;
    let statToolsContext = "";
    if (cd) {
      const toolResults: string[] = [];
      // Player prop data - compute hit rate, trend, consistency
      const playerData = cd._players || cd.playerData;
      if (playerData) {
        for (const [name, pData] of Object.entries(playerData)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = pData as any;
          const gameLogs = p?.gameLogs || p?.gameLog;
          if (Array.isArray(gameLogs) && gameLogs.length > 0) {
            const pa = p?.propAnalysis;
            const stat = pa?.stat;
            if (stat) {
              const values = gameLogs.map((g: Record<string, number>) => g[stat]).filter((v: unknown) => typeof v === "number");
              if (values.length > 0) {
                const line = pa?.line ?? extraction.line;
                if (line != null) {
                  const hr = computeHitRate(values, line);
                  toolResults.push(`${name} hit rate at ${line}: ${JSON.stringify(hr.result)}`);
                }
                const trend = computeTrend(values);
                toolResults.push(`${name} trend: ${JSON.stringify(trend.result)}`);
                const cons = computeConsistency(values);
                toolResults.push(`${name} consistency: ${JSON.stringify(cons.result)}`);
              }
            }
          }
        }
      }
      // Team metrics - trends from recent games
      const teamMetrics = cd.teamMetrics;
      if (teamMetrics) {
        for (const [name, tm] of Object.entries(teamMetrics)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const t = tm as any;
          if (Array.isArray(t?.recentGames) && t.recentGames.length >= 3) {
            const totals = t.recentGames.map((g: { totalPoints: number }) => g.totalPoints);
            const margins = t.recentGames.map((g: { margin: number }) => g.margin);
            toolResults.push(`${name} total-points trend: ${JSON.stringify(computeTrend(totals).result)}`);
            toolResults.push(`${name} margin trend: ${JSON.stringify(computeTrend(margins).result)}`);
          }
        }
      }
      if (toolResults.length > 0) {
        statToolsContext = `\nDETERMINISTIC STAT MODEL RESULTS (pre-computed - reference these exact numbers, do NOT re-calculate):\n${toolResults.join("\n")}\n`;
      }
    }

    // Build conversation context string for drill-down
    const conversationContext = chatHistory.length > 0
      ? `\nCONVERSATION SO FAR (the user is drilling down - each message builds on the last):\n${chatHistory.map((m: { role: string; content: string; chartTitle?: string; chartType?: string }) =>
          m.role === "user"
            ? `  USER: "${m.content}"`
            : `  ASSISTANT: ${m.content}${m.chartTitle ? ` [showed ${m.chartType} chart: "${m.chartTitle}"]` : ""}`
        ).join("\n")}\n`
      : "";

    // Build explicit player context for pronoun resolution
    const primaryPlayer = extraction.players?.[0] || "";
    const playerContext = primaryPlayer
      ? `\nPRIMARY PLAYER: "${primaryPlayer}" - when the user says "he", "his", "him", "their", "the player", or any pronoun, they mean ${primaryPlayer}. ALWAYS resolve pronouns to this player.`
      : "";

    const triagePrompt = `You are a sports analytics assistant. The user analyzed a ${extraction.sport} ${extraction.betType} bet (${extraction.teams?.join(" vs ")}).
${extraction.players?.length ? `Players in this bet: ${players}` : ""}${playerContext}
${extraction.market ? `Market: ${extraction.market}` : ""}
${extraction.line != null ? `Line: ${extraction.line}` : ""}
${extraction.description ? `Bet description: ${extraction.description}` : ""}
${isGolf ? `\nTHIS IS A GOLF BET. For golf questions, prefer "masters_hole" (for Masters/Augusta history) or "golf_player" (for current tournament data). Masters hole-by-hole data covers 2019-2025 and includes every round at Augusta.` : ""}
${isMasters ? `This is a MASTERS bet at Augusta National. You have access to rich hole-by-hole historical data via "masters_hole" action.` : ""}

TODAY'S DATE: ${new Date().toISOString().slice(0, 10)} (current season: ${currentYear})
${conversationContext}
SWISH SCORE (= probability the bet hits, 0-10 scale):
${swishScore ? `Score: ${swishScore.score}/10 (${swishScore.label}) - ${swishScore.detail}` : "Not computed"}
${insights ? `\nMODEL INSIGHTS (deterministic, derived from raw data - reference these instead of recomputing):
- Verdict: ${insights.verdict || "n/a"}
- Hit probability: ${typeof insights.probability === "number" ? `${Math.round(insights.probability * 100)}%` : "n/a"}
- Projection: ${insights.projection ? `${insights.projection.proj} (${insights.projection.diff > 0 ? "+" : ""}${insights.projection.diff} vs line) - ${insights.projection.lean}` : "n/a"}
- Edge bullets:
${(insights.bullets || []).map((b: { label: string; value: string; tone: string }) => `  - ${b.label}: ${b.value} [${b.tone}]`).join("\n")}
${insights.flags?.length ? `- Flags: ${insights.flags.join("; ")}` : ""}` : ""}
${statToolsContext}
${(() => {
  // Surface the rich MLB history signals explicitly so the chat LLM
  // knows what it can answer without fetching more data. The user can
  // ask "what's the weather", "what does Cole throw", "vs LHP split"
  // and the answer is already loaded.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cdAny = computedData as any;
  const h = cdAny?._mlbHistory;
  if (!h) return "";
  const lines: string[] = ["RICH MLB SIGNALS LOADED (you can answer questions from these directly):"];
  if (h.weather) {
    const w = h.weather;
    lines.push(`- Weather at ${w.parkName}: ${w.tempF}°F, wind ${w.windMph} mph ${w.windDir}, ${w.humidity}% humidity, ${w.precipProb}% rain, roof=${w.roof}`);
  }
  for (const [name, ars] of Object.entries(h.pitcherArsenal || {})) {
    if (!ars) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pitches = (ars as any).pitches?.slice(0, 5) || [];
    if (pitches.length === 0) continue;
    const mix = pitches.map((p: { pitchType: string; usagePct: number; whiffPct: number; woba: number }) =>
      `${p.pitchType} ${Math.round(p.usagePct)}% (whiff ${p.whiffPct.toFixed(1)}%, woba ${p.woba.toFixed(3)})`
    ).join(" | ");
    lines.push(`- ${name} pitch arsenal: ${mix}`);
  }
  for (const [name, sp] of Object.entries(h.platoonSplits || {})) {
    if (!sp) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = sp as any;
    if (s.vsL || s.vsR) {
      const parts: string[] = [];
      if (s.vsL) parts.push(`vs LHP: ${s.vsL.avg.toFixed(3)} BA, ${s.vsL.slg.toFixed(3)} SLG, ${s.vsL.hr} HR in ${s.vsL.ab} AB`);
      if (s.vsR) parts.push(`vs RHP: ${s.vsR.avg.toFixed(3)} BA, ${s.vsR.slg.toFixed(3)} SLG, ${s.vsR.hr} HR in ${s.vsR.ab} AB`);
      lines.push(`- ${name} platoon splits: ${parts.join(" | ")}`);
    }
  }
  for (const [name, sp] of Object.entries(h.pitcherPlatoon || {})) {
    if (!sp) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = sp as any;
    const parts: string[] = [];
    if (s.vsL) parts.push(`vs LHB K%: ${(s.vsL.kPct * 100).toFixed(1)}%`);
    if (s.vsR) parts.push(`vs RHB K%: ${(s.vsR.kPct * 100).toFixed(1)}%`);
    if (parts.length) lines.push(`- ${name} pitcher splits: ${parts.join(" | ")}`);
  }
  for (const [name, ev] of Object.entries(h.exitVelo || {})) {
    if (!ev) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = ev as any;
    if (!e.available) continue;
    const parts: string[] = [];
    if (e.xba != null && e.ba != null) parts.push(`xBA ${e.xba.toFixed(3)} vs BA ${e.ba.toFixed(3)}`);
    if (e.xslg != null && e.slg != null) parts.push(`xSLG ${e.xslg.toFixed(3)} vs SLG ${e.slg.toFixed(3)}`);
    if (e.xwoba != null) parts.push(`xwOBA ${e.xwoba.toFixed(3)}`);
    if (parts.length) lines.push(`- ${name} Statcast: ${parts.join(", ")}`);
  }
  return lines.length > 1 ? `\n${lines.join("\n")}\n` : "";
})()}
EXISTING DATA WE ALREADY HAVE:
${JSON.stringify(computedData, null, 2)}

USER QUESTION: "${message}"

Decide: can you answer this from the existing data, or do you need to fetch more?
NOTE: Futures bets may have only ONE team and no opponent - this is normal. Use standings, win%, and team record from existing data to answer.

Respond with ONLY valid JSON in one of these formats:

FORMAT 1 - You CAN answer from existing data:
{
  "need_fetch": false,
  "chart": {
    "type": "line" | "bar" | "distribution" | "table",
    "title": "Chart title",
    "relevance": "Why this matters (1 sentence)",
    "data": [array of data objects with consistent camelCase keys],
    "xKey": "key for x axis",
    "yKeys": ["keys for y axis"]
  },
  "message": "Brief explanation (1 sentence)"
}
For tables use "columns": [{"key":"k","label":"Label"}] instead of xKey/yKeys.

FORMAT 2 - You NEED more data:
{
  "need_fetch": true,
  "fetch": {
    "action": one of "mlb_player", "mlb_pitcher_matchup", "mlb_pitcher_h2h", "nba_player", "nhl_player", "nhl_team_goalie", "team_schedule", "golf_player", "masters_hole", "pga_tournament",
    "playerName": "name" (for player actions),
    "season": year as number (e.g. ${currentYear - 1} for last season - INCLUDE THIS when user asks about a previous season or "last year"),
    "pitcher1Name": "name" (for pitcher_h2h - use actual pitcher names from existing data if available),
    "pitcher2Name": "name" (for pitcher_h2h),
    "team1": "team" (for pitcher_matchup or pitcher_h2h),
    "team2": "team" (for pitcher_matchup or pitcher_h2h),
    "sport": "sport" (for team_schedule),
    "teamName": "team" (for team_schedule or nhl_team_goalie),
    "tournament": "tournament name" (for pga_tournament - e.g. "US Open", "PGA Championship", "The Open")
  },
  "message": "Fetching that data now..."
}

FORMAT 3 - The data simply doesn't exist in any free sports API:
{
  "need_fetch": false,
  "no_data": true,
  "message": "Brief explanation of why we can't get this (1-2 sentences)"
}

FORMAT 4 - The user is asking a non-data question (about the app, feedback, how things work, or general conversation):
{
  "need_fetch": false,
  "no_data": true,
  "message": "Helpful response to their question (1-2 sentences). If it's about this bet, redirect them to ask a data question."
}

RULES:
- DRILL-DOWN / ITERATIVE FILTERING: The user may ask follow-up questions that NARROW or FILTER previous results. ALWAYS produce a new chart that reflects the narrowed view, not just text. Recognized filters include:
  • Home/away: "just home games", "road only", "at home" → filter by home/away flag in game data
  • Recency: "last 5 games", "last 10", "most recent" → slice game data
  • Season type: "playoffs only", "regular season only", "postseason" → filter by seasonType field
  • Opponent: "vs the Celtics", "against Boston" → filter by opponent name
  • Season: "last year", "2024-25 season" → re-fetch with prior season parameter
  • Time range: "since January", "last 2 months" → filter by date
  • Combined: "home games in the playoffs" → apply multiple filters
  When the data has these fields (home, opponent, seasonType, date), filter from existing data (FORMAT 1). When you need richer data, re-fetch with the appropriate action (FORMAT 2).
- BE PROACTIVE: Don't just read back what the bet is. ANALYZE it. If the user asks a vague question like "what do you think" or "how does he look", give them data-driven analysis with a chart. Fetch data if you need to - that's what you're here for.
- COMMON CHART REQUESTS: Users often ask for these using casual language. ALWAYS produce a chart (FORMAT 1) from existing data:
  • "game margin" / "margin chart" / "point diff" → bar chart of game-by-game margin from recentGames
  • "scoring trend" / "season chart" → line chart of scoring across ALL available games
  • "full season" / "all games" / "season stats" → use ALL data in existing recentGames, not a subset
  • "head to head" / "matchup" → table comparing teams from existing data
  • "last season" / "previous season" → re-fetch with prior season year (FORMAT 2)
  • "how it looks now" / "game over" / "did it hit" → check gameStatus and recent scores in data, build a result summary chart
  If the data exists in computedData.teamMetrics or recentGames, build the chart. Do NOT say no_data for requests that can be answered from existing team/player data.
- IMPORTANT: The user's question is ALWAYS about the existing bet/player/team shown above unless they explicitly name someone else. "What about his shots?", "show me rebounds", "how about assists?" - they mean the SAME player from the bet. Use existing data or fetch for the SAME player. NEVER ask who they mean.
- PLAYER NAME RESOLUTION: When the user says a first name only (e.g., "Alexis", "Cooper", "Nathan"), match it to the player listed in "Players in this bet" above. Use the FULL player name in any fetch action. If the bet has "Alexis Lafreniere" and user says "Alexis", use "Alexis Lafreniere".
- If the existing data contains recentGames with home/away flags, you CAN build home/away split charts (FORMAT 1). Team records, game logs, and scoring data in the existing data are chartable - don't say no_data if the data is sitting right there.
- For FORMAT 1, ONLY use numbers from the existing data. Never invent.
- GOLF: For ANY golf question, ALWAYS fetch data. Available actions:
  • "masters_hole" - Masters/Augusta hole-by-hole history 2019-2025 (Amen Corner, Sunday scoring, all 18 holes)
  • "pga_tournament" - Historical results at specific major tournaments (US Open, PGA Championship, The Open). Use when user asks "how does he do at the US Open" or "his major history". Include "tournament" field with the tournament name.
  • "golf_player" - Current tournament position and live leaderboard
  For Masters questions, prefer "masters_hole". For other tournament history, use "pga_tournament". For current/live data, use "golf_player".
- For pitcher matchups between two MLB teams, use "mlb_pitcher_matchup".
- For historical H2H between two pitchers, use "mlb_pitcher_h2h". Extract pitcher names from existing data if available.
- For individual player lookups, use the sport-specific player action. If the user doesn't name a player, use the player from the existing bet context.
- For NHL goalie stats, use "nhl_team_goalie" with the team name.
- SEASON/YEAR INFERENCE: "last year"/"last season" → ${currentYear - 1}. For NHL, format is "20242025". If user says a year number, re-fetch with that season.
- We CAN fetch historical stats for any past MLB/NBA/NHL season - do NOT return no_data for past season requests.
- Data keys must be camelCase.
- Only use FORMAT 3 for things genuinely unavailable (weather, referee stats, injury reports, real-time odds, etc.) - NOT for stats, splits, game logs, or trends which we can always fetch or compute.
- SWISH SCORE: If the user asks "what's the score", "is this a good bet", "what do you think", or mentions the Swish Score - reference the score above and explain what's driving it (hit rate, trend, consistency, etc). The score is computed deterministically from real data, not from AI judgment. Explain the data factors.
- FUTURES BETS: For bets like "win the World Series", "win the AL", "win the division", the existing data will have standings snapshots and team records. Build a table or chart from that data showing current standings position, win%, and recent trajectory. There may be only ONE team (no opponent) - that's normal for futures. Use existing data to show their path to the title. If the user asks about championship history, use "team_schedule" to fetch more data.`;

    const triageText = await callGemini(triagePrompt, apiKey);
    if (!triageText) {
      await logChatToDiscord(message, extraction, "no_data", "Gemini returned empty");
      return NextResponse.json({ type: "no_data", message: "I didn't catch that - try asking about the stats, trends, or matchup for this bet." });
    }

    let triage: Record<string, unknown>;
    try {
      triage = parseJSON(triageText);
    } catch {
      // Gemini returned non-JSON - treat as a text answer
      await logChatToDiscord(message, extraction, "no_data", "Gemini returned non-JSON");
      return NextResponse.json({ type: "no_data", message: triageText.slice(0, 300) });
    }

    // Case 1: Can answer from existing data
    if (!triage.need_fetch && !triage.no_data && triage.chart) {
      await logChatToDiscord(message, extraction, "chart", triage.message as string);
      return NextResponse.json({
        type: "chart",
        message: triage.message || "Here you go.",
        chart: triage.chart,
      });
    }

    // Case 3: Data doesn't exist
    if (triage.no_data) {
      await logChatToDiscord(message, extraction, "no_data", triage.message as string);
      return NextResponse.json({
        type: "no_data",
        message: triage.message || "We don't have the data for that.",
      });
    }

    // Case 2: Need to fetch data
    if (triage.need_fetch && triage.fetch) {
      console.log(`[Chat] Fetching: ${JSON.stringify(triage.fetch)}`);
      const fetchedData = await executeFetch(triage.fetch as FetchAction, sport);

      if (!fetchedData) {
        logChatToDiscord(message, extraction, "no_data", `Fetch failed: ${JSON.stringify(triage.fetch)}`);
        return NextResponse.json({
          type: "no_data",
          message: "We tried to pull that data but couldn't find it. The player or team might not be in our system.",
        });
      }

      // Step 2: Generate chart from fetched data
      const chartPrompt = `You are a sports analytics assistant. The user asked: "${message}"

THEIR BET: ${extraction.description || `${extraction.sport} ${extraction.betType}`}
${extraction.players?.length ? `Player: ${extraction.players.join(", ")}` : ""}
${extraction.market ? `Market: ${extraction.market}` : ""}
${extraction.line != null ? `Line: ${extraction.line}` : ""}
${conversationContext}
We just fetched this data:
${JSON.stringify(fetchedData, null, 2)}

Create a chart that ANALYZES this data in the context of their bet and conversation. If the user is drilling down (e.g. "just home games", "last 5 games", "without player X"), FILTER the data accordingly and show only the filtered subset. Don't just display raw numbers - tell them something useful about whether the data supports or undermines their bet. Respond with ONLY valid JSON:
{
  "type": "chart",
  "message": "Brief explanation of what the chart shows (1 sentence)",
  "chart": {
    "type": "line" | "bar" | "distribution" | "table",
    "title": "Chart title",
    "relevance": "Why this matters",
    "data": [array of data objects with consistent camelCase keys],
    "xKey": "key for x axis",
    "yKeys": ["keys for y axis"]
  }
}
For tables use "columns": [{"key":"k","label":"Label"}] instead of xKey/yKeys.

RULES:
- ONLY use data from above. Do not invent numbers.
- If the user is filtering/narrowing, filter the fetched data and chart ONLY the filtered subset. Title the chart to reflect the filter. Recognized filters: home/away, recency (last N), playoffs/regular season, vs specific opponent, date range. Combine filters when asked (e.g. "home playoff games" → filter both).
- Make it relevant to the bet.
- Data keys must be camelCase.`;

      const chartText = await callGemini(chartPrompt, apiKey);
      if (!chartText) {
        logChatToDiscord(message, extraction, "error", "Gemini returned empty after data fetch");
        return NextResponse.json({
          type: "no_data",
          message: "Got the data but couldn't generate the chart - try rephrasing.",
        });
      }

      const chartResult = parseJSON(chartText);
      await logChatToDiscord(message, extraction, "fetched", `Action: ${(triage.fetch as Record<string,unknown>).action}`);
      return NextResponse.json(chartResult);
    }

    // Fallback
    await logChatToDiscord(message, extraction, "no_data", "Fell through to fallback");
    return NextResponse.json({
      type: "no_data",
      message: triage.message || "Not sure how to handle that - try a different question.",
    });
  } catch (error) {
    console.error("Chat error:", error);
    try {
      const body = await request.clone().json().catch(() => ({}));
      logChatToDiscord(body.message || "?", body.extraction || {}, "error", (error as Error).message);
    } catch { /* silent */ }
    return NextResponse.json({
      type: "no_data",
      message: "Something went wrong - try again.",
    });
  }
}
