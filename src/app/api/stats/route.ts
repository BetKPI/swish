import { NextRequest, NextResponse } from "next/server";
import { fetchAllTeamData, fetchGolfLeaderboard, fetchStandings } from "@/lib/espn";
import { fetchMastersHistory, analyzeHoleHistory, analyzeAmenCorner, analyzeSundayScoring, getAugustaPars, analyzeHoleInOneHistory } from "@/lib/masters";
import { fetchNBAData } from "@/lib/balldontlie";
import { fetchMLBData, searchPlayer, searchTeam } from "@/lib/mlbstats";
import {
  getTeamTwoSeasonResults,
  getPitcherTwoSeasonLog,
  getPitcherCareerVsOpponent,
  getBatterTwoSeasonLog,
  getBatterVsPitcher,
  getMLBStandingsForSeasons,
  tryFetchBatterExitVelocity,
  getTeamPitchingStats,
  getTeamHittingStats,
  getBatterPlatoonSplits,
  getPitcherHandedness,
  getPitcherPlatoonSplits,
  getLastAndCurrentSeasons,
  type MLBTeamTwoSeason,
  type MLBPitcherTwoSeason,
  type MLBPitcherGame,
  type MLBBatterTwoSeason,
  type MLBBatterVsPitcher,
  type TeamPitchingStats,
  type TeamHittingStats,
  type PlatoonSplits,
  type PitcherPlatoonSplits,
} from "@/lib/mlb-history";
import {
  resolveNBATeam,
  resolveNBAPlayer,
  getTeamTwoSeason as getNBATeamTwoSeason,
  getPlayerTwoSeason as getNBAPlayerTwoSeason,
  getNBAStandingsForSeasons,
  getCurrentAndLastNBASeasons,
  enrichRecentQuarterScores,
  type NBATeamTwoSeason,
  type NBAPlayerTwoSeason,
} from "@/lib/nba-history";
import type { NBAHistoryContext } from "@/lib/nba-history-charts";
import {
  resolveNHLTeam,
  resolveNHLPlayer,
  getNHLTeamTwoSeason,
  getNHLPlayerTwoSeason,
  getNHLStandingsForRecentYears,
  enrichNHLRecentPeriodScores,
} from "@/lib/nhl-history";
import type { NHLHistoryContext } from "@/lib/nhl-history-charts";
import { fetchNHLData } from "@/lib/nhlstats";
import { computeAnalysis } from "@/lib/analytics";
import { buildCharts } from "@/lib/charts";
import { getMarketContext } from "@/lib/markets";
import { fetchWithRetry } from "@/lib/fetch";
import { computeSwishScore } from "@/lib/swishScore";
import type { BetExtraction, ChartConfig } from "@/types";
import { checkGameStatus } from "@/lib/gameStatus";
import { getFirstBasketData } from "@/lib/nba-firstbasket";
import { getFirstInningData, getTeamPitchers } from "@/lib/mlb-nrfi";
import { getFirstGoalData } from "@/lib/nhl-firstgoal";
import { detectExoticMarket, isNBASport, isMLBSport, isNHLSport } from "@/lib/market-detect";

export const maxDuration = 60;

// Common bet types that get deterministic charts
const DETERMINISTIC_BET_TYPES = ["spread", "over_under", "moneyline", "player_prop", "game_prop", "futures"];

// ── In-memory data cache ─────────────────────────────────────────
// Caches sport data for 10 minutes to avoid re-fetching the same
// teams/players across multiple analyses in the same session.
const dataCache = new Map<string, { data: Record<string, unknown>; source: string; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCacheKey(extraction: BetExtraction): string {
  const sport = (extraction.sport || "").toUpperCase();
  const teams = [...(extraction.teams || [])].sort().join("|");
  const players = [...(extraction.players || [])].sort().join("|");
  const market = extraction.market || "";
  return `${sport}:${teams}:${players}:${market}`;
}

function getCachedData(key: string): { data: Record<string, unknown>; source: string } | null {
  const entry = dataCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    dataCache.delete(key);
    return null;
  }
  return { data: entry.data, source: entry.source };
}

function setCachedData(key: string, data: Record<string, unknown>, source: string) {
  // Cap cache size to prevent memory leaks
  if (dataCache.size > 50) {
    const oldest = [...dataCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) dataCache.delete(oldest[0]);
  }
  dataCache.set(key, { data, source, ts: Date.now() });
}

// ── MLB history enrichment ────────────────────────────────────────

interface MLBHistoryContextShape {
  teams: Record<string, MLBTeamTwoSeason>;
  probablePitchers: Record<string, MLBPitcherTwoSeason>;
  pitchersByName: Record<string, MLBPitcherTwoSeason>;
  batters: Record<string, MLBBatterTwoSeason>;
  batterVsPitcher: Record<string, MLBBatterVsPitcher>;
  standings: Awaited<ReturnType<typeof getMLBStandingsForSeasons>>;
  exitVelo: Record<string, Awaited<ReturnType<typeof tryFetchBatterExitVelocity>>>;
  pitcherCareerVsOpponent: Record<string, MLBPitcherGame[]>;
  // Team-level season stats keyed by team name (as it appears in extraction.teams).
  teamPitching: Record<string, TeamPitchingStats | null>;
  teamHitting: Record<string, TeamHittingStats | null>;
  // Batter platoon splits keyed by player name
  platoonSplits: Record<string, PlatoonSplits | null>;
  // Pitcher platoon splits keyed by player name
  pitcherPlatoon: Record<string, PitcherPlatoonSplits | null>;
  // Pitch hand for probable pitchers, keyed by team name
  pitcherHand: Record<string, "L" | "R" | null>;
  // Pitch arsenal (per-pitch-type breakdown) keyed by pitcher name
  pitcherArsenal: Record<string, Awaited<ReturnType<typeof import("@/lib/mlb-pitch-arsenal").getPitcherArsenal>>>;
  // Weather forecast at the home park
  weather: Awaited<ReturnType<typeof import("@/lib/mlb-weather").getGameWeather>> | null;
}

async function buildMLBHistoryContext(
  extraction: BetExtraction,
  mlbData: Record<string, unknown>,
): Promise<MLBHistoryContextShape> {
  const ctx: MLBHistoryContextShape = {
    teams: {},
    probablePitchers: {},
    pitchersByName: {},
    batters: {},
    batterVsPitcher: {},
    standings: [],
    exitVelo: {},
    pitcherCareerVsOpponent: {},
    teamPitching: {},
    teamHitting: {},
    platoonSplits: {},
    pitcherPlatoon: {},
    pitcherHand: {},
    pitcherArsenal: {},
    weather: null,
  };

  // 1) Teams: fetch two-season results + season pitching/hitting in parallel
  const teamFetches = extraction.teams.map(async (name) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slot = (mlbData as any)[name];
    let teamId: number | undefined = slot?.team?.id;
    let teamName: string = slot?.team?.name || name;
    if (!teamId) {
      const found = await searchTeam(name);
      if (found) {
        teamId = found.id;
        teamName = found.name;
      }
    }
    if (teamId) {
      const [ts, pitching, hitting] = await Promise.all([
        getTeamTwoSeasonResults(teamId, teamName),
        getTeamPitchingStats(teamId),
        getTeamHittingStats(teamId),
      ]);
      ctx.teams[name] = ts;
      ctx.teamPitching[name] = pitching;
      ctx.teamHitting[name] = hitting;
    }
  });

  // 2) Probable pitchers per team: already have IDs on mlbData[team].probablePitchers
  const pitcherFetches: Promise<void>[] = [];
  for (const teamName of extraction.teams) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slot = (mlbData as any)[teamName];
    const pp = slot?.probablePitchers;
    if (!pp) continue;
    // Identify which pitcher belongs to this team (homePitcher vs awayPitcher)
    const teamObjName: string = slot?.team?.name || teamName;
    const homeTeamName: string | undefined = pp.homeTeam;
    const isHome = homeTeamName && typeof homeTeamName === "string" && homeTeamName.toLowerCase().includes(teamObjName.toLowerCase());
    const ownPitcher = isHome ? pp.homePitcher : pp.awayPitcher;
    if (ownPitcher?.id && ownPitcher?.fullName) {
      pitcherFetches.push(
        (async () => {
          const { getPitcherArsenal } = await import("@/lib/mlb-pitch-arsenal");
          const [log, splits, arsenal] = await Promise.all([
            getPitcherTwoSeasonLog(ownPitcher.id, ownPitcher.fullName),
            getPitcherPlatoonSplits(ownPitcher.id),
            getPitcherArsenal(ownPitcher.id),
          ]);
          ctx.probablePitchers[teamName] = log;
          ctx.pitchersByName[ownPitcher.fullName] = log;
          ctx.pitcherPlatoon[ownPitcher.fullName] = splits;
          ctx.pitcherArsenal[ownPitcher.fullName] = arsenal;
        })(),
      );
    }
  }

  // 3) Players (player props): batter or pitcher two-season logs
  // Track each batter's current team so we can pick the correct opposing probable pitcher.
  const batterTeamIds: Record<string, number | undefined> = {};
  const playerFetches: Promise<void>[] = [];
  for (const playerName of extraction.players) {
    playerFetches.push(
      (async () => {
        const player = await searchPlayer(playerName);
        if (!player) return;
        const isPitcher = player.primaryPosition?.abbreviation === "P";
        if (isPitcher) {
          const { getPitcherArsenal } = await import("@/lib/mlb-pitch-arsenal");
          const [log, splits, arsenal] = await Promise.all([
            getPitcherTwoSeasonLog(player.id, player.fullName),
            getPitcherPlatoonSplits(player.id),
            getPitcherArsenal(player.id),
          ]);
          ctx.pitchersByName[playerName] = log;
          ctx.pitcherPlatoon[playerName] = splits;
          ctx.pitcherArsenal[playerName] = arsenal;
          return;
        }
        const [log, statcast, splits] = await Promise.all([
          getBatterTwoSeasonLog(player.id, player.fullName),
          tryFetchBatterExitVelocity(player.id),
          getBatterPlatoonSplits(player.id),
        ]);
        ctx.batters[playerName] = log;
        batterTeamIds[playerName] = player.currentTeam?.id;
        ctx.exitVelo[playerName] = statcast;
        ctx.platoonSplits[playerName] = splits;
      })(),
    );
  }

  // 3b) Probable pitcher hand (LHP / RHP) for handedness platoon read
  const pitcherHandFetches = extraction.teams.map(async (teamName) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slot = (mlbData as any)[teamName];
    const pp = slot?.probablePitchers;
    if (!pp) return;
    const teamObjName: string = slot?.team?.name || teamName;
    const homeTeamName: string | undefined = pp.homeTeam;
    const isHome = homeTeamName && typeof homeTeamName === "string" && homeTeamName.toLowerCase().includes(teamObjName.toLowerCase());
    const ownPitcher = isHome ? pp.homePitcher : pp.awayPitcher;
    if (ownPitcher?.id) {
      ctx.pitcherHand[teamName] = await getPitcherHandedness(ownPitcher.id);
    }
  });

  // Weather fetch — for the home park if we can identify it.
  const homeTeamName = extraction.homeTeam || extraction.teams[0];
  const weatherFetch = (async () => {
    if (!homeTeamName) return;
    try {
      const { getGameWeather } = await import("@/lib/mlb-weather");
      ctx.weather = await getGameWeather(homeTeamName);
    } catch (e) {
      console.error("[MLB Weather] failed:", e);
    }
  })();

  await Promise.all([...teamFetches, ...pitcherFetches, ...playerFetches, ...pitcherHandFetches, weatherFetch]);

  // 4) Batter-vs-pitcher: resolve opposing probable pitcher by team id, then query career split.
  // Also collect per-team probable pitcher id/name so we can query career vs opponent depth later.
  const bvpFetches: Promise<void>[] = [];
  interface ProbablePitcherInfo { id: number; name: string; teamId: number | undefined }
  const probablePitchersByTeam: Record<string, ProbablePitcherInfo | null> = {};
  for (const teamName of extraction.teams) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slot = (mlbData as any)[teamName];
    const pp = slot?.probablePitchers;
    if (!pp) { probablePitchersByTeam[teamName] = null; continue; }
    const teamObjName: string = slot?.team?.name || teamName;
    const teamId: number | undefined = slot?.team?.id;
    const homeTeamName: string | undefined = pp.homeTeam;
    const isHome = homeTeamName && typeof homeTeamName === "string" && homeTeamName.toLowerCase().includes(teamObjName.toLowerCase());
    const ownPitcher = isHome ? pp.homePitcher : pp.awayPitcher;
    probablePitchersByTeam[teamName] = ownPitcher?.id
      ? { id: ownPitcher.id, name: ownPitcher.fullName, teamId }
      : null;
  }

  for (const playerName of extraction.players) {
    const batter = ctx.batters[playerName];
    if (!batter) continue;
    const myTeamId = batterTeamIds[playerName];
    let opponentPP: ProbablePitcherInfo | null = null;
    for (const info of Object.values(probablePitchersByTeam)) {
      if (!info) continue;
      if (myTeamId && info.teamId && info.teamId === myTeamId) continue;
      opponentPP = info;
      break;
    }
    if (!opponentPP) continue;
    bvpFetches.push(
      (async () => {
        const bvp = await getBatterVsPitcher(batter.batterId, batter.batterName, opponentPP!.id, opponentPP!.name);
        if (bvp && bvp.pa > 0) {
          ctx.batterVsPitcher[playerName] = bvp;
        }
      })(),
    );
  }

  // 4b) Probable pitcher's career vs opposing team - pulls 6 seasons for a deeper track record.
  for (const teamName of extraction.teams) {
    const pp = probablePitchersByTeam[teamName];
    if (!pp) continue;
    const opponentTeamName = extraction.teams.find((t) => t !== teamName);
    if (!opponentTeamName) continue;
    const opp = ctx.teams[opponentTeamName];
    if (!opp) continue;
    bvpFetches.push(
      (async () => {
        const career = await getPitcherCareerVsOpponent(pp.id, opp.teamId, 6);
        if (career.length > 0) {
          ctx.pitcherCareerVsOpponent[teamName] = career;
        }
      })(),
    );
  }

  // 4c) If bet is a pitcher prop, also pull the prop pitcher's career vs the other team.
  for (const playerName of extraction.players) {
    const pitcherTS = ctx.pitchersByName[playerName];
    if (!pitcherTS) continue;
    if (ctx.batters[playerName]) continue;
    const anyTeam = extraction.teams.map((t) => ctx.teams[t]).find((t) => !!t);
    if (!anyTeam) continue;
    bvpFetches.push(
      (async () => {
        const career = await getPitcherCareerVsOpponent(pitcherTS.pitcherId, anyTeam.teamId, 6);
        if (career.length > 0) {
          ctx.pitcherCareerVsOpponent[playerName] = career;
        }
      })(),
    );
  }

  // 5) Standings (futures only)
  const marketLower = `${extraction.market || ""} ${extraction.description || ""}`.toLowerCase();
  const isFuturesBet =
    (extraction.betType as string) === "futures" ||
    marketLower.includes("division") ||
    marketLower.includes("pennant") ||
    marketLower.includes("league champ") ||
    marketLower.includes("world series");
  if (isFuturesBet) {
    const { last, current } = getLastAndCurrentSeasons();
    const seasons = [last - 2, last - 1, last, current];
    ctx.standings = await getMLBStandingsForSeasons(seasons);
  }

  await Promise.all(bvpFetches);
  return ctx;
}

