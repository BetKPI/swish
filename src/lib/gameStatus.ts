/**
 * Game status checker — detects live, completed, and upcoming games.
 * Provides live scores, player stat lines, and bet grading for completed games.
 */

import { cachedFetch, TTL } from "./fetch";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

// ── Types ──────────────────────────────────────────────────────────

export interface GameStatus {
  state: "pre" | "in" | "post" | "unknown"; // upcoming, live, final
  gameId?: string;
  clock?: string; // "3:42" or "Halftime"
  period?: string; // "3rd Quarter", "2nd Period", "7th Inning"
  detail?: string; // "3rd - 3:42", "Final", "Scheduled"
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  // Player stat line (for props)
  playerStatLine?: Record<string, string | number>;
  playerName?: string;
  // Bet grading (for completed games)
  grade?: BetGrade;
}

export interface BetGrade {
  result: "hit" | "miss" | "push" | "pending";
  actual?: number | string; // actual value for the relevant stat
  line?: number;
  detail: string; // "Over 5.5 assists — had 7 assists" or "Spread -3.5 — won by 5"
}

// ── ESPN sport/league mapping ─────────────────────────────────────

const SPORT_MAP: Record<string, { sport: string; league: string }> = {
  NBA: { sport: "basketball", league: "nba" },
  NFL: { sport: "football", league: "nfl" },
  MLB: { sport: "baseball", league: "mlb" },
  NHL: { sport: "hockey", league: "nhl" },
  NCAAF: { sport: "football", league: "college-football" },
  NCAAB: { sport: "basketball", league: "mens-college-basketball" },
  MLS: { sport: "soccer", league: "usa.1" },
  EPL: { sport: "soccer", league: "eng.1" },
  SOCCER: { sport: "soccer", league: "usa.1" },
  BASKETBALL: { sport: "basketball", league: "nba" },
  FOOTBALL: { sport: "football", league: "nfl" },
  BASEBALL: { sport: "baseball", league: "mlb" },
  HOCKEY: { sport: "hockey", league: "nhl" },
  GOLF: { sport: "golf", league: "pga" },
  PGA: { sport: "golf", league: "pga" },
};

// ── Main function ─────────────────────────────────────────────────

