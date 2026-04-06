/**
 * MLB First Inning (NRFI/YRFI) data from MLB Stats API.
 *
 * Uses free statsapi.mlb.com endpoints (no API key) to extract:
 * - First inning run data from play-by-play feeds
 * - Per-pitcher "clean first inning" rates
 * - Recent game NRFI/YRFI results
 *
 * Data is cached in-memory with 6h TTL.
 */

import { cachedFetch, TTL } from "./fetch";
import { searchPlayer } from "./mlbstats";

const BASE = "https://statsapi.mlb.com/api/v1";

// ── Types ──────────────────────────────────────────────────────────

export interface NRFIPitcherProfile {
  name: string;
  firstInningCleanRate: number;
  gamesStarted: number;
  cleanFirstInnings: number;
  runsInFirstInning: number[];
}

export interface NRFIRecentGame {
  date: string;
  opponent: string;
  firstInningRuns: number;
  result: "NRFI" | "YRFI";
}

export interface NRFIData {
  pitcher: NRFIPitcherProfile;
  recentGames: NRFIRecentGame[];
}

// ── Internals ─────────────────────────────────────────────────────

/**
 * Get recent game IDs (gamePk) from a pitcher's game log.
 * Returns up to `limit` most recent game PKs.
 */
async function getPitcherGamePks(
  playerId: number,
  limit: number = 30
): Promise<{ gamePk: number; date: string; opponent: string }[]> {
  try {
    const season = new Date().getFullYear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${BASE}/people/${playerId}/stats?stats=gameLog&season=${season}&group=pitching`,
      TTL.LONG
    );
    if (!data) return [];

    const results: { gamePk: number; date: string; opponent: string }[] = [];
    for (const statGroup of data.stats || []) {
      for (const split of statGroup.splits || []) {
        if (split.game?.gamePk) {
          results.push({
            gamePk: split.game.gamePk,
            date: split.date || "",
            opponent: split.opponent?.name || "Unknown",
          });
        }
      }
    }

    // Return most recent games up to limit
    return results.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Fetch play-by-play for a game and count runs scored in the 1st inning
 * while the given pitcher was pitching.
 */
async function getFirstInningRuns(
  gamePk: number,
  pitcherId: number
): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`,
      TTL.LONG
    );
    if (!data?.liveData?.plays?.allPlays) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allPlays: any[] = data.liveData.plays.allPlays;
    let runsInFirst = 0;

    for (const play of allPlays) {
      const inning = play.about?.inning;
      if (inning === undefined) continue;
      if (inning > 1) break; // past first inning, stop
      if (inning < 1) continue;

      // Only count runs scored while our pitcher was on the mound.
      // The pitcher is on defense when the opposing team bats.
      // Check if the matchup pitcher ID matches.
      const matchupPitcherId = play.matchup?.pitcher?.id;
      if (matchupPitcherId !== pitcherId) continue;

      // Count runs from this at-bat's events
      const runners = play.runners || [];
      for (const runner of runners) {
        if (runner.movement?.end === "score") {
          runsInFirst++;
        }
      }
    }

    return runsInFirst;
  } catch {
    return null;
  }
}

// ── Exported function ─────────────────────────────────────────────

/**
 * Get NRFI/YRFI analysis for a specific pitcher.
 * Returns null if the pitcher is not found or no data is available.
 */
export async function getFirstInningData(
  pitcherName: string
): Promise<NRFIData | null> {
  try {
    // Find the pitcher via existing MLB search
    const player = await searchPlayer(pitcherName);
    if (!player) {
      console.log(`[NRFI] Pitcher not found: "${pitcherName}"`);
      return null;
    }

    console.log(`[NRFI] Found pitcher: "${pitcherName}" → id=${player.id}`);

    // Get recent game PKs from game log
    const gamePks = await getPitcherGamePks(player.id, 30);
    if (gamePks.length === 0) {
      console.log(`[NRFI] No game log entries for pitcher ${player.id}`);
      return null;
    }

    // Fetch first-inning data in batches of 5
    const recentGames: NRFIRecentGame[] = [];
    const runsInFirstInning: number[] = [];

    for (let i = 0; i < gamePks.length; i += 5) {
      const batch = gamePks.slice(i, i + 5);
      const results = await Promise.all(
        batch.map((g) => getFirstInningRuns(g.gamePk, player.id))
      );

      for (let j = 0; j < batch.length; j++) {
        const runs = results[j];
        if (runs === null) continue; // skip failed fetches

        runsInFirstInning.push(runs);
        recentGames.push({
          date: batch[j].date,
          opponent: batch[j].opponent,
          firstInningRuns: runs,
          result: runs === 0 ? "NRFI" : "YRFI",
        });
      }
    }

    if (recentGames.length === 0) {
      console.log(`[NRFI] No parseable games for pitcher ${player.id}`);
      return null;
    }

    const cleanCount = runsInFirstInning.filter((r) => r === 0).length;
    const cleanRate =
      recentGames.length > 0
        ? Math.round((cleanCount / recentGames.length) * 1000) / 10
        : 0;

    console.log(
      `[NRFI] ${player.fullName}: ${cleanCount}/${recentGames.length} clean 1st innings (${cleanRate}%)`
    );

    return {
      pitcher: {
        name: player.fullName,
        firstInningCleanRate: cleanRate,
        gamesStarted: recentGames.length,
        cleanFirstInnings: cleanCount,
        runsInFirstInning,
      },
      recentGames,
    };
  } catch (e) {
    console.error("[NRFI] Error:", e);
    return null;
  }
}