// ── NBA history enrichment ────────────────────────────────────────

async function buildNBAHistoryContext(
  extraction: BetExtraction,
): Promise<NBAHistoryContext> {
  const ctx: NBAHistoryContext = {
    teams: {},
    players: {},
    standings: [],
  };

  const teamFetches = extraction.teams.map(async (name) => {
    const resolved = await resolveNBATeam(name);
    if (!resolved) return;
    const ts = await getNBATeamTwoSeason(resolved.id, resolved.name, resolved.abbreviation);
    ctx.teams[name] = ts;
  });

  const playerFetches = extraction.players.map(async (name) => {
    const resolved = await resolveNBAPlayer(name);
    if (!resolved) return;
    const log = await getNBAPlayerTwoSeason(resolved.id, resolved.displayName);
    ctx.players[name] = log;
  });

  await Promise.all([...teamFetches, ...playerFetches]);

  // Standings only for futures bets
  const marketLower = `${extraction.market || ""} ${extraction.description || ""}`.toLowerCase();
  const isFuturesBet =
    (extraction.betType as string) === "futures" ||
    marketLower.includes("division") ||
    marketLower.includes("conference") ||
    marketLower.includes("champion") ||
    marketLower.includes("finals");
  if (isFuturesBet) {
    const { current, last } = getCurrentAndLastNBASeasons();
    ctx.standings = await getNBAStandingsForSeasons([last - 2, last - 1, last, current]);
  }

  // Quarter / half score enrichment - expensive but loads quarter scores
  // per game so we can answer ANY period prop. Match liberally so we don't
  // miss "1st quarter points", "Q3 over", "first half scoring", "by half".
  const isQuarterBet =
    /\b(q[1-4]\b|1h\b|2h\b|h1\b|h2\b|first half|second half|1st half|2nd half|first quarter|second quarter|third quarter|fourth quarter|1st quarter|2nd quarter|3rd quarter|4th quarter|by quarter|each quarter|each half|by half|through 3|first 3 quarter|1st 3 quarter)/.test(marketLower);
  if (isQuarterBet) {
    await Promise.all(
      Object.values(ctx.teams).map((t) => enrichRecentQuarterScores(t, 40)),
    );
  }

  return ctx;
}

// ── NHL history enrichment ────────────────────────────────────────

async function buildNHLHistoryContext(
  extraction: BetExtraction,
): Promise<NHLHistoryContext> {
  const ctx: NHLHistoryContext = { teams: {}, players: {}, standings: [] };

  const teamFetches = extraction.teams.map(async (name) => {
    const resolved = resolveNHLTeam(name);
    if (!resolved) return;
    const ts = await getNHLTeamTwoSeason(resolved.abbrev, resolved.name);
    ctx.teams[name] = ts;
  });

  const playerFetches = extraction.players.map(async (name) => {
    const resolved = await resolveNHLPlayer(name);
    if (!resolved) return;
    const log = await getNHLPlayerTwoSeason(resolved.id, resolved.name, resolved.position);
    ctx.players[name] = log;
  });

  await Promise.all([...teamFetches, ...playerFetches]);

  const marketLower = `${extraction.market || ""} ${extraction.description || ""}`.toLowerCase();
  const isFuturesBet =
    (extraction.betType as string) === "futures" ||
    marketLower.includes("division") ||
    marketLower.includes("conference") ||
    marketLower.includes("stanley cup") ||
    marketLower.includes("champion") ||
    marketLower.includes("presidents");
  if (isFuturesBet) {
    ctx.standings = await getNHLStandingsForRecentYears();
  }

  const isFirstPeriod =
    marketLower.includes("1st period") ||
    marketLower.includes("first period") ||
    /\b1p\b/.test(marketLower) ||
    marketLower.includes("period 1");
  if (isFirstPeriod) {
    await Promise.all(
      Object.values(ctx.teams).map((t) => enrichNHLRecentPeriodScores(t, 30)),
    );
  }

  return ctx;
}

/**
 * Route data fetching to the best API for each sport.
 */
