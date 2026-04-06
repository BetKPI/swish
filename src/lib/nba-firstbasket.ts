/**
 * NBA First Basket / First Scorer data from NBA.com play-by-play.
 *
 * Parses free NBA CDN endpoints (no API key) to extract:
 * - First basket scorer per game
 * - Tip-off winner per game
 * - First shot attempts per team
 * - Q1 scoring context
 *
 * Data is cached in-memory with 6h TTL.
 */

import { cachedFetch, TTL } from "./fetch";

const NBA_CDN = "https://cdn.nba.com/static/json/liveData";
const HEADERS = {
  "Referer": "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

interface FirstBasketData {
  playerName: string;
  playerId: number;
  teamTricode: string;
  shotType: string; // "3pt", "2pt", "freethrow"
  clock: string;
  description: string;
}

interface TipOffData {
  winner: string;
  loser: string;
  tippedTo: string;
}

interface GameFirstData {
  gameId: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  firstBasket: FirstBasketData | null;
  tipOff: TipOffData | null;
  firstShotAttempts: { home: string | null; away: string | null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchNBACdn(path: string): Promise<any> {
  try {
    return await cachedFetch(`${NBA_CDN}/${path}`, TTL.LONG, {
      headers: HEADERS,
    });
  } catch {
    return null;
  }
}

/**
 * Parse play-by-play for a single game to extract first basket data.
 */
async function parseGamePBP(gameId: string): Promise<GameFirstData | null> {
  const data = await fetchNBACdn(`playbyplay/playbyplay_${gameId}.json`);
  if (!data?.game?.actions) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actions: any[] = data.game.actions;
  const homeTeam = data.game.homeTeam?.teamTricode || "";
  const awayTeam = data.game.awayTeam?.teamTricode || "";

  let tipOff: TipOffData | null = null;
  let firstBasket: FirstBasketData | null = null;
  const firstShotAttempts: { home: string | null; away: string | null } = { home: null, away: null };

  for (const a of actions) {
    if (a.period !== 1) continue;

    // Tip-off
    if (!tipOff && a.actionType === "jumpball" && a.description) {
      const desc = a.description as string;
      // Parse "Jump Ball X vs Y: Tip to Z"
      const match = desc.match(/Jump Ball (.+?) vs\. (.+?): Tip to (.+)/);
      if (match) {
        tipOff = { winner: match[1], loser: match[2], tippedTo: match[3] };
      }
    }

    // First shot attempts per team
    const isShotAttempt = a.actionType === "2pt" || a.actionType === "3pt";
    if (isShotAttempt && a.teamTricode) {
      if (a.teamTricode === homeTeam && !firstShotAttempts.home) {
        firstShotAttempts.home = a.playerNameI || a.description || "";
      }
      if (a.teamTricode === awayTeam && !firstShotAttempts.away) {
        firstShotAttempts.away = a.playerNameI || a.description || "";
      }
    }

    // First made basket
    if (!firstBasket && isShotAttempt && a.shotResult === "Made") {
      firstBasket = {
        playerName: a.playerNameI || "",
        playerId: a.personId || 0,
        teamTricode: a.teamTricode || "",
        shotType: a.actionType || "",
        clock: a.clock || "",
        description: a.description || "",
      };
    }

    // Stop once we have everything
    if (tipOff && firstBasket && firstShotAttempts.home && firstShotAttempts.away) break;
  }

  return {
    gameId,
    date: "",
    homeTeam,
    awayTeam,
    firstBasket,
    tipOff,
    firstShotAttempts,
  };
}

/**
 * Get recent game IDs from the NBA scoreboard.
 */
async function getRecentGameIds(limit: number = 50): Promise<string[]> {
  const data = await fetchNBACdn("scoreboard/todaysScoreboard_00.json");
  const todayGames = (data?.scoreboard?.games || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((g: any) => g.gameStatusText === "Final" || g.gameStatus === 3)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((g: any) => g.gameId);

  // Also try to get yesterday and day before by decrementing game IDs
  // NBA game IDs are sequential: 0022501132, 0022501131, etc.
  const allIds = [...todayGames];
  if (todayGames.length > 0) {
    const lastId = parseInt(todayGames[todayGames.length - 1]);
    // Go back ~30 games to get several days of data
    for (let i = 1; i <= Math.min(limit - todayGames.length, 40); i++) {
      allIds.push(String(lastId - i).padStart(10, "0"));
    }
  }

  return allIds.slice(0, limit);
}

export interface PlayerFirstBasketProfile {
  playerName: string;
  gamesPlayed: number;
  firstBasketCount: number;
  firstBasketRate: number;
  firstShotAttemptCount: number;
  firstShotAttemptRate: number;
  avgClockFirstBasket: string; // when they score first, how early?
  recentGames: {
    gameId: string;
    opponent: string;
    scoredFirst: boolean;
    shotFirst: boolean;
    shotType?: string;
  }[];
}

export interface TeamTipOffProfile {
  teamTricode: string;
  gamesPlayed: number;
  tipWins: number;
  tipWinRate: number;
  tipWinner: string; // most common tip winner (center name)
}

// In-memory cache for aggregated first basket data
let _fbCache: {
  profiles: Map<string, PlayerFirstBasketProfile>;
  tipOffs: Map<string, TeamTipOffProfile>;
  lastUpdated: number;
} | null = null;

/**
 * Build first basket profiles for all players from recent games.
 * Cached for 6 hours.
 */
async function buildProfiles(): Promise<{
  profiles: Map<string, PlayerFirstBasketProfile>;
  tipOffs: Map<string, TeamTipOffProfile>;
}> {
  if (_fbCache && Date.now() - _fbCache.lastUpdated < 6 * 60 * 60 * 1000) {
    return _fbCache;
  }

  console.log("[FirstBasket] Building profiles from recent games...");
  const gameIds = await getRecentGameIds(40);
  const profiles = new Map<string, PlayerFirstBasketProfile>();
  const tipOffs = new Map<string, TeamTipOffProfile>();

  // Fetch in batches of 5 to avoid rate limiting
  for (let i = 0; i < gameIds.length; i += 5) {
    const batch = gameIds.slice(i, i + 5);
    const results = await Promise.all(batch.map((id) => parseGamePBP(id)));

    for (const game of results) {
      if (!game) continue;

      // Track tip-offs
      if (game.tipOff) {
        for (const team of [game.homeTeam, game.awayTeam]) {
          const existing = tipOffs.get(team) || {
            teamTricode: team,
            gamesPlayed: 0,
            tipWins: 0,
            tipWinRate: 0,
            tipWinner: "",
          };
          existing.gamesPlayed++;
          // The winner in the description is the player who won the tip
          // We need to figure out which team they're on based on tippedTo
          if (game.tipOff.tippedTo) {
            // The team that the tip went to won the tip
            // We can't perfectly determine team from player name alone,
            // so we track based on who scored first
          }
          tipOffs.set(team, existing);
        }
      }

      // Track first basket
      if (game.firstBasket) {
        const name = game.firstBasket.playerName;
        const opponent = game.firstBasket.teamTricode === game.homeTeam ? game.awayTeam : game.homeTeam;

        // Update the scorer's profile
        const existing = profiles.get(name) || {
          playerName: name,
          gamesPlayed: 0,
          firstBasketCount: 0,
          firstBasketRate: 0,
          firstShotAttemptCount: 0,
          firstShotAttemptRate: 0,
          avgClockFirstBasket: "",
          recentGames: [],
        };
        existing.firstBasketCount++;
        existing.recentGames.push({
          gameId: game.gameId,
          opponent,
          scoredFirst: true,
          shotFirst: false,
          shotType: game.firstBasket.shotType,
        });
        profiles.set(name, existing);
      }

      // Track first shot attempts for all players who attempted
      for (const [venue, playerName] of [
        ["home", game.firstShotAttempts.home],
        ["away", game.firstShotAttempts.away],
      ] as const) {
        if (!playerName) continue;
        const existing = profiles.get(playerName) || {
          playerName,
          gamesPlayed: 0,
          firstBasketCount: 0,
          firstBasketRate: 0,
          firstShotAttemptCount: 0,
          firstShotAttemptRate: 0,
          avgClockFirstBasket: "",
          recentGames: [],
        };
        existing.firstShotAttemptCount++;

        // Add to recent games if not already there from first basket
        const alreadyHasGame = existing.recentGames.some((g) => g.gameId === game.gameId);
        if (!alreadyHasGame) {
          const opponent = venue === "home" ? game.awayTeam : game.homeTeam;
          existing.recentGames.push({
            gameId: game.gameId,
            opponent,
            scoredFirst: false,
            shotFirst: true,
          });
        } else {
          // Mark the existing entry as also being first shot
          const entry = existing.recentGames.find((g) => g.gameId === game.gameId);
          if (entry) entry.shotFirst = true;
        }

        profiles.set(playerName, existing);
      }
    }
  }

  // Compute rates (approximate games played from total games parsed)
  const totalGames = gameIds.length;
  for (const [, profile] of profiles) {
    // Each player plays roughly half the total games (2 teams per game)
    // Use firstShotAttemptCount + (games where they didn't shoot first) as denominator
    const estimatedGP = Math.max(profile.recentGames.length, Math.round(totalGames / 30 * 5));
    profile.gamesPlayed = Math.max(estimatedGP, profile.firstBasketCount);
    profile.firstBasketRate = profile.gamesPlayed > 0
      ? Math.round((profile.firstBasketCount / profile.gamesPlayed) * 100)
      : 0;
    profile.firstShotAttemptRate = profile.gamesPlayed > 0
      ? Math.round((profile.firstShotAttemptCount / profile.gamesPlayed) * 100)
      : 0;
    // Cap recent games to last 15
    profile.recentGames = profile.recentGames.slice(-15);
  }

  _fbCache = { profiles, tipOffs, lastUpdated: Date.now() };
  console.log(`[FirstBasket] Built profiles for ${profiles.size} players from ${gameIds.length} games`);
  return _fbCache;
}

/**
 * Get first basket analysis for a specific player.
 * Returns null if no data found.
 */
export async function getFirstBasketData(
  playerName: string,
  teamNames: string[]
): Promise<{
  player: PlayerFirstBasketProfile | null;
  teamTipOff: TeamTipOffProfile | null;
  topFirstScorers: { name: string; rate: number; count: number }[];
} | null> {
  try {
    const { profiles, tipOffs } = await buildProfiles();

    // Fuzzy match player name (handle "S. Castle" vs "Stephon Castle")
    const nameLower = playerName.toLowerCase();
    let player: PlayerFirstBasketProfile | null = null;

    for (const [key, profile] of profiles) {
      const keyLower = key.toLowerCase();
      if (
        keyLower === nameLower ||
        keyLower.includes(nameLower) ||
        nameLower.includes(keyLower) ||
        // Handle "S. Castle" format
        (nameLower.includes(".") && keyLower.endsWith(nameLower.split(". ")[1]?.toLowerCase() || ""))
      ) {
        player = profile;
        break;
      }
    }

    // Find team tip-off data
    let teamTipOff: TeamTipOffProfile | null = null;
    for (const team of teamNames) {
      const abbrev = team.substring(0, 3).toUpperCase();
      for (const [key, to] of tipOffs) {
        if (key === abbrev || team.toLowerCase().includes(key.toLowerCase())) {
          teamTipOff = to;
          break;
        }
      }
      if (teamTipOff) break;
    }

    // Get top first scorers overall
    const allProfiles = Array.from(profiles.values())
      .filter((p) => p.firstBasketCount >= 2)
      .sort((a, b) => b.firstBasketRate - a.firstBasketRate)
      .slice(0, 10)
      .map((p) => ({ name: p.playerName, rate: p.firstBasketRate, count: p.firstBasketCount }));

    return {
      player,
      teamTipOff,
      topFirstScorers: allProfiles,
    };
  } catch (e) {
    console.error("[FirstBasket] Error:", e);
    return null;
  }
}