export async function checkGameStatus(
  sport: string,
  teams: string[],
  betType: string,
  players: string[],
  market?: string,
  line?: number
): Promise<GameStatus | null> {
  const key = sport.toUpperCase();
  const mapping = SPORT_MAP[key];
  if (!mapping) return null;

  // Golf doesn't have head-to-head games — skip game status
  if (mapping.sport === "golf") return null;

  try {
    // Fetch today's scoreboard
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${ESPN_BASE}/${mapping.sport}/${mapping.league}/scoreboard`,
      60_000 // 1 min cache for live data
    );
    if (!data?.events) return null;

    // Find the game matching our teams
    const game = findMatchingGame(data.events, teams);
    if (!game) return null;

    const comp = game.competitions?.[0];
    if (!comp) return null;

    const status = comp.status;
    const state = status?.type?.state as "pre" | "in" | "post" || "unknown";
    const homeComp = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "home");
    const awayComp = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "away");

    const result: GameStatus = {
      state,
      gameId: game.id,
      clock: status?.displayClock,
      period: status?.period ? `${ordinal(status.period)} ${periodName(mapping.sport)}` : undefined,
      detail: status?.type?.shortDetail || status?.type?.description,
      homeTeam: homeComp?.team?.displayName || homeComp?.team?.shortDisplayName || "Home",
      awayTeam: awayComp?.team?.displayName || awayComp?.team?.shortDisplayName || "Away",
      homeScore: Number(homeComp?.score) || 0,
      awayScore: Number(awayComp?.score) || 0,
    };

    // For live or completed games, try to get player stats (for props)
    if ((state === "in" || state === "post") && players.length > 0 && game.id) {
      const statLine = await getPlayerStatLine(
        mapping.sport,
        mapping.league,
        game.id,
        players[0]
      );
      if (statLine) {
        result.playerStatLine = statLine.stats;
        result.playerName = statLine.name;
      }
    }

    // Grade the bet if game is completed
    if (state === "post") {
      result.grade = gradeBet(
        betType,
        result,
        market,
        line,
        result.playerStatLine
      );
    }

    // For live games with player props, show tracking status
    if (state === "in" && betType === "player_prop" && result.playerStatLine && market && line != null) {
      const statKey = mapMarketToBoxScoreKey(market);
      const current = Number(result.playerStatLine[statKey]) || 0;
      result.grade = {
        result: "pending",
        actual: current,
        line,
        detail: `${current} ${market.toLowerCase()} so far — needs ${line > current ? `${(line - current + (line % 1 === 0.5 ? 0.5 : 1)).toFixed(line % 1 === 0.5 ? 1 : 0)} more` : "already over the line"}`,
      };
    }

    return result;
  } catch (e) {
    console.error("[GameStatus] Error:", e);
    return null;
  }
}

// ── Find matching game ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findMatchingGame(events: any[], teams: string[]): any | null {
  if (teams.length === 0) return null;
  const teamLower = teams.map((t) => t.toLowerCase());

  for (const event of events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    const gameTeams = (comp.competitors || []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => ({
        display: (c.team?.displayName || "").toLowerCase(),
        short: (c.team?.shortDisplayName || "").toLowerCase(),
        abbrev: (c.team?.abbreviation || "").toLowerCase(),
        name: (c.team?.name || "").toLowerCase(),
      })
    );

    // Check if any of our teams match any game team
    const matches = teamLower.filter((t) =>
      gameTeams.some(
        (gt: { display: string; short: string; abbrev: string; name: string }) =>
          gt.display.includes(t) ||
          gt.short.includes(t) ||
          gt.abbrev === t ||
          gt.name.includes(t) ||
          t.includes(gt.name) ||
          t.includes(gt.display)
      )
    );

    if (matches.length >= 1) return event;
  }
  return null;
}

// ── Player stat line from box score ───────────────────────────────

async function getPlayerStatLine(
  sport: string,
  league: string,
  gameId: string,
  playerName: string
): Promise<{ name: string; stats: Record<string, string | number> } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${ESPN_BASE}/${sport}/${league}/summary?event=${gameId}`,
      60_000 // 1 min for live
    );
    if (!data?.boxscore?.players) return null;

    const nameLower = playerName.toLowerCase();

    for (const team of data.boxscore.players) {
      for (const statGroup of team.statistics || []) {
        const labels: string[] = statGroup.labels || [];
        for (const athlete of statGroup.athletes || []) {
          const aName = (athlete.athlete?.displayName || "").toLowerCase();
          const aShort = (athlete.athlete?.shortName || "").toLowerCase();
          if (aName.includes(nameLower) || nameLower.includes(aName) || aShort.includes(nameLower)) {
            const statsArr: string[] = athlete.stats || [];
            const stats: Record<string, string | number> = {};
            labels.forEach((label, i) => {
              const val = statsArr[i];
              const num = Number(val);
              stats[label] = !isNaN(num) && !String(val).includes("-") && !String(val).includes(":") ? num : val;
            });
            return { name: athlete.athlete?.displayName || playerName, stats };
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Bet grading ───────────────────────────────────────────────────

function gradeBet(
  betType: string,
  game: GameStatus,
  market?: string,
  line?: number,
  playerStats?: Record<string, string | number>
): BetGrade {
  const homeScore = game.homeScore ?? 0;
  const awayScore = game.awayScore ?? 0;
  const totalScore = homeScore + awayScore;
  const margin = homeScore - awayScore;

  switch (betType) {
    case "over_under": {
      if (line == null) return { result: "pending", detail: "No line to grade against" };
      const over = totalScore > line;
      const push = totalScore === line;
      return {
        result: push ? "push" : over ? "hit" : "miss",
        actual: totalScore,
        line,
        detail: push
          ? `Total ${totalScore} — push at ${line}`
          : over
          ? `Over ${line} hit — total was ${totalScore}`
          : `Under ${line} hit — total was ${totalScore}`,
      };
    }

    case "spread": {
      if (line == null) return { result: "pending", detail: "No line to grade against" };
      // Positive line = underdog, negative = favorite. We grade for the first team.
      const covered = margin + line > 0;
      const push = margin + line === 0;
      return {
        result: push ? "push" : covered ? "hit" : "miss",
        actual: margin,
        line,
        detail: push
          ? `${game.homeTeam} ${margin > 0 ? "won" : "lost"} by ${Math.abs(margin)} — push at ${line > 0 ? "+" : ""}${line}`
          : covered
          ? `Spread ${line > 0 ? "+" : ""}${line} covered — ${game.homeTeam} ${margin > 0 ? "won" : "lost"} by ${Math.abs(margin)}`
          : `Spread ${line > 0 ? "+" : ""}${line} missed — ${game.homeTeam} ${margin > 0 ? "won" : "lost"} by ${Math.abs(margin)}`,
      };
    }

    case "moneyline": {
      // Grade based on which team won
      const homeWon = homeScore > awayScore;
      return {
        result: homeWon ? "hit" : "miss",
        actual: `${homeScore}-${awayScore}`,
        detail: `${game.homeTeam} ${homeScore}-${awayScore} ${game.awayTeam} — ${homeWon ? game.homeTeam : game.awayTeam} wins`,
      };
    }

    case "player_prop": {
      if (!playerStats || !market || line == null) {
        return { result: "pending", detail: "Couldn't find player box score to grade" };
      }
      const statKey = mapMarketToBoxScoreKey(market);
      const rawVal = playerStats[statKey];
      if (rawVal === undefined) {
        return { result: "pending", detail: `Stat "${statKey}" not found in box score` };
      }
      const actual = Number(rawVal) || 0;
      const over = actual > line;
      const push = actual === line;
      const marketLabel = market.toLowerCase();
      return {
        result: push ? "push" : over ? "hit" : "miss",
        actual,
        line,
        detail: push
          ? `${actual} ${marketLabel} — push at ${line}`
          : over
          ? `Over ${line} ${marketLabel} hit — had ${actual}`
          : `Under ${line} ${marketLabel} — had ${actual}`,
      };
    }

    default:
      return { result: "pending", detail: "Can't grade this bet type automatically" };
  }
}

// ── Map market names to ESPN box score labels ─────────────────────

function mapMarketToBoxScoreKey(market: string): string {
  const m = market.toLowerCase();
  // NBA box score labels: MIN, PTS, FG, 3PT, FT, REB, AST, TO, STL, BLK, OREB, DREB, PF, +/-
  if (m.includes("point") || m.includes("pts")) return "PTS";
  if (m.includes("rebound") || m.includes("reb")) return "REB";
  if (m.includes("assist") || m.includes("ast")) return "AST";
  if (m.includes("steal")) return "STL";
  if (m.includes("block") || m.includes("blk")) return "BLK";
  if (m.includes("three") || m.includes("3p")) return "3PT";
  if (m.includes("turnover")) return "TO";
  // NHL: G, A, SOG, +/-, PIM, TOI, PPG, SHG, BLKS
  if (m.includes("shot") || m.includes("sog")) return "SOG";
  if (m.includes("goal") && !m.includes("against")) return "G";
  if (m.includes("save")) return "SV";
  // MLB: H, AB, R, HR, RBI, BB, SO, SB, AVG, OBP
  if (m.includes("strikeout") || m.includes("k")) return "SO";
  if (m.includes("home run") || m.includes("hr")) return "HR";
  if (m.includes("rbi") || m.includes("runs batted")) return "RBI";
  if (m.includes("stolen base")) return "SB";
  if (m.includes("hit")) return "H";
  if (m.includes("total bases")) return "TB";
  return "PTS";
}

// ── Helpers ───────────────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function periodName(sport: string): string {
  switch (sport) {
    case "basketball": return "Quarter";
    case "hockey": return "Period";
    case "football": return "Quarter";
    case "baseball": return "Inning";
    case "soccer": return "Half";
    default: return "";
  }
}