async function fetchSportData(
  extraction: BetExtraction
): Promise<{ data: Record<string, unknown>; source: string }> {
  const sport = (extraction.sport || "").toUpperCase();
  const isNBA = sport === "NBA" || sport === "BASKETBALL";
  const isMLB = sport === "MLB" || sport === "BASEBALL";

  // BDL disabled for now (free tier doesn't include stats/game logs).
  // Code lives in balldontlie.ts - re-enable when upgraded to paid plan.
  // To re-enable: uncomment the block below and set BDL_API_KEY.
  /*
  if (isNBA) {
    console.log("[Stats] Using Ball Don't Lie for NBA data");
    const bdlData = await fetchNBAData(
      extraction.teams,
      extraction.players,
      extraction.market,
      extraction.line
    );

    if (!bdlData._unsupported) {
      const espnData = await fetchAllTeamData(extraction.sport, extraction.teams);
      for (const team of extraction.teams) {
        const espnTeam = (espnData as any)?.[team];
        if (espnTeam && bdlData[team] && typeof bdlData[team] === "object") {
          const target = bdlData[team] as any;
          if (espnTeam.recentGames) target.recentGames = espnTeam.recentGames;
          if (espnTeam.record) target.record = espnTeam.record;
          if (espnTeam.stats) target.stats = espnTeam.stats;
          if (espnTeam.team) target.espnTeam = espnTeam.team;
        } else if (espnTeam && !bdlData[team]) {
          bdlData[team] = espnTeam;
        }
      }
      return { data: bdlData, source: "balldontlie+espn" };
    }
  }
  */

  if (isMLB) {
    console.log("[Stats] Using MLB Stats API for baseball data");
    const mlbData = await fetchMLBData(
      extraction.teams,
      extraction.players,
      extraction.market,
      extraction.line
    );

    if (!mlbData._unsupported) {
      const espnData = await fetchAllTeamData(extraction.sport, extraction.teams);
      for (const team of extraction.teams) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const espnTeam = (espnData as any)?.[team];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mlbTeam = mlbData[team] as any;
        if (espnTeam && mlbTeam && typeof mlbTeam === "object") {
          if (!mlbTeam.recentGames?.length && espnTeam.recentGames) {
            mlbTeam.recentGames = espnTeam.recentGames;
          }
          if (!mlbTeam.record && espnTeam.record) {
            mlbTeam.record = espnTeam.record;
          }
        } else if (espnTeam && !mlbData[team]) {
          mlbData[team] = espnTeam;
        }
      }

      // ── MLB history enrichment (two-season deterministic charts) ──
      try {
        const history = await buildMLBHistoryContext(extraction, mlbData);
        (mlbData as Record<string, unknown>)._mlbHistory = history;
      } catch (e) {
        console.error("[MLB History] enrichment failed:", e);
      }

      return { data: mlbData, source: "mlbstats+espn" };
    }
  }

  // NHL: use NHL Stats API
  const isNHL = sport === "NHL" || sport === "HOCKEY";
  if (isNHL) {
    console.log("[Stats] Using NHL Stats API for hockey data");
    const nhlData = await fetchNHLData(
      extraction.teams,
      extraction.players,
      extraction.market,
      extraction.line
    );

    if (!nhlData._unsupported) {
      // Supplement with ESPN for record/schedule data
      const espnData = await fetchAllTeamData(extraction.sport, extraction.teams);
      for (const team of extraction.teams) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const espnTeam = (espnData as any)?.[team];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nhlTeam = nhlData[team] as any;
        if (espnTeam && nhlTeam && typeof nhlTeam === "object") {
          if (!nhlTeam.recentGames?.length && espnTeam.recentGames) {
            nhlTeam.recentGames = espnTeam.recentGames;
          }
          if (!nhlTeam.record && espnTeam.record) {
            nhlTeam.record = espnTeam.record;
          }
        } else if (espnTeam && !nhlData[team]) {
          nhlData[team] = espnTeam;
        }
      }

      // ── NHL history enrichment (two-season deterministic charts) ──
      try {
        const history = await buildNHLHistoryContext(extraction);
        (nhlData as Record<string, unknown>)._nhlHistory = history;
      } catch (e) {
        console.error("[NHL History] enrichment failed:", e);
      }

      return { data: nhlData, source: "nhlstats+espn" };
    }
  }

  // Golf: use leaderboard + player-focused data
  const isGolf = sport === "GOLF" || sport === "PGA" || sport === "PGA TOUR" || sport === "THE MASTERS" || sport === "MASTERS";
  if (isGolf) {
    console.log(`[Stats] Using ESPN golf leaderboard`);
    const golfData = await fetchGolfLeaderboard(extraction.players);

    // For Masters bets, enrich with hole-by-hole history
    const desc = (extraction.description || "").toLowerCase();
    const isMasters = sport === "THE MASTERS" || sport === "MASTERS" ||
      desc.includes("master") || desc.includes("augusta");

    if (isMasters) {
      // Detect if this is a hole-in-one bet
      const exotic = detectExoticMarket(extraction.market || "", extraction.description || "", extraction.sport || "");
      const isHoleInOne = exotic === "hole_in_one";

      if (isHoleInOne) {
        console.log(`[Stats] Fetching Masters hole-in-one history (aggregate)`);
        try {
          // Fetch top players' histories to build aggregate hole-in-one stats
          // Use a well-known set of players who've played multiple Masters
          const topPlayers = extraction.players.length > 0
            ? extraction.players.slice(0, 3)
            : ["Tiger Woods", "Phil Mickelson", "Rory McIlroy"];
          const histories = await Promise.all(
            topPlayers.map((p) => fetchMastersHistory(p).catch(() => null))
          );
          const validHistories = histories.filter((h): h is NonNullable<Awaited<ReturnType<typeof fetchMastersHistory>>> => h != null);
          if (validHistories.length > 0) {
            const hioData = analyzeHoleInOneHistory(validHistories);
            (golfData as Record<string, unknown>)._holeInOne = hioData;
            // Also add per-player data if players specified
            if (extraction.players.length > 0) {
              const mastersData: Record<string, unknown> = {};
              for (let i = 0; i < extraction.players.length && i < 2; i++) {
                const h = validHistories.find((vh) => vh.playerName.toLowerCase().includes(extraction.players[i].toLowerCase()));
                if (h) {
                  mastersData[extraction.players[i]] = {
                    history: h, amenCorner: analyzeAmenCorner(h), sundays: analyzeSundayScoring(h),
                    holeByHole: Array.from({ length: 18 }, (_, j) => analyzeHoleHistory(h, j + 1)),
                    augustaPars: getAugustaPars(),
                  };
                }
              }
              if (Object.keys(mastersData).length > 0) {
                (golfData as Record<string, unknown>)._masters = mastersData;
              }
            }
          }
        } catch (e) {
          console.error("[Stats] Hole-in-one history failed:", e);
        }
      } else if (extraction.players.length > 0) {
        console.log(`[Stats] Fetching Masters hole-by-hole history`);
        try {
          // Timeout after 15s to not block the whole response
          const mastersPromise = async () => {
            const mastersData: Record<string, unknown> = {};
            for (const player of extraction.players.slice(0, 2)) { // cap at 2 players
              const history = await fetchMastersHistory(player);
              if (history) {
                const amenCorner = analyzeAmenCorner(history);
                const sundays = analyzeSundayScoring(history);
                const holeAnalysis = Array.from({ length: 18 }, (_, i) => analyzeHoleHistory(history, i + 1));
                mastersData[player] = { history, amenCorner, sundays, holeByHole: holeAnalysis, augustaPars: getAugustaPars() };
              }
            }
            return mastersData;
          };
          const timeoutPromise = new Promise<Record<string, unknown>>((resolve) =>
            setTimeout(() => { console.log("[Stats] Masters data timed out"); resolve({}); }, 15000)
          );
          const mastersData = await Promise.race([mastersPromise(), timeoutPromise]);
          if (Object.keys(mastersData).length > 0) {
            (golfData as Record<string, unknown>)._masters = mastersData;
          }
        } catch (e) {
          console.error("[Stats] Masters history failed:", e);
        }
      }
    }

    return { data: golfData, source: isMasters ? "espn-golf+masters" : "espn-golf" };
  }

  // Tennis: fetch rankings + match history + H2H
  const isTennis = sport === "TENNIS" || sport === "ATP" || sport === "WTA";
  if (isTennis) {
    console.log(`[Stats] Using ESPN tennis data`);
    const { fetchTennisRankings } = await import("@/lib/espn");
    const { getPlayerMatchHistory, getH2H } = await import("@/lib/tennis");
    const league = (sport === "WTA" ? "wta" : "atp") as "atp" | "wta";
    const rankings = await fetchTennisRankings(league);
    const tennisData: Record<string, unknown> = { _rankings: rankings, _league: league };

    const allPlayers = [...extraction.players, ...extraction.teams].filter(Boolean);
    // Filter out tournament names from player list
    const tournamentKeywords = ["open", "masters", "wimbledon", "roland", "championship", "finals", "cup"];
    // Dedupe case-insensitively so parlay legs that inherit parent teams don't
    // end up with the same player twice (which made H2H queries resolve to
    // a player vs himself).
    const seenPlayerKeys = new Set<string>();
    const realPlayers = allPlayers
      .filter((p) => !tournamentKeywords.some((k) => p.toLowerCase().includes(k)))
      .filter((p) => {
        const key = p.toLowerCase().trim();
        if (!key || seenPlayerKeys.has(key)) return false;
        seenPlayerKeys.add(key);
        return true;
      });

    // Fetch match history for each player (limit to 2 to stay within time budget)
    const playerProfiles: Record<string, unknown> = {};
    const fetchPromises = realPlayers.slice(0, 2).map(async (name) => {
      try {
        const profile = await getPlayerMatchHistory(name, league, [2026, 2025]);
        if (profile) playerProfiles[name] = profile;
      } catch (e) {
        console.error(`[Tennis] Match history failed for ${name}:`, e);
      }
    });
    await Promise.all(fetchPromises);
    tennisData._players = playerProfiles;

    // H2H if two players
    if (realPlayers.length >= 2) {
      try {
        const h2h = await getH2H(realPlayers[0], realPlayers[1], league, [2026, 2025, 2024]);
        if (h2h) tennisData._h2h = h2h;
      } catch (e) {
        console.error("[Tennis] H2H failed:", e);
      }
    }

    // Find bet players in rankings
    for (const name of realPlayers) {
      const nameLower = name.toLowerCase();
      const match = rankings.find(r =>
        r.name.toLowerCase() === nameLower ||
        r.name.toLowerCase().includes(nameLower) ||
        nameLower.includes(r.name.toLowerCase())
      );
      if (match) {
        const existing = (tennisData[name] || {}) as Record<string, unknown>;
        tennisData[name] = { ...existing, ranking: match };
      }
    }
    return { data: tennisData, source: "espn-tennis" };
  }

  // NBA: ESPN team/player data + two-season history enrichment
  if (sport === "NBA" || sport === "BASKETBALL") {
    console.log("[Stats] Using ESPN for NBA + history enrichment");
    const nbaEspn = await fetchAllTeamData(
      extraction.sport,
      extraction.teams,
      extraction.betType === "player_prop" ? extraction.players : undefined,
    );
    try {
      const history = await buildNBAHistoryContext(extraction);
      (nbaEspn as Record<string, unknown>)._nbaHistory = history;
    } catch (e) {
      console.error("[NBA History] enrichment failed:", e);
    }
    return { data: nbaEspn, source: "espn+nba-history" };
  }

  // Default: ESPN for NFL, college, soccer, etc.
  console.log(`[Stats] Using ESPN for ${extraction.sport}`);
  const espnData = await fetchAllTeamData(
    extraction.sport,
    extraction.teams,
    extraction.betType === "player_prop" ? extraction.players : undefined
  );
  return { data: espnData, source: "espn" };
}

/**
 * Call Gemini for AI-generated content.
 * Uses Pro for summaries/exotic bets, flash-lite for nothing anymore.
 */
async function callGemini(
  prompt: string,
  apiKey: string,
  model: string = "gemini-2.5-flash",
  maxOutputTokens: number = 4096
): Promise<string | null> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens },
  });
  const headers = { "Content-Type": "application/json" };

  // Try primary model, fall back to gemini-1.5-flash on 503/429/404
  const models = model === "gemini-1.5-flash"
    ? [model] // Don't fall back from lite
    : [model, "gemini-1.5-flash"];

  for (const m of models) {
    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
      { method: "POST", headers, body },
      1,
      2000
    );
    if (response.ok) {
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
    if (response.status === 503 || response.status === 429 || response.status === 404) {
      console.log(`[Stats] ${m} returned ${response.status}, trying fallback...`);
      continue;
    }
    console.error("Gemini API error:", await response.text());
    return null;
  }
  return null;
}

/**
 * Log bet failures/events to Discord automatically - no user action needed.
 */
async function logToDiscord(
  type: "unsupported" | "error" | "empty_parlay" | "analysis_fail",
  extraction: BetExtraction,
  detail?: string
) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const colors: Record<string, number> = {
    unsupported: 0xf59e0b,  // yellow
    error: 0xef4444,         // red
    empty_parlay: 0xf59e0b,  // yellow
    analysis_fail: 0xef4444, // red
  };

  const titles: Record<string, string> = {
    unsupported: "Unsupported Bet Submitted",
    error: "Analysis Error",
    empty_parlay: "Parlay - No Legs Detected",
    analysis_fail: "Analysis Returned Empty",
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: titles[type] || type,
          color: colors[type] || 0x6366f1,
          fields: [
            { name: "Bet", value: extraction.description || "Unknown", inline: false },
            { name: "Sport / Type", value: `${extraction.sport} - ${extraction.betType?.replace("_", "/")}`, inline: true },
            { name: "Teams", value: extraction.teams?.join(" vs ") || "?", inline: true },
            ...(extraction.players?.length ? [{ name: "Players", value: extraction.players.join(", "), inline: true }] : []),
            ...(detail ? [{ name: "Detail", value: detail.slice(0, 200), inline: false }] : []),
          ],
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch { /* silent */ }
}

async function logParlayToDiscord(
  extraction: BetExtraction,
  legs: { description: string; sport: string; error: boolean; unsupported: boolean; summary: string | null }[]
) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const analyzed = legs.filter((l) => !l.error && !l.unsupported);
  const failed = legs.filter((l) => l.error || l.unsupported);

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `\u{1F3B0} ${legs.length}-Leg Parlay Analyzed`,
          color: failed.length === 0 ? 0x10b981 : failed.length === legs.length ? 0xef4444 : 0xf59e0b,
          fields: [
            { name: "Bet", value: extraction.description || `${legs.length}-leg parlay`, inline: false },
            { name: "Analyzed", value: `${analyzed.length}/${legs.length} legs`, inline: true },
            ...(extraction.odds ? [{ name: "Odds", value: extraction.odds, inline: true }] : []),
            ...legs.map((l, i) => ({
              name: `Leg ${i + 1}: ${l.sport}`,
              value: l.error || l.unsupported
                ? `\u274C ${l.description || "Unknown"}`
                : `\u2705 ${l.description || "Unknown"}`,
              inline: false,
            })),
          ],
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch { /* silent */ }
}

