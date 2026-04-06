/**
 * NHL First Goal Scorer data from NHL API.
 *
 * Uses free api-web.nhle.com endpoints (no API key) to extract:
 * - First goal scorer per game from play-by-play feeds
 * - Per-player first goal rates
 * - Top first goal scorers across recent games
 *
 * Data is cached in-memory with 6h TTL.
 */

import { cachedFetch, TTL } from "./fetch";

const BASE = "https://api-web.nhle.com/v1";

// ── Types ──────────────────────────────────────────────────────────

export interface FirstGoalPlayerProfile {
  name: string;
  firstGoalCount: number;
  firstGoalRate: number;
  goalsPerGame: number;
  shootingPct: number;
  recentGames: {
    gameId: number;
    date: string;
    opponent: string;
    goals: number;
    wasFirstGoalScorer: boolean;
  }[];
}

export interface TopFirstScorer {
  name: string;
  rate: number;
  count: number;
}

export interface FirstGoalData {
  player: FirstGoalPlayerProfile | null;
  topFirstScorers: TopFirstScorer[];
}

// ── Internal types ────────────────────────────────────────────────

interface FirstGoalRecord {
  gameId: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  scorerName: string;
  scorerPlayerId: number;
  period: number;
  timeInPeriod: string;
}

// ── In-memory cache ───────────────────────────────────────────────

let _fgCache: {
  records: FirstGoalRecord[];
  lastUpdated: number;
} | null = null;

// ── Internals ─────────────────────────────────────────────────────

/**
 * Get recent completed game IDs from the NHL schedule.
 * Fetches the weekly schedule around today.
 */
