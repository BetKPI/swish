import { NextRequest, NextResponse } from "next/server";
import * as mlb from "@/lib/mlbstats";
import * as bdl from "@/lib/balldontlie";
import * as nhl from "@/lib/nhlstats";
import { fetchAllTeamData } from "@/lib/espn";
import { getMarketContext } from "@/lib/markets";
import { fetchWithRetry } from "@/lib/fetch";

/**
 * Chat endpoint — two-step flow:
 * 1. AI decides if it can answer from existing data or needs a data fetch
 * 2. If fetch needed, we call the API, then AI generates the chart with real data
 */

async function callGemini(prompt: string, apiKey: string): Promise<string | null> {
  const response = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 3000 },
      }),
    },
    2,
    3000
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

function parseJSON(text: string): Record<string, unknown> {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(t);
}

// Available data-fetching actions the AI can request
type FetchAction =
  | { action: "mlb_player"; playerName: string; season?: number }
  | { action: "mlb_pitcher_matchup"; team1: string; team2: string }
  | { action: "mlb_pitcher_h2h"; pitcher1Name: string; pitcher2Name: string; team1: string; team2: string }
  | { action: "nba_player"; playerName: string; season?: number }
  | { action: "nhl_player"; playerName: string; season?: string }
  | { action: "team_schedule"; sport: string; teamName: string };

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

      case "team_schedule": {
        const data = await fetchAllTeamData(sport, [fetchReq.teamName]);
        return data[fetchReq.teamName] as Record<string, unknown> || null;
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
    chart: 0x10b981,    // green — answered
    fetched: 0x6366f1,  // purple — had to fetch new data
    no_data: 0xf59e0b,  // yellow — couldn't answer
    error: 0xef4444,    // red — crashed
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
    const { message, extraction, computedData } = await request.json();

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
    const triagePrompt = `You are a sports analytics assistant. The user analyzed a ${extraction.sport} ${extraction.betType} bet (${extraction.teams?.join(" vs ")}).
${extraction.players?.length ? `Players in this bet: ${players}` : ""}
${extraction.market ? `Market: ${extraction.market}` : ""}
${extraction.line != null ? `Line: ${extraction.line}` : ""}

TODAY'S DATE: ${new Date().toISOString().slice(0, 10)} (current season: ${currentYear})

EXISTING DATA WE ALREADY HAVE:
${JSON.stringify(computedData, null, 2)}

USER QUESTION: "${message}"

Decide: can you answer this from the existing data, or do you need to fetch more?

Respond with ONLY valid JSON in one of these formats:

FORMAT 1 — You CAN answer from existing data:
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

FORMAT 2 — You NEED more data:
{
  "need_fetch": true,
  "fetch": {
    "action": one of "mlb_player", "mlb_pitcher_matchup", "mlb_pitcher_h2h", "nba_player", "nhl_player", "team_schedule",
    "playerName": "name" (for player actions),
    "season": year as number (e.g. ${currentYear - 1} for last season — INCLUDE THIS when user asks about a previous season or "last year"),
    "pitcher1Name": "name" (for pitcher_h2h — use actual pitcher names from existing data if available),
    "pitcher2Name": "name" (for pitcher_h2h),
    "team1": "team" (for pitcher_matchup or pitcher_h2h),
    "team2": "team" (for pitcher_matchup or pitcher_h2h),
    "sport": "sport" (for team_schedule),
    "teamName": "team" (for team_schedule)
  },
  "message": "Fetching that data now..."
}

FORMAT 3 — The data simply doesn't exist in any free sports API:
{
  "need_fetch": false,
  "no_data": true,
  "message": "Brief explanation of why we can't get this (1-2 sentences)"
}

RULES:
- IMPORTANT: The user's question is ALWAYS about the existing bet/player/team shown above unless they explicitly name someone else. "What about his shots?", "show me rebounds", "how about assists?" — they mean the SAME player from the bet. Use existing data or fetch for the SAME player. NEVER ask who they mean.
- If the existing data contains recentGames with home/away flags, you CAN build home/away split charts (FORMAT 1). Team records, game logs, and scoring data in the existing data are chartable — don't say no_data if the data is sitting right there.
- For FORMAT 1, ONLY use numbers from the existing data. Never invent.
- For pitcher matchups between two MLB teams (who is starting, season stats), use "mlb_pitcher_matchup".
- For historical head-to-head between two specific pitchers (their records against each other's teams, games they both started), use "mlb_pitcher_h2h". Extract pitcher names from the existing data if available (e.g. probablePitchers), otherwise from user's message.
- For individual player lookups, use the sport-specific player action. If the user doesn't name a player, use the player from the existing bet context (see "Players in this bet" above).
- When the user says "last year", "last season", or references a past year, include "season" in the fetch request with the correct year number.
- We CAN fetch historical stats for any past MLB/NBA/NHL season — do NOT return no_data for past season requests. Use FORMAT 2 with the season parameter.
- Data keys must be camelCase.
- Only use FORMAT 3 for things genuinely unavailable (weather, referee stats, injury reports, real-time odds, etc.) — NOT for stats, splits, game logs, or trends which we can always fetch or compute.`;

    const triageText = await callGemini(triagePrompt, apiKey);
    if (!triageText) {
      return NextResponse.json({ type: "no_data", message: "Couldn't process that — try rephrasing." });
    }

    const triage = parseJSON(triageText);

    // Case 1: Can answer from existing data
    if (!triage.need_fetch && !triage.no_data && triage.chart) {
      logChatToDiscord(message, extraction, "chart", triage.message as string);
      return NextResponse.json({
        type: "chart",
        message: triage.message || "Here you go.",
        chart: triage.chart,
      });
    }

    // Case 3: Data doesn't exist
    if (triage.no_data) {
      logChatToDiscord(message, extraction, "no_data", triage.message as string);
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

We just fetched this data for them:
${JSON.stringify(fetchedData, null, 2)}

Original bet context: ${extraction.sport} ${extraction.betType} — ${extraction.teams?.join(" vs ")}

Create a chart from this data. Respond with ONLY valid JSON:
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
- Make it relevant to the bet.
- Data keys must be camelCase.`;

      const chartText = await callGemini(chartPrompt, apiKey);
      if (!chartText) {
        logChatToDiscord(message, extraction, "error", "Gemini returned empty after data fetch");
        return NextResponse.json({
          type: "no_data",
          message: "Got the data but couldn't generate the chart — try rephrasing.",
        });
      }

      const chartResult = parseJSON(chartText);
      logChatToDiscord(message, extraction, "fetched", `Action: ${(triage.fetch as Record<string,unknown>).action}`);
      return NextResponse.json(chartResult);
    }

    // Fallback
    logChatToDiscord(message, extraction, "no_data", "Fell through to fallback");
    return NextResponse.json({
      type: "no_data",
      message: triage.message || "Not sure how to handle that — try a different question.",
    });
  } catch (error) {
    console.error("Chat error:", error);
    try {
      const body = await request.clone().json().catch(() => ({}));
      logChatToDiscord(body.message || "?", body.extraction || {}, "error", (error as Error).message);
    } catch { /* silent */ }
    return NextResponse.json({
      type: "no_data",
      message: "Something went wrong — try again.",
    });
  }
}