function parseGeminiJSON(text: string): Record<string, unknown> {
  let jsonText = text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(jsonText);
}

/**
 * Core analysis for a single bet - used by both single bets and parlay legs.
 * No HTTP round-trip, runs directly in the same function.
 */
async function analyzeSingleBet(
  extraction: BetExtraction,
  apiKey: string
): Promise<Record<string, unknown>> {
  // Guard against null/undefined sport or betType from failed extraction
  if (!extraction.sport) {
    logToDiscord("error", extraction, "Extraction missing sport field");
    return {
      summary: "We couldn't identify the sport from your bet. Try a clearer screenshot.",
      stats: [],
      charts: [],
      _computed: { source: "error" },
    };
  }

  let teamData: Record<string, unknown>;
  let source: string;

  const cacheKey = getCacheKey(extraction);
  const cached = getCachedData(cacheKey);

  if (cached) {
    console.log(`[Stats] Cache hit for ${cacheKey.slice(0, 60)}`);
    teamData = cached.data;
    source = cached.source + "+cached";
  } else {
    try {
      const result = await fetchSportData(extraction);
      teamData = result.data;
      source = result.source;
      setCachedData(cacheKey, teamData, source);
    } catch (e) {
      console.error("[Stats] fetchSportData failed:", e);
      logToDiscord("error", extraction, `Data fetch failed: ${(e as Error).message}`);
      // Return empty result instead of crashing
      return {
        summary: "We couldn't pull the data for this bet right now. Try again in a moment.",
        stats: [],
        charts: [],
        _computed: { source: "error" },
      };
    }
  }

  if (teamData._unsupported) {
    return { unsupported: true };
  }

  // Enrich with exotic market data using centralized detection
  const exotic = detectExoticMarket(extraction.market || "", extraction.description || "", extraction.sport || "");
  if (exotic === "first_basket" && isNBASport(extraction.sport || "") && extraction.players.length > 0) {
    try {
      const fbData = await getFirstBasketData(extraction.players[0], extraction.teams);
      if (fbData) {
        (teamData as Record<string, unknown>)._firstBasket = fbData;
        console.log(`[Stats] First basket data: ${fbData.gamesProcessed} games`);
      }
    } catch (e) {
      console.error("[Stats] First basket enrichment failed:", e);
    }
  } else if ((exotic === "nrfi" || exotic === "first_5_innings") && isMLBSport(extraction.sport || "")) {
    try {
      const pitcherName = extraction.players.length > 0 ? extraction.players[0] : null;
      if (pitcherName) {
        // Specific pitcher named
        const nrfiData = await getFirstInningData(pitcherName);
        if (nrfiData) {
          (teamData as Record<string, unknown>)._nrfi = nrfiData;
          console.log(`[Stats] NRFI data: ${nrfiData.pitcher?.cleanFirstInnings || 0} clean 1st innings`);
        }
      }
      // Always build team-level NRFI data from our database
      if (extraction.teams.length >= 2) {
        const team1Pitchers = getTeamPitchers(extraction.teams[0]);
        const team2Pitchers = getTeamPitchers(extraction.teams[1]);
        const teamNrfi = {
          team1: { name: extraction.teams[0], pitchers: team1Pitchers.slice(0, 5).map((p) => ({ name: p.name, nrfiRate: p.nrfiRate, gamesStarted: p.gamesStarted, cleanFirstInnings: p.cleanFirstInnings, recentGames: p.recentGames.slice(0, 5) })) },
          team2: { name: extraction.teams[1], pitchers: team2Pitchers.slice(0, 5).map((p) => ({ name: p.name, nrfiRate: p.nrfiRate, gamesStarted: p.gamesStarted, cleanFirstInnings: p.cleanFirstInnings, recentGames: p.recentGames.slice(0, 5) })) },
        };
        (teamData as Record<string, unknown>)._teamNrfi = teamNrfi;
        console.log(`[Stats] Team NRFI: ${team1Pitchers.length} pitchers for ${extraction.teams[0]}, ${team2Pitchers.length} for ${extraction.teams[1]}`);
      }
    } catch (e) {
      console.error("[Stats] NRFI enrichment failed:", e);
    }
  } else if (exotic === "futures") {
    try {
      const standings = await fetchStandings(extraction.sport || "", true);
      (teamData as Record<string, unknown>)._standings = standings;
      console.log(`[Stats] Standings: ${standings.current.length} current, ${standings.prior.length} prior season`);
    } catch (e) {
      console.error("[Stats] Standings fetch failed:", e);
    }
  } else if (exotic === "first_goal" && isNHLSport(extraction.sport || "") && extraction.players.length > 0) {
    try {
      const fgData = await getFirstGoalData(extraction.players[0], extraction.teams);
      if (fgData) {
        (teamData as Record<string, unknown>)._firstGoal = fgData;
        console.log(`[Stats] First goal data loaded`);
      }
    } catch (e) {
      console.error("[Stats] First goal enrichment failed:", e);
    }
  }

  // Auto-enrich with prior season data when current season has thin player data
  if (extraction.betType === "player_prop" && extraction.players.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const players = (teamData as any)?._players;
    const playerName = extraction.players[0];
    const pData = players?.[playerName];
    const gameLog = pData?.gameLog || pData?.gameLogs || [];
    const currentGames = Array.isArray(gameLog) ? gameLog.length : 0;

    // Always include prior season for richer data (early in season most players have few games)
    if (currentGames < 30) {
      console.log(`[Stats] ${currentGames} games for ${playerName} - enriching with prior season`);
      const priorYear = new Date().getFullYear() - 1;
      try {
        const sport = (extraction.sport || "").toUpperCase();
        if (sport === "MLB" || sport === "BASEBALL") {
          const player = await (await import("@/lib/mlbstats")).searchPlayer(playerName);
          if (player) {
            const priorLog = await (await import("@/lib/mlbstats")).getPlayerGameLog(player.id, priorYear);
            if (priorLog && Array.isArray(priorLog) && priorLog.length > 0) {
              // Merge: prior season first, then current season
              if (pData && players) {
                pData.gameLog = [...priorLog, ...gameLog];
                pData.propAnalysis = null; // Force recompute with merged data
                console.log(`[Stats] Merged ${priorLog.length} prior season games (${currentGames} → ${pData.gameLog.length})`);
              }
            }
          }
        } else if (sport === "NHL" || sport === "HOCKEY") {
          const player = await (await import("@/lib/nhlstats")).searchPlayer(playerName);
          if (player) {
            const priorSeason = `${priorYear - 1}${priorYear}`;
            const priorLog = await (await import("@/lib/nhlstats")).getPlayerGameLog(player.playerId, priorSeason);
            if (priorLog && Array.isArray(priorLog) && priorLog.length > 0) {
              if (pData && players) {
                pData.gameLog = [...priorLog, ...gameLog];
                pData.propAnalysis = null;
                console.log(`[Stats] Merged ${priorLog.length} prior season games (${currentGames} → ${pData.gameLog.length})`);
              }
            }
          }
        }
        // NBA: ESPN game logs are already full season, BDL is disabled - skip
      } catch (e) {
        console.error("[Stats] Prior season enrichment failed:", e);
      }
    }
  }

  // Auto-enrich team data with prior season games for spread/ML/O-U when data is thin
  // This is generalized across ALL sports - ESPN schedule API supports season param
  if (["spread", "over_under", "moneyline"].includes(extraction.betType) && extraction.teams.length >= 1) {
    const priorYear = new Date().getFullYear() - 1;
    for (const teamName of extraction.teams) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const td = (teamData as any)[teamName];
      const games = td?.recentGames;
      if (Array.isArray(games) && games.length < 30 && games.length > 0 && td?.team?.id) {
        console.log(`[Stats] ${teamName} has ${games.length} games - fetching ${priorYear} season`);
        try {
          const { getTeamSchedule } = await import("@/lib/espn");
          const priorSchedule = await getTeamSchedule(extraction.sport, td.team.id, priorYear);
          if (priorSchedule) {
            // Parse prior schedule the same way current is parsed
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const priorEvents = (priorSchedule as any)?.events || [];
            const priorGames = priorEvents
              .filter((e: { competitions?: { competitors?: unknown[] }[] }) => e.competitions?.[0]?.competitors?.length)
              .map((e: Record<string, unknown>) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const comp = (e as any).competitions[0];
                const home = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "home");
                const away = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "away");
                const isHome = home?.team?.id === td.team.id;
                const teamComp = isHome ? home : away;
                const oppComp = isHome ? away : home;
                const teamScore = Number(teamComp?.score) || 0;
                const oppScore = Number(oppComp?.score) || 0;
                const completed = comp.status?.type?.completed;
                if (!completed) return null;
                return {
                  opponent: oppComp?.team?.displayName || oppComp?.team?.shortDisplayName || "?",
                  teamScore, opponentScore: oppScore,
                  won: teamScore > oppScore, margin: teamScore - oppScore,
                  home: isHome, totalPoints: teamScore + oppScore,
                  date: (e as { date?: string }).date?.slice(0, 10) || "",
                  priorSeason: true,
                };
              })
              .filter(Boolean);
            if (priorGames.length > 0) {
              td.recentGames = [...priorGames, ...games];
              console.log(`[Stats] Merged ${priorGames.length} prior season games for ${teamName} (${games.length} → ${td.recentGames.length})`);
            }
          }
        } catch (e) {
          console.error(`[Stats] Prior season team enrichment failed for ${teamName}:`, e);
        }
      }
    }
  }

  let computed;
  try {
    computed = computeAnalysis(teamData, extraction);
  } catch (e) {
    console.error("[Stats] computeAnalysis failed:", e);
    logToDiscord("error", extraction, `Analysis compute failed: ${(e as Error).message}`);
    // Fall through to AI-only analysis
    computed = computeAnalysis({}, extraction);
  }

  const isDeterministic = DETERMINISTIC_BET_TYPES.includes(extraction.betType);
  let charts: ChartConfig[] = [];
  try {
    charts = isDeterministic
      ? buildCharts(extraction.betType, computed, extraction, teamData)
      : [];
  } catch (e) {
    console.error("[Stats] buildCharts failed:", e);
    // Continue without charts
  }

  const isSummaryOnly = isDeterministic && charts.length > 0;
  let prompt: string;
  try {
    prompt = isSummaryOnly
      ? buildSummaryPrompt(extraction, computed, teamData)
      : buildFullAIPrompt(extraction, computed, teamData);
  } catch (e) {
    console.error("[Stats] Prompt build failed:", e);
    // Use a minimal fallback prompt so we still call Gemini and return charts
    prompt = `Bet: ${extraction.description}. Sport: ${extraction.sport}. Give a brief one-paragraph summary based on general knowledge. Return JSON {"summary":"...","stats":[]}.`;
  }

  // Run Gemini + game status check in parallel
  const [text, gameStatus] = await Promise.all([
    callGemini(
      prompt,
      apiKey,
      isSummaryOnly ? "gemini-1.5-flash" : "gemini-2.5-flash",
      isSummaryOnly ? 2048 : 4096
    ),
    // Skip game status for futures - no specific game to track
    (((extraction.betType as string) === "futures")
      ? Promise.resolve(null)
      : checkGameStatus(
          extraction.sport,
          extraction.teams,
          extraction.betType,
          extraction.players,
          extraction.market,
          extraction.line
        )
    ).catch((e) => {
      console.error("[Stats] Game status check failed:", e);
      return null;
    }),
  ]);

  let aiResult: Record<string, unknown> = {};
  if (text) {
    try {
      aiResult = parseGeminiJSON(text);
    } catch (e) {
      console.error("[Stats] JSON parse failed:", e);
      aiResult = { summary: "Check the charts below.", stats: [] };
    }
  }

  // Compute Swish Score
  let swishScore;
  try {
    swishScore = computeSwishScore(extraction.betType, computed, extraction, teamData);
  } catch (e) {
    console.error("[Stats] computeSwishScore failed:", e);
    swishScore = { score: 5, label: "Toss-Up", detail: "Score unavailable" };
  }

  // Compute Key Insight
  let keyInsight = "";
  try {
    keyInsight = computeKeyInsight(extraction, computed, teamData);
  } catch (e) {
    console.error("[Stats] computeKeyInsight failed:", e);
  }

  // Compute smart suggestion chips
  let suggestions: string[] = [];
  try {
    suggestions = computeSmartSuggestions(extraction, computed, teamData);
  } catch (e) {
    console.error("[Stats] computeSmartSuggestions failed:", e);
  }

  // Extract visual metadata (logos, headshots, colors) from team data
  let visuals: ReturnType<typeof extractVisuals> = { teams: {}, players: {} };
  try {
    visuals = extractVisuals(teamData, extraction);
  } catch (e) {
    console.error("[Stats] extractVisuals failed:", e);
  }

  // Compute hit rate and prepend to stats
  let hitRate;
  try {
    hitRate = computeHitRate(extraction, computed, teamData);
  } catch (e) {
    console.error("[Stats] computeHitRate failed:", e);
    hitRate = null;
  }
  const aiStats = (aiResult.stats || []) as { label: string; value: string; context: string }[];
  const allStats = hitRate ? [hitRate, ...aiStats] : aiStats;

  // MLB player-prop: deterministic structured insights (verdict, projection, bullets, flags)
  const mlbInsights = computeMLBInsights(extraction, teamData);
  const nbaInsights = await computeNBAInsights(extraction, teamData);

  // Insights-driven Swish Score override - when we have a real projection
  // (MLB or NBA player prop), the default scorer tends to bottom out at
  // "Shaky" because it expects a different data shape. Use the projection's
  // edge + bullet positivity to compute a meaningful score.
  const insights = mlbInsights || nbaInsights;
  const overridden = scoreFromInsights(insights);
  if (overridden && extraction.betType === "player_prop") {
    swishScore = overridden;
  }

  if (isSummaryOnly) {
    return {
      summary: aiResult.summary || "Check the charts below.",
      stats: allStats,
      charts,
      _computed: { oddsAnalysis: computed.oddsAnalysis, source },
      gameStatus,
      visuals,
      swishScore,
      keyInsight,
      suggestions,
      mlbInsights,
      nbaInsights,
    };
  }

  return {
    summary: aiResult.summary || "",
    stats: allStats,
    charts: (aiResult.charts as unknown[])?.length ? aiResult.charts : charts,
    _computed: { oddsAnalysis: computed.oddsAnalysis, source },
    gameStatus,
    visuals,
    swishScore,
    keyInsight,
    suggestions,
    mlbInsights,
    nbaInsights,
  };
}