async function getRecentGameIds(
  teamAbbrevs: string[],
  limit: number = 30
): Promise<{ gameId: number; date: string; homeAbbrev: string; awayAbbrev: string }[]> {
  try {
    // Fetch current week + recent weeks by going back in time
    const games: { gameId: number; date: string; homeAbbrev: string; awayAbbrev: string }[] = [];

    // Try multiple week offsets to get enough games
    for (let weekOffset = 0; weekOffset <= 4 && games.length < limit; weekOffset++) {
      const dateStr = new Date(
        Date.now() - weekOffset * 7 * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .slice(0, 10);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await cachedFetch(
        `${BASE}/schedule/${dateStr}`,
        TTL.LONG
      );
      if (!data?.gameWeek) continue;

      for (const day of data.gameWeek) {
        for (const game of day.games || []) {
          // Only include completed games
          const state = game.gameState;
          if (state !== "OFF" && state !== "FINAL") continue;

          const homeAbbrev = game.homeTeam?.abbrev || "";
          const awayAbbrev = game.awayTeam?.abbrev || "";

          // If teamAbbrevs provided, filter to games involving those teams
          if (
            teamAbbrevs.length > 0 &&
            !teamAbbrevs.includes(homeAbbrev) &&
            !teamAbbrevs.includes(awayAbbrev)
          ) {
            continue;
          }

          // Avoid duplicates
          if (!games.some((g) => g.gameId === game.id)) {
            games.push({
              gameId: game.id,
              date: day.date || "",
              homeAbbrev,
              awayAbbrev,
            });
          }
        }
      }
    }

    // Sort by date descending and take most recent
    games.sort((a, b) => b.date.localeCompare(a.date));
    return games.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Fetch play-by-play for a game and find the first goal scorer.
 */
async function getFirstGoalScorer(
  gameId: number
): Promise<{
  scorerName: string;
  scorerPlayerId: number;
  period: number;
  timeInPeriod: string;
} | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/gamecenter/${gameId}/play-by-play`,
      TTL.LONG
    );
    if (!data?.plays) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plays: any[] = data.plays;

    for (const play of plays) {
      if (play.typeDescKey === "goal") {
        // The scorer is typically the first name in the details
        // or available via specific fields
        const scorerName =
          play.details?.scoringPlayerName ||
          `${play.details?.firstName || ""} ${play.details?.lastName || ""}`.trim();
        const scorerPlayerId =
          play.details?.scoringPlayerId || play.details?.playerId || 0;

        return {
          scorerName: scorerName || "Unknown",
          scorerPlayerId,
          period: play.periodDescriptor?.number || play.period || 1,
          timeInPeriod: play.timeInPeriod || "",
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Build first goal records from recent games.
 * Cached for 6 hours.
 */
async function buildFirstGoalRecords(
  teamAbbrevs: string[]
): Promise<FirstGoalRecord[]> {
  // Use cache if fresh and covers the same scope (all games)
  if (
    _fgCache &&
    teamAbbrevs.length === 0 &&
    Date.now() - _fgCache.lastUpdated < 6 * 60 * 60 * 1000
  ) {
    return _fgCache.records;
  }

  console.log("[FirstGoal] Building records from recent games...");
  const gameInfos = await getRecentGameIds(teamAbbrevs, 30);
  const records: FirstGoalRecord[] = [];

  // Fetch in batches of 5 to avoid rate limiting
  for (let i = 0; i < gameInfos.length; i += 5) {
    const batch = gameInfos.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((g) => getFirstGoalScorer(g.gameId))
    );

    for (let j = 0; j < batch.length; j++) {
      const scorer = results[j];
      if (!scorer) continue;

      records.push({
        gameId: batch[j].gameId,
        date: batch[j].date,
        homeTeam: batch[j].homeAbbrev,
        awayTeam: batch[j].awayAbbrev,
        scorerName: scorer.scorerName,
        scorerPlayerId: scorer.scorerPlayerId,
        period: scorer.period,
        timeInPeriod: scorer.timeInPeriod,
      });
    }
  }

  // Cache if we fetched all games (no team filter)
  if (teamAbbrevs.length === 0) {
    _fgCache = { records, lastUpdated: Date.now() };
  }

  console.log(
    `[FirstGoal] Built ${records.length} first-goal records from ${gameInfos.length} games`
  );
  return records;
}

// ── Exported function ─────────────────────────────────────────────

/**
 * Get first goal scorer analysis for a specific player.
 * Returns player profile (if found) and top first goal scorers.
 */
export async function getFirstGoalData(
  playerName: string,
  teamNames: string[]
): Promise<FirstGoalData | null> {
  try {
    // Convert team names to abbreviations for filtering
    const teamAbbrevs: string[] = [];
    for (const name of teamNames) {
      // Try simple abbreviation extraction (3-letter codes)
      const upper = name.toUpperCase().trim();
      if (upper.length === 3) {
        teamAbbrevs.push(upper);
      }
      // Otherwise just pass through — getRecentGameIds will use them for filtering
    }

    // Build first goal records from recent games
    // Pass empty array to get all games (broader dataset for top scorers)
    const records = await buildFirstGoalRecords([]);

    // Count first goals per player
    const firstGoalCounts = new Map<string, number>();
    for (const rec of records) {
      const name = rec.scorerName;
      firstGoalCounts.set(name, (firstGoalCounts.get(name) || 0) + 1);
    }

    // Build top first scorers
    const totalGames = records.length;
    const topFirstScorers: TopFirstScorer[] = Array.from(
      firstGoalCounts.entries()
    )
      .map(([name, count]) => ({
        name,
        count,
        rate:
          totalGames > 0
            ? Math.round((count / totalGames) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Find the requested player in our records
    const nameLower = playerName.toLowerCase();
    let playerProfile: FirstGoalPlayerProfile | null = null;

    // Check if the player appears as a first goal scorer
    const playerFirstGoals = records.filter((r) => {
      const rName = r.scorerName.toLowerCase();
      return (
        rName === nameLower ||
        rName.includes(nameLower) ||
        nameLower.includes(rName)
      );
    });

    const fgCount = playerFirstGoals.length;

    // Try to get player stats from NHL API for goals/shooting data
    // Use the search endpoint
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchData: any[] | null = await cachedFetch(
      `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=5&q=${encodeURIComponent(playerName)}`,
      TTL.LONG
    );

    let goalsPerGame = 0;
    let shootingPct = 0;
    let resolvedName = playerName;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentGames: FirstGoalPlayerProfile["recentGames"] = [];

    if (searchData && Array.isArray(searchData) && searchData.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match: any =
        searchData.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => (p.name || "").toLowerCase() === nameLower
        ) || searchData[0];

      if (match?.playerId) {
        resolvedName = match.name || playerName;

        // Get player game log for goals/shots data
        const season = getCurrentNHLSeason();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const logData: any = await cachedFetch(
          `${BASE}/player/${match.playerId}/game-log/${season}/2`,
          TTL.LONG
        );

        if (logData?.gameLog) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const gameLog: any[] = logData.gameLog;
          const recentSlice = gameLog.slice(0, 30);

          let totalGoals = 0;
          let totalShots = 0;

          for (const g of recentSlice) {
            const goals = g.goals || 0;
            const shots = g.shots || 0;
            totalGoals += goals;
            totalShots += shots;

            const opponent =
              typeof g.opponentAbbrev === "string"
                ? g.opponentAbbrev
                : g.opponentAbbrev?.default || "?";

            // Check if this player was the first goal scorer in this game
            const wasFirst = playerFirstGoals.some(
              (fg) => fg.gameId === g.gameId
            );

            recentGames.push({
              gameId: g.gameId,
              date: g.gameDate || "",
              opponent,
              goals,
              wasFirstGoalScorer: wasFirst,
            });
          }

          goalsPerGame =
            recentSlice.length > 0
              ? Math.round((totalGoals / recentSlice.length) * 100) / 100
              : 0;
          shootingPct =
            totalShots > 0
              ? Math.round((totalGoals / totalShots) * 1000) / 10
              : 0;
        }
      }
    }

    // Build the player profile if we have any data
    if (recentGames.length > 0 || fgCount > 0) {
      const gamesWithData = Math.max(recentGames.length, 1);
      playerProfile = {
        name: resolvedName,
        firstGoalCount: fgCount,
        firstGoalRate:
          gamesWithData > 0
            ? Math.round((fgCount / gamesWithData) * 1000) / 10
            : 0,
        goalsPerGame,
        shootingPct,
        recentGames: recentGames.slice(0, 15),
      };
    }

    return {
      player: playerProfile,
      topFirstScorers,
    };
  } catch (e) {
    console.error("[FirstGoal] Error:", e);
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function getCurrentNHLSeason(): string {
  const now = new Date();
  const year = now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear();
  return `${year}${year + 1}`;
}