/**
 * Convert structured insights into a Swish Score. The score equals the
 * estimated probability the bet hits, on a 0-10 scale (probability * 10).
 * 7.0 = ~70% chance of hitting. 5.0 = coin flip.
 *
 * Falls back to edge-based scoring when probability isn't computable
 * (e.g. team bets that don't go through hitter/pitcher insights paths).
 */
function scoreFromInsights(
  insights:
    | {
        projection?: { edge: number; lean: string };
        probability?: number;
        bullets: { tone: string }[];
        flags: string[];
      }
    | undefined
): { score: number; label: string; detail: string } | undefined {
  if (!insights) return undefined;

  // Preferred path: use the computed hit probability directly
  if (typeof insights.probability === "number") {
    const p = Math.max(0.05, Math.min(0.95, insights.probability));
    const pct = Math.round(p * 100);
    const score = Math.round(p * 100) / 10;
    const label =
      p >= 0.75 ? "Strong" :
      p >= 0.62 ? "Solid" :
      p >= 0.48 ? "Toss-Up" :
      p >= 0.35 ? "Shaky" :
      "Weak";
    return {
      score,
      label,
      detail: `~${pct}% chance to hit (model estimate)`,
    };
  }

  // Fallback: edge / bullet-tone heuristic for paths without probability
  if (!insights.projection) return undefined;
  const edge = Math.abs(insights.projection.edge);
  const posBullets = insights.bullets.filter((b) => b.tone === "pos").length;
  const negBullets = insights.bullets.filter((b) => b.tone === "neg").length;
  let raw = 50;
  raw += Math.min(30, edge * 100);
  raw += (posBullets - negBullets) * 5;
  raw -= (insights.flags?.length || 0) * 3;
  raw = Math.max(20, Math.min(95, raw));
  const lean = insights.projection.lean;
  const label =
    raw >= 80 ? "Strong" :
    raw >= 65 ? "Solid" :
    raw >= 50 ? "Toss-Up" :
    raw >= 35 ? "Shaky" :
    "Weak";
  return {
    score: Math.round(raw) / 10,
    label,
    detail: `${insights.bullets.length} insight${insights.bullets.length === 1 ? "" : "s"}, projection ${lean}.`,
  };
}

/**
 * MLB player-prop deterministic insights - pulls the in-memory MLB history
 * context from teamData and produces structured insights for the UI.
 */
function computeMLBInsights(
  extraction: BetExtraction,
  rawData: Record<string, unknown>
) {
  const sport = (extraction.sport || "").toUpperCase();
  if (sport !== "MLB" && sport !== "BASEBALL") return undefined;
  if (extraction.betType !== "player_prop") return undefined;
  const player = extraction.players[0];
  if (!player) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history = (rawData as any)?._mlbHistory;
  if (!history) return undefined;

  const market = extraction.market || "";
  const desc = extraction.description || "";
  const m = `${market} ${desc}`.toLowerCase();

  // Detect pitcher vs hitter prop
  const isPitcher =
    m.includes("strikeout") || /\bks?\b/.test(m) || m.includes("earned run") || m.includes("inning");

  // Resolve the OPPOSING team correctly. The previous expression always
  // returned teams[0] (it boolean-coerced to true). For a pitcher prop,
  // the opp team is whichever team in extraction.teams is NOT the team
  // whose probable pitcher is this player. For a batter prop, it's
  // whichever team's probable pitcher this batter has BvP against — but
  // since we don't have the batter's team here, fall back to teams[1].
  let oppTeam = extraction.teams[1] || extraction.teams[0];
  if (isPitcher) {
    // Find which team's probable pitcher matches this player; opposing = the other
    for (const tn of extraction.teams) {
      const pp = history.probablePitchers?.[tn];
      if (pp?.pitcherName?.toLowerCase() === player.toLowerCase()) {
        oppTeam = extraction.teams.find((t) => t !== tn) || extraction.teams[1] || tn;
        break;
      }
    }
  }

  try {
    if (isPitcher) {
      const pitcher = history.pitchersByName?.[player];
      if (!pitcher) return undefined;
      const focus: "strikeouts" | "era" | "innings" =
        m.includes("strikeout") || /\bks?\b/.test(m)
          ? "strikeouts"
          : m.includes("earned run") || m.includes("era")
            ? "era"
            : "innings";
      const career = history.pitcherCareerVsOpponent?.[player];
      const oppHitting = oppTeam ? history.teamHitting?.[oppTeam] : null;
      const pitcherSplits = history.pitcherPlatoon?.[player];
      const arsenal = history.pitcherArsenal?.[player];
      // Lazy-load to avoid pulling the lib unless we need it
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { buildPitcherInsights } = require("@/lib/mlb-insights");
      return buildPitcherInsights({
        pitcher, focus, line: extraction.line, oppTeam, career,
        homeTeam: extraction.homeTeam,
        oppHitting,
        pitcherSplits,
        arsenal,
      });
    }

    const batter = history.batters?.[player];
    if (!batter) return undefined;
    const stat: "hits" | "homeRuns" | "rbi" | "totalBases" | "runs" | "strikeOuts" | "stolenBases" =
      m.includes("total base") ? "totalBases" :
      m.includes("home run") || /\bhr\b/.test(m) ? "homeRuns" :
      m.includes("rbi") || m.includes("runs batted") ? "rbi" :
      m.includes("stolen base") ? "stolenBases" :
      m.includes("run scored") || m.includes("runs scored") ? "runs" :
      m.includes("strikeout") ? "strikeOuts" :
      "hits";
    const bvp = history.batterVsPitcher?.[player];
    const isHome =
      extraction.homeTeam && extraction.teams[0]
        ? extraction.teams[0].toLowerCase() === extraction.homeTeam.toLowerCase()
        : undefined;

    // Anytime / yes-no props (no numeric line): treat as line=0.5 so the
    // hitter logic can still produce a hit-rate verdict + projection. For
    // hits / HR / SB / RBI, "anytime" or "to record" means 1+, and value > 0.5
    // is equivalent to value >= 1.
    const effectiveLine =
      extraction.line != null
        ? extraction.line
        : (m.includes("anytime") || m.includes("to record") || m.includes("to hit") || m.includes("to steal") || m.includes("to homer"))
          ? 0.5
          : null;

    // Resolve opposing pitcher - match probable pitcher to BvP pitcher name,
    // or pick any probable pitcher if BvP missing (better than nothing).
    let oppPitcher: unknown = undefined;
    const probable = (history.probablePitchers || {}) as Record<string, unknown>;
    if (bvp?.pitcherName) {
      const target = bvp.pitcherName.toLowerCase();
      for (const tn of Object.keys(probable)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = probable[tn] as any;
        if (p?.pitcherName && p.pitcherName.toLowerCase() === target) {
          oppPitcher = p;
          break;
        }
      }
    }
    if (!oppPitcher) {
      // Fallback: take whichever probable pitcher exists
      for (const tn of Object.keys(probable)) {
        if (probable[tn]) { oppPitcher = probable[tn]; break; }
      }
    }

    if (effectiveLine == null) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildHitterInsights } = require("@/lib/mlb-insights");
    const statcast = history.exitVelo?.[player];
    const oppPitching = oppTeam ? history.teamPitching?.[oppTeam] : null;
    const platoonSplits = history.platoonSplits?.[player];
    const oppPitcherHand = oppTeam ? history.pitcherHand?.[oppTeam] : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weather = (history as any)?.weather || null;
    return buildHitterInsights({
      batter,
      stat,
      line: effectiveLine,
      oppTeam,
      oppPitcher,
      bvp,
      isHome,
      homeTeam: extraction.homeTeam,
      statcast,
      oppPitching,
      platoonSplits,
      oppPitcherHand,
      weather,
    });
  } catch (e) {
    console.error("[MLB Insights] failed:", e);
    return undefined;
  }
}

/**
 * NBA player-prop deterministic insights - pulls the in-memory NBA history
 * context (when present on teamData) and produces a verdict/projection/bullets
 * structure parallel to mlbInsights. Includes playoff-aware splits.
 */
async function computeNBAInsights(
  extraction: BetExtraction,
  rawData: Record<string, unknown>
) {
  const sport = (extraction.sport || "").toUpperCase();
  if (sport !== "NBA" && sport !== "BASKETBALL") return undefined;
  if (extraction.betType !== "player_prop") return undefined;
  const player = extraction.players[0];
  if (!player) return undefined;
  if (extraction.line == null) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history = (rawData as any)?._nbaHistory;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerData = history?.players?.[player] || (rawData as any)?._players?.[player];
  if (!playerData) return undefined;

  // Coerce into NBAPlayerTwoSeason shape if we got the alt format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const games = playerData.games || playerData.gameLog || [];
  if (!Array.isArray(games) || games.length === 0) return undefined;

  // Normalize game shape: insights expects { stats, opponent, home, seasonType }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = games.map((g: any) => ({
    eventId: g.eventId || g.id || "",
    date: g.date || "",
    season: g.season || 0,
    seasonType: g.seasonType === "playoffs" ? "playoffs" : "regular",
    opponent: g.opponent || g.opp || "",
    home: typeof g.home === "boolean" ? g.home : !!g.isHome,
    stats: g.stats || g, // some shapes flatten stats
  }));

  const ts = {
    playerId: playerData.playerId || playerData.id || "",
    playerName: playerData.playerName || playerData.fullName || player,
    games: normalized,
    lastSeason: playerData.lastSeason || 0,
    currentSeason: playerData.currentSeason || 0,
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { detectNBAStat, buildNBAPlayerInsights } = require("@/lib/nba-insights");
    const stat = detectNBAStat(extraction.market, extraction.description);
    if (!stat) return undefined;

    // Detect if any of the player's games are tagged as playoffs in the
    // current season - if so, treat as playoff context.
    const isPlayoffs = normalized.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (g: any) => g.seasonType === "playoffs",
    );
    // Resolve player's own team by counting how often each team appears as
    // opponent in the player's gamelog. Player's team = the one that appears
    // 0 (or minimum) times as opponent. Opp = the other one. This avoids
    // the previous bug where `find(t => t !== players[0])` always returned
    // the first team since team names never match player names.
    const oppCount: Record<string, number> = {};
    for (const t of extraction.teams) {
      const lower = t.toLowerCase();
      oppCount[t] = normalized.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (g: any) => (g.opponent || "").toLowerCase().includes(lower) || lower.includes((g.opponent || "").toLowerCase()),
      ).length;
    }
    const sortedByCount = Object.entries(oppCount).sort((a, b) => a[1] - b[1]);
    const playerTeam = sortedByCount[0]?.[0]; // least-as-opponent = player's team
    const oppTeam = extraction.teams.find((t) => t !== playerTeam) || extraction.teams[1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oppTeamData = oppTeam ? (history as any)?.teams?.[oppTeam] : undefined;

    // Pull series context from today's NBA scoreboard if this is a playoff
    // game between the two teams. Cheap one-shot fetch with short cache.
    let seriesContext: string | undefined;
    let gameInSeries: number | undefined;
    if (isPlayoffs) {
      try {
        const sb = await (await import("@/lib/fetch")).cachedFetch(
          "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
          60_000,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const events = (sb as any)?.events || [];
        const lower = extraction.teams.map((t) => t.toLowerCase());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const match = events.find((e: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const comps = e.competitions?.[0]?.competitors || [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const names = comps.map((c: any) => (c.team?.displayName || "").toLowerCase());
          return lower.every((t) => names.some((n: string) => n.includes(t) || t.includes(n)));
        });
        if (match) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const series = match.competitions?.[0]?.series;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const notes = match.competitions?.[0]?.notes || [];
          if (series?.summary) seriesContext = series.summary;
          // Extract game number from notes (e.g. "Game 5 of Eastern Conference Finals")
          for (const n of notes) {
            const text = n?.headline || n?.type || "";
            const m = /game\s+(\d)/i.exec(String(text));
            if (m) { gameInSeries = Number(m[1]); break; }
          }
        }
      } catch (e) {
        console.error("[NBA Series] fetch failed:", e);
      }
    }

    return buildNBAPlayerInsights({
      player: ts,
      stat,
      line: extraction.line,
      oppTeam,
      oppTeamData,
      isPlayoffs,
      seriesContext,
      gameInSeries,
    });
  } catch (e) {
    console.error("[NBA Insights] failed:", e);
    return undefined;
  }
}

/**
 * Compute a one-sentence key insight based on bet type and computed data.
 */
function computeKeyInsight(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): string {
  const { teamMetrics, betTypeInsights } = computed;
  const teams = Object.values(teamMetrics);

  switch (extraction.betType) {
    case "player_prop": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playerData = (rawData as any)?._players;
      const playerName = extraction.players[0] || "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pData = playerData?.[playerName] as any;
      const pa = pData?.propAnalysis;
      if (pa) {
        return `${pa.hitCount}/${pa.totalGames} over the line, ${pa.trend} (avg ${pa.average} vs ${pa.line} line)`;
      }
      return "Limited player prop data available";
    }
    case "spread": {
      const team = teams[0];
      if (team?.ats) {
        const total = team.ats.covers + team.ats.fails;
        const avgMargin = team.recentGames.length > 0
          ? Math.round((team.recentGames.reduce((s, g) => s + g.margin, 0) / team.recentGames.length) * 10) / 10
          : 0;
        return `Covered ${extraction.line} in ${team.ats.covers}/${total}, avg margin ${avgMargin > 0 ? "+" : ""}${avgMargin}`;
      }
      return "Limited spread data available";
    }
    case "over_under": {
      const line = extraction.line ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const combined = betTypeInsights._combined as any;
      if (combined?.projectedTotal && line > 0) {
        const proj = combined.projectedTotal;
        const diff = Math.round(Math.abs(proj - line) * 10) / 10;
        const direction = proj >= line ? "over" : "under";
        return `Games project ~${proj} - ${diff} ${direction} the ${line} line`;
      }
      if (teams.length >= 2 && line > 0) {
        const proj = Math.round((teams[0].scoring.avgPointsFor + teams[1].scoring.avgPointsFor) * 10) / 10;
        const diff = Math.round(Math.abs(proj - line) * 10) / 10;
        const direction = proj >= line ? "over" : "under";
        return `Games project ~${proj} - ${diff} ${direction} the ${line} line`;
      }
      return "Limited over/under data available";
    }
    case "moneyline": {
      const team = teams[0];
      if (team) {
        const winPct = Math.round(team.record.pct * 100);
        const streak = `${team.streak.type}${team.streak.count}`;
        // Add venue-specific context when we know home/away
        const isAway = extraction.awayTeam && team.name.toLowerCase().includes(extraction.awayTeam.toLowerCase().split(/\s+/).pop() || "");
        const isHome = extraction.homeTeam && team.name.toLowerCase().includes(extraction.homeTeam.toLowerCase().split(/\s+/).pop() || "");
        const venuePct = isAway && team.awayRecord
          ? `, ${Math.round(team.awayRecord.pct * 100)}% on the road`
          : isHome && team.homeRecord
          ? `, ${Math.round(team.homeRecord.pct * 100)}% at home`
          : "";
        return `${team.name} ${winPct}% win rate${venuePct}, on a ${streak} streak`;
      }
      return "Limited moneyline data available";
    }
    default:
      return "";
  }
}

/**
 * Compute a "hit rate" hero stat showing how often this exact bet would have hit
 * historically. Returns null if not enough data.
 */
function computeHitRate(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): { label: string; value: string; context: string } | null {
  const line = extraction.line ?? 0;
  const teams = Object.values(computed.teamMetrics);

  switch (extraction.betType) {
    case "player_prop": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playerData = (rawData as any)?._players;
      const playerName = extraction.players?.[0] || "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pData = playerData?.[playerName] as any;
      const pa = pData?.propAnalysis;
      if (pa && pa.totalGames >= 3) {
        const pct = Math.round(pa.hitRate * 100);
        const thin = pa.totalGames < 10;
        // Compute current streak
        const gv = pa.gameValues || [];
        let streak = 0;
        if (gv.length > 0) {
          const lastHit = gv[gv.length - 1]?.hit;
          for (let i = gv.length - 1; i >= 0; i--) {
            if (gv[i].hit === lastHit) streak++;
            else break;
          }
        }
        const streakText = streak >= 3 ? ` | ${gv[gv.length - 1]?.hit ? "Over" : "Under"} ${streak} straight` : "";
        return {
          label: "Line Hit Rate",
          value: `${pct}%`,
          context: `Over ${pa.line} in ${pa.hitCount} of ${pa.totalGames} games${streakText}${thin ? " (small sample)" : ""}`,
        };
      }
      return null;
    }
    case "spread": {
      const team = teams[0];
      if (team?.ats && line !== 0) {
        const total = team.ats.covers + team.ats.fails;
        if (total < 3) return null;
        const pct = Math.round(team.ats.coverRate * 100);
        // ATS streak
        let atsStreak = 0;
        const rg = team.recentGames;
        if (rg.length > 0) {
          const lastCovered = rg[rg.length - 1].margin + line > 0;
          for (let i = rg.length - 1; i >= 0; i--) {
            if ((rg[i].margin + line > 0) === lastCovered) atsStreak++;
            else break;
          }
        }
        const atsStreakText = atsStreak >= 3 ? ` | ${rg[rg.length - 1].margin + line > 0 ? "Covered" : "Failed"} ${atsStreak} straight` : "";
        return {
          label: "Cover Rate",
          value: `${pct}%`,
          context: `Covered ${line > 0 ? "+" : ""}${line} in ${team.ats.covers} of ${total} games${atsStreakText}`,
        };
      }
      return null;
    }
    case "over_under": {
      if (line <= 0 || teams.length < 2) return null;
      const t0Games = teams[0].recentGames;
      const t1Games = teams[1].recentGames;
      const t0Overs = t0Games.filter((g) => g.totalPoints > line).length;
      const t1Overs = t1Games.filter((g) => g.totalPoints > line).length;
      const totalGames = t0Games.length + t1Games.length;
      const totalOvers = t0Overs + t1Overs;
      if (totalGames < 6) return null;
      const pct = Math.round((totalOvers / totalGames) * 100);
      const isOver = (extraction.description || "").toLowerCase().includes("over");
      const isUnder = (extraction.description || "").toLowerCase().includes("under");
      // Show per-team breakdown so the user knows exactly where the number comes from
      const t0Name = teams[0].name;
      const t1Name = teams[1].name;
      const perTeam = `${t0Name}: ${t0Overs}/${t0Games.length} over, ${t1Name}: ${t1Overs}/${t1Games.length} over`;
      if (isUnder) {
        const underPct = 100 - pct;
        const t0Unders = t0Games.length - t0Overs;
        const t1Unders = t1Games.length - t1Overs;
        return {
          label: "Under Hit Rate",
          value: `${underPct}%`,
          context: `Under ${line} in ${totalGames - totalOvers}/${totalGames} games (${t0Name}: ${t0Unders}/${t0Games.length}, ${t1Name}: ${t1Unders}/${t1Games.length})`,
        };
      }
      return {
        label: isOver ? "Over Hit Rate" : "O/U Hit Rate",
        value: `${pct}%`,
        context: `Over ${line} in ${totalOvers}/${totalGames} games (${perTeam})`,
      };
    }
    case "moneyline": {
      const team = teams[0];
      if (!team || team.recentGames.length < 3) return null;
      const total = team.record.wins + team.record.losses;
      const pct = Math.round(team.record.pct * 100);
      const thin = total < 10;
      const streakText = team.streak.count >= 2 ? ` | ${team.streak.type}${team.streak.count}` : "";
      return {
        label: "Win Rate",
        value: `${pct}%`,
        context: `${team.record.wins}-${team.record.losses} this season${streakText}${thin ? " (early season)" : ""}`,
      };
    }
    default:
      return null;
  }
}

/**
 * Extract visual metadata (logos, headshots, team colors) from raw team data.
 * These are ESPN CDN URLs - no extra API calls needed.
 */
function extractVisuals(
  teamData: Record<string, unknown>,
  extraction: BetExtraction
): Record<string, unknown> {
  const teams: Record<string, { logo?: string; color?: string }> = {};
  const players: Record<string, { headshot?: string }> = {};

  // Team logos and colors
  for (const name of extraction.teams) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = teamData[name] as any;
    if (data?.team) {
      const t = data.team;
      teams[name] = {
        logo: t.logos?.[0]?.href || t.logo,
        color: t.color ? `#${t.color}` : undefined,
      };
    }
  }

  // Player headshots
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerData = (teamData as any)?._players;
  if (playerData) {
    for (const [pName, pData] of Object.entries(playerData)) {
      if (!pData) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = pData as any;
      const headshot = p.player?.headshot?.href || p.player?.headshot ||
        (p.player?.id ? `https://a.espncdn.com/i/headshots/nba/players/full/${p.player.id}.png` : undefined);
      if (headshot) players[pName] = { headshot };
    }
  }

  return { teams, players };
}

export async function POST(request: NextRequest) {
  try {
    const { extraction } = (await request.json()) as {
      extraction: BetExtraction;
    };

    if (!extraction) {
      return NextResponse.json(
        { error: "No extraction provided" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Log every bet submission to Discord
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      const isParlay = extraction.betType === "parlay";
      const legCount = extraction.legs?.length || 0;
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: `${isParlay ? "🎰" : "📊"} Bet Submitted`,
            color: 0x6366f1,
            fields: [
              { name: "Bet", value: (extraction.description || "?").slice(0, 200), inline: false },
              { name: "Sport", value: extraction.sport || "?", inline: true },
              { name: "Type", value: extraction.betType?.replace("_", "/") || "?", inline: true },
              ...(extraction.market ? [{ name: "Market", value: extraction.market, inline: true }] : []),
              ...(extraction.players?.length ? [{ name: "Players", value: extraction.players.join(", "), inline: true }] : []),
              { name: "Teams", value: extraction.teams?.join(" vs ") || "?", inline: true },
              ...(isParlay ? [{ name: "Legs", value: String(legCount), inline: true }] : []),
            ],
            timestamp: new Date().toISOString(),
          }],
        }),
      }).catch(() => {});
    }

    if (extraction.betType === "parlay") {
      const legs = extraction.legs || [];
      if (legs.length === 0) {
        logToDiscord("empty_parlay", extraction, "No legs extracted from screenshot");
        return NextResponse.json({ parlay: true, legs: [] });
      }

      // Step 1: Fix up legs - inherit missing teams/sport from parent
      // Gemini can return null for any field, so guard everything
      const fixedLegs = legs.slice(0, 6).map((leg) => {
        if (!leg.teams || leg.teams.length === 0) {
          leg.teams = extraction.teams || [];
        }
        // Filter out any null/undefined team names inside the array
        leg.teams = (leg.teams || []).filter((t): t is string => !!t);
        if (!leg.sport) leg.sport = extraction.sport || "";
        if (!leg.market) leg.market = "";
        if (!leg.description) leg.description = "";
        if (!leg.players) leg.players = [];
        // Filter out null player names
        leg.players = (leg.players || []).filter((p): p is string => !!p);
        if (!leg.betType) leg.betType = leg.market ? "player_prop" : "moneyline";
        if (!leg.odds) leg.odds = "";
        return leg;
      });

      // Step 2: Fetch data for ALL legs in parallel (no Gemini calls yet)
      const legData = await Promise.all(
        fixedLegs.map(async (leg) => {
          if (leg.teams.length === 0) return { leg, teamData: null, computed: null, charts: [] };
          try {
            const { data: teamData } = await fetchSportData(leg);
            if (teamData._unsupported) return { leg, teamData: null, computed: null, charts: [] };

            // Enrich with exotic market data (centralized detection)
            const legExotic = detectExoticMarket(leg.market || "", leg.description || "", leg.sport || "");
            if (legExotic === "first_basket" && isNBASport(leg.sport || "") && leg.players.length > 0) {
              try {
                const fbData = await getFirstBasketData(leg.players[0], leg.teams);
                if (fbData) (teamData as Record<string, unknown>)._firstBasket = fbData;
              } catch { /* non-blocking */ }
            } else if (legExotic === "nrfi" && isMLBSport(leg.sport || "") && leg.players.length > 0) {
              try {
                const nrfiData = await getFirstInningData(leg.players[0]);
                if (nrfiData) (teamData as Record<string, unknown>)._nrfi = nrfiData;
              } catch { /* non-blocking */ }
            } else if (legExotic === "first_goal" && isNHLSport(leg.sport || "") && leg.players.length > 0) {
              try {
                const fgData = await getFirstGoalData(leg.players[0], leg.teams);
                if (fgData) (teamData as Record<string, unknown>)._firstGoal = fgData;
              } catch { /* non-blocking */ }
            }

            const computed = computeAnalysis(teamData, leg);
            const isDeterministic = DETERMINISTIC_BET_TYPES.includes(leg.betType);
            const charts = isDeterministic
              ? buildCharts(leg.betType, computed, leg, teamData)
              : [];
            return { leg, teamData, computed, charts };
          } catch {
            return { leg, teamData: null, computed: null, charts: [] };
          }
        })
      );

      // Step 3: ONE Gemini call for all leg summaries
      const batchPrompt = buildParlayBatchPrompt(legData);
      const batchText = await callGemini(batchPrompt, apiKey);
      let legSummaries: Record<string, unknown>[] = [];
      if (batchText) {
        try {
          const parsed = parseGeminiJSON(batchText);
          legSummaries = (parsed.legs as Record<string, unknown>[]) || [];
        } catch (e) {
          console.error("[Parlay] Batch summary parse failed:", e);
        }
      }

      // Step 4: Check game statuses for all legs in parallel (skip futures)
      const legGameStatuses = await Promise.all(
        fixedLegs.map(async (leg) => {
          if (((leg.betType as string) === "futures")) return null;
          try {
            return await checkGameStatus(
              leg.sport, leg.teams, leg.betType,
              leg.players || [], leg.market, leg.line
            );
          } catch { return null; }
        })
      );

      // Step 5: Combine charts + summaries + game status + swish scores
      // Pre-compute per-leg insights for parlay legs so the score override
      // can differentiate them. Done before the synchronous map below since
      // computeNBAInsights is async.
      const legInsightsArr = await Promise.all(
        legData.map(async (ld) => {
          if (!ld.teamData) return undefined;
          const mlb = computeMLBInsights(ld.leg, ld.teamData);
          if (mlb) return mlb;
          const nba = await computeNBAInsights(ld.leg, ld.teamData);
          return nba || undefined;
        }),
      );

      const finalLegs = legData.map((ld, i) => {
        const aiLeg = legSummaries[i] || {};
        const legCharts = ld.charts.length > 0 ? ld.charts : (aiLeg.charts as unknown[]) || [];
        const legSummary = (aiLeg.summary as string) || null;
        const legStats = (aiLeg.stats as unknown[]) || [];
        const hasAnything = legCharts.length > 0 || legSummary || legStats.length > 0;
        const legInsights = legInsightsArr[i];

        // Per-leg Swish Score - prefer insight-driven score (uses real
        // edge / bullet tone) over the default scorer's flat 4.5/Shaky.
        let legSwishScore = undefined;
        if (ld.computed && ld.teamData) {
          legSwishScore = computeSwishScore(ld.leg.betType, ld.computed, ld.leg, ld.teamData);
        }
        const overridden = scoreFromInsights(legInsights);
        if (overridden && ld.leg.betType === "player_prop") {
          legSwishScore = overridden;
        }

        // Per-leg Hit Rate
        const legHitRate = ld.computed && ld.teamData
          ? computeHitRate(ld.leg, ld.computed, ld.teamData)
          : null;

        // Per-leg smart suggestions
        const legSuggestions = ld.computed && ld.teamData
          ? computeSmartSuggestions(ld.leg, ld.computed, ld.teamData)
          : undefined;
        const allLegStats = legHitRate ? [legHitRate, ...legStats] : legStats;

        return {
          description: ld.leg.description,
          sport: ld.leg.sport,
          betType: ld.leg.betType || "player_prop",
          teams: ld.leg.teams,
          players: ld.leg.players || [],
          market: ld.leg.market,
          line: ld.leg.line,
          odds: ld.leg.odds,
          summary: legSummary,
          stats: allLegStats,
          charts: legCharts,
          error: !hasAnything,
          unsupported: !ld.teamData && !hasAnything,
          computedData: ld.teamData || undefined,
          gameStatus: legGameStatuses[i] || undefined,
          swishScore: legSwishScore,
          suggestions: legSuggestions,
        };
      });

      // Parlay Swish Score = product of leg probabilities (assumes
      // independence, which is approximately right except for SGPs;
      // close enough as a directional read). Each leg's swishScore
      // score IS that leg's probability * 10, so we recover it.
      const legProbs = finalLegs
        .map((l) => l.swishScore?.score != null ? l.swishScore.score / 10 : undefined)
        .filter((p): p is number => p != null);
      let parlaySwishScore: { score: number; label: string; detail: string } | undefined;
      if (legProbs.length > 0) {
        const combined = legProbs.reduce((acc, p) => acc * p, 1);
        const pct = Math.round(combined * 100);
        const score = Math.round(combined * 100) / 10;
        const label =
          combined >= 0.50 ? "Strong" :
          combined >= 0.30 ? "Solid" :
          combined >= 0.18 ? "Toss-Up" :
          combined >= 0.10 ? "Shaky" :
          "Long shot";
        parlaySwishScore = {
          score,
          label,
          detail: `~${pct}% chance to hit all ${legProbs.length} legs`,
        };
      }

      // Log successful parlay to Discord
      logParlayToDiscord(extraction, finalLegs);

      return NextResponse.json({
        parlay: true,
        legCount: legs.length,
        legs: finalLegs,
        swishScore: parlaySwishScore,
      });
    }

    // Single bet analysis
    const result = await analyzeSingleBet(extraction, apiKey);
    return NextResponse.json(result);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    const errStack = error instanceof Error && error.stack ? error.stack.split("\n").slice(0, 6).join("\n") : "";
    console.error("Stats error:", error);
    // Try to log to Discord - extraction may not be available if parsing failed
    try {
      const body = await request.clone().json().catch(() => null);
      if (body?.extraction) {
        logToDiscord("error", body.extraction, `${errMsg}\n${errStack}`);
      }
    } catch { /* silent */ }
    return NextResponse.json(
      // Echo the error message + first stack lines so failures are debuggable
      // from the client (eval scripts, browser console, etc.) instead of an
      // opaque "Failed to generate stats".
      { error: "Failed to generate stats", detail: errMsg, where: errStack.split("\n")[1] || undefined },
      { status: 500 }
    );
  }
}

// ── Prompt for summary + stats only (common bets) ──────────────────

function buildSummaryPrompt(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): string {
  const context = buildDataContext(extraction, computed, rawData);

  // Inject domain-specific market knowledge if available
  const marketContext = extraction.market
    ? getMarketContext(extraction.market, extraction.sport)
    : "";

  return `You're a sports data analyst writing for 22-year-old bettors. Quick, punchy, data-driven. Present what the numbers say - no recommendations.

${context}${marketContext}

Return JSON with ONLY these keys:

1. **summary**: 2-3 punchy sentences. Lead with the KEY number (hit rate, avg, trend direction). Then weave in opponent/matchup context and a situational factor (home/away, rest, streak, pitcher matchup). Example: "Brunson has cleared 26.5 points in 9 of his last 12, averaging 28.4 over that stretch. The Bulls rank 27th in opponent points allowed - and Brunson averages 31.2 on the road this season." Combine multiple data points into one flowing narrative, don't just list stats. No fluff, no "this looks good" - data story with context.

2. **stats**: Array of 3-4 stats (NOT 5). Each has:
   - label: short and punchy (4 words max). Use action words: "Hit Rate L10", "Season Avg", "Opp Allows", "Last 5 Trend"
   - value: the number/string (use % for rates, plain numbers for counts)
   - context: ONE short sentence - must reference either (a) trend direction (rising/falling/stable), (b) opponent context, or (c) home/away split${marketContext ? " - reference the specific factors that matter for this market" : ""}

Return ONLY valid JSON. No markdown.`;
}

// ── Prompt for full AI generation (exotic bets) ────────────────────

function buildFullAIPrompt(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): string {
  const context = buildDataContext(extraction, computed, rawData);

  const marketContext = extraction.market
    ? getMarketContext(extraction.market, extraction.sport)
    : "";

  return `You're a sports data analyst writing for 22-year-old bettors. Quick, objective, data-driven. Present what the numbers say - no recommendations.

${context}${marketContext}

Return JSON with:

1. **summary**: MAX 2 short sentences. Data story only - no "bet this" or "pass". Just facts + context.

2. **stats**: Array of 3-5 stats, each with label, value, context.

3. **charts**: Array of 2-4 chart configs. Each has:
   - type: "line", "bar", "distribution", or "table"
   - title: descriptive title
   - relevance: one sentence on why it matters
   - data: array of objects with consistent keys
   - xKey, yKeys (for line/bar), columns (for table, array of {key, label})
   - ONLY use data from above. Do NOT invent data points.
   - Keys must be camelCase.

Return ONLY valid JSON.`;
}

// ── Shared data context builder ────────────────────────────────────

// ── Parlay batch prompt - one Gemini call for all legs ─────────────

function buildParlayBatchPrompt(
  legData: { leg: BetExtraction; teamData: Record<string, unknown> | null; computed: ReturnType<typeof computeAnalysis> | null; charts: unknown[] }[]
): string {
  let context = `You're a sports data analyst. Give a quick, objective data summary for each parlay leg. No recommendations - just what the numbers say.

`;

  legData.forEach((ld, i) => {
    context += `\n=== LEG ${i + 1}: ${ld.leg.description} ===\n`;
    if (ld.computed && ld.teamData) {
      context += buildDataContext(ld.leg, ld.computed, ld.teamData);
      const mc = ld.leg.market ? getMarketContext(ld.leg.market, ld.leg.sport) : "";
      if (mc) context += mc;
    } else {
      context += "No data available for this leg.\n";
    }
  });

  return `${context}

Return JSON with ONE key "legs" - an array with ${legData.length} objects (one per leg, same order). Each object has:
- summary: 2-3 sentences weaving key numbers with matchup/venue context into one flowing narrative. Don't just list stats - tell the data story. No "bet" or "pass" recommendations.
- stats: array of 2-3 stats, each with label (4 words max), value, context (1 sentence with opponent or venue context)

Example: {"legs":[{"summary":"...","stats":[...]},{"summary":"...","stats":[...]}]}

Return ONLY valid JSON. No markdown.`;
}

/**
 * Generate context-aware suggestion chips based on the actual analysis data.
 * Returns 3-4 short strings that make sense for what the data reveals.
 */
function computeSmartSuggestions(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): string[] {
  const suggestions: string[] = [];
  const sport = (extraction.sport || "").toUpperCase();
  const { teamMetrics, headToHead } = computed;
  const teams = Object.values(teamMetrics);

  if (extraction.betType === "player_prop") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerData = (rawData as any)?._players;
    const playerName = extraction.players?.[0] || "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pData = playerData?.[playerName] as any;
    const pa = pData?.propAnalysis;

    // Home/away split difference
    if (pa?.homeAvg != null && pa?.awayAvg != null) {
      const diff = Math.abs(pa.homeAvg - pa.awayAvg);
      const total = (pa.homeAvg + pa.awayAvg) / 2 || 1;
      if (diff / total > 0.15) {
        suggestions.push("Show home vs away breakdown");
      }
    }

    // Streak detection
    if (pa?.gameValues?.length >= 3) {
      const gv = pa.gameValues;
      let streak = 1;
      const lastHit = gv[gv.length - 1]?.hit;
      for (let i = gv.length - 2; i >= 0; i--) {
        if (gv[i].hit === lastHit) streak++;
        else break;
      }
      if (streak >= 3) {
        suggestions.push("Show last 5 games");
      }
    }

    // Opponent history
    if (extraction.teams.length >= 2) {
      const opponent = extraction.teams[1] || extraction.teams[0];
      suggestions.push(`How does he do vs ${opponent}?`);
    }

    // Sport-specific deep dive
    if (sport === "NBA") {
      suggestions.push("Show assist-to-turnover ratio trend");
    } else if (sport === "MLB" || sport === "BASEBALL") {
      suggestions.push("Compare vs lefty and righty pitchers");
    } else if (sport === "NHL" || sport === "HOCKEY") {
      suggestions.push("Show power play vs even strength");
    } else if (sport === "NFL" || sport === "FOOTBALL") {
      suggestions.push("Show red zone targets");
    }

    // Small sample fallback
    if (pa && pa.totalGames < 15) {
      suggestions.push("Show last season stats");
    }
  } else {
    // Team bets: spread, moneyline, over/under
    const team0 = teams[0];

    // Home/away suggestion based on where tonight's game likely is
    if (team0?.homeRecord && team0?.awayRecord) {
      // If we can detect home/away from recent games or description
      const desc = (extraction.description || "").toLowerCase();
      if (desc.includes("@") || desc.includes("away") || desc.includes("road")) {
        suggestions.push("Show away games only");
      } else {
        suggestions.push("Show home games only");
      }
    } else {
      suggestions.push("Show home vs away splits");
    }

    suggestions.push("Show last 10 games");

    // Head-to-head if both teams available
    if (headToHead && extraction.teams.length >= 2) {
      suggestions.push("Head-to-head history");
    }

    // Regular season vs playoffs
    if (team0?.recentGames?.some((g) => g.seasonType === "playoffs")) {
      suggestions.push("Regular season only");
    }
  }

  // Cap at 4 suggestions
  return suggestions.slice(0, 4);
}

function buildDataContext(
  extraction: BetExtraction,
  computed: ReturnType<typeof computeAnalysis>,
  rawData: Record<string, unknown>
): string {
  const { teamMetrics, headToHead, oddsAnalysis, betTypeInsights } = computed;

  let ctx = `BET: ${extraction.sport} ${extraction.betType} - ${extraction.teams.join(" vs ")}`;
  if (extraction.odds) ctx += ` (${extraction.odds})`;
  if (extraction.line != null) ctx += ` Line: ${extraction.line}`;
  if (extraction.market) ctx += ` Market: ${extraction.market}`;
  if (extraction.players.length > 0) ctx += ` Players: ${extraction.players.join(", ")}`;

  if (oddsAnalysis) {
    ctx += `\n\nODDS: Implied probability ${oddsAnalysis.impliedProbabilityFormatted}`;
  }

  for (const [name, m] of Object.entries(teamMetrics)) {
    if (!m) continue;
    const rec = m.record || { wins: 0, losses: 0, pct: 0 };
    ctx += `\n\n${name}: ${rec.wins}-${rec.losses} (${((rec.pct || 0) * 100).toFixed(0)}%)`;
    if (m.homeRecord) ctx += ` | Home ${m.homeRecord.wins}-${m.homeRecord.losses}`;
    if (m.awayRecord) ctx += ` | Away ${m.awayRecord.wins}-${m.awayRecord.losses}`;
    const streak = m.streak || { type: "?", count: 0 };
    const last5Arr = m.recentForm?.last5 || [];
    ctx += `\n  Streak: ${streak.type}${streak.count} | Last 5: ${last5Arr.join("")}`;
    const sc = m.scoring || { avgPointsFor: 0, avgPointsAgainst: 0, avgTotalPoints: 0, last5AvgFor: 0, last5AvgAgainst: 0, last5AvgTotal: 0 };
    ctx += `\n  Scoring: ${sc.avgPointsFor} for / ${sc.avgPointsAgainst} against (L5: ${sc.last5AvgFor}/${sc.last5AvgAgainst})`;
    ctx += `\n  Avg Total: ${sc.avgTotalPoints} (L5: ${sc.last5AvgTotal})`;
    if (m.restDays !== undefined) ctx += ` | Rest: ${m.restDays}d`;
    if (m.ats) ctx += `\n  ATS: ${m.ats.covers}-${m.ats.fails} (${((m.ats.coverRate || 0) * 100).toFixed(0)}%)`;
    if (m.overUnder) ctx += `\n  O/U: ${m.overUnder.overs}-${m.overUnder.unders} over (${((m.overUnder.overRate || 0) * 100).toFixed(0)}%, avg ${m.overUnder.avgTotal})`;

    const recentGames = m.recentGames || [];
    for (const g of recentGames.slice(-5)) {
      ctx += `\n    ${g.date ? new Date(g.date).toLocaleDateString() : "?"} ${g.won ? "W" : "L"} ${g.teamScore}-${g.opponentScore} vs ${g.opponent} (${g.home ? "H" : "A"}, margin ${g.margin > 0 ? "+" : ""}${g.margin})`;
    }
  }

  if (headToHead) {
    ctx += `\n\nH2H: ${headToHead.team1Wins}-${headToHead.team2Wins}, avg margin ${headToHead.avgMargin > 0 ? "+" : ""}${headToHead.avgMargin}, avg total ${headToHead.avgTotal}`;
  }

  if (betTypeInsights && Object.keys(betTypeInsights).length > 1) {
    ctx += `\n\nINSIGHTS: ${JSON.stringify(betTypeInsights)}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerData = (rawData as any)?._players;
  if (playerData) {
    for (const [pName, pData] of Object.entries(playerData)) {
      if (!pData) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = pData as any;
      if (p.propAnalysis) {
        const pa = p.propAnalysis;
        ctx += `\n\n${pName} PROP: ${pa.stat} over ${pa.line} - hit ${pa.hitCount}/${pa.totalGames} (${Math.round(pa.hitRate * 100)}%), avg ${pa.average}, L5 avg ${pa.last5Avg}, trend ${pa.trend}`;
      }
      if (p.seasonAverages || p.seasonStats) {
        ctx += `\n  Season: ${JSON.stringify(p.seasonAverages || p.seasonStats)}`;
      }
    }
  }

  return ctx;
}
