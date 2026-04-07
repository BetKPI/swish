/**
 * PGA major tournament historical results.
 * Loads static JSON collected by research/collect-pga-history.py.
 * Covers US Open, PGA Championship, The Open (2019-2025).
 *
 * The Masters is handled separately by masters.ts with hole-by-hole data.
 */

import fs from "fs";
import path from "path";

// ── Types ──────────────────────────────────────────────────────────

export interface RoundScore {
  round: number;
  strokes: number;
  toPar: string;
}

export interface PlayerResult {
  playerName: string;
  playerId: string;
  position: number;
  positionDisplay: string;
  scoreToPar: string;
  totalStrokes: number | null;
  rounds: RoundScore[];
}

export interface TournamentYear {
  year: number;
  eventId: string;
  players: PlayerResult[];
}

export interface TournamentData {
  _meta: {
    tournament: string;
    slug: string;
    yearsCollected: string[];
    lastUpdated: string;
    source: string;
  };
  years: Record<string, TournamentYear>;
}

export type TournamentSlug = "us-open" | "pga-championship" | "the-open";

// ── Data loading ─────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "models", "pga-history");

const dataCache = new Map<string, TournamentData | null>();

const SLUG_LOOKUP: Record<string, TournamentSlug> = {
  "us open": "us-open",
  "u.s. open": "us-open",
  "us-open": "us-open",
  "pga championship": "pga-championship",
  "pga-championship": "pga-championship",
  "the open": "the-open",
  "the-open": "the-open",
  "open championship": "the-open",
  "the open championship": "the-open",
  "british open": "the-open",
};

const TOURNAMENT_NAMES: Record<TournamentSlug, string> = {
  "us-open": "U.S. Open",
  "pga-championship": "PGA Championship",
  "the-open": "The Open Championship",
};

function resolveSlug(tournament: string): TournamentSlug | null {
  const key = tournament.toLowerCase().trim();
  return SLUG_LOOKUP[key] ?? null;
}

function loadTournament(slug: TournamentSlug): TournamentData | null {
  if (dataCache.has(slug)) return dataCache.get(slug) ?? null;

  const filePath = path.join(DATA_DIR, `${slug}.json`);
  if (!fs.existsSync(filePath)) {
    console.warn(`[PGA History] Data file not found: ${filePath}`);
    dataCache.set(slug, null);
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data: TournamentData = JSON.parse(raw);
    dataCache.set(slug, data);
    return data;
  } catch (e) {
    console.error(`[PGA History] Error loading ${filePath}:`, e);
    dataCache.set(slug, null);
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Get results for a specific tournament in a specific year.
 * Accepts slug ("us-open") or natural name ("U.S. Open").
 */
export function getTournamentResults(
  tournament: string,
  year: number
): { tournament: string; year: number; players: PlayerResult[] } | null {
  const slug = resolveSlug(tournament);
  if (!slug) return null;

  const data = loadTournament(slug);
  if (!data) return null;

  const yearData = data.years[String(year)];
  if (!yearData) return null;

  return {
    tournament: TOURNAMENT_NAMES[slug],
    year,
    players: yearData.players,
  };
}

/**
 * Get a player's full history across all years for a tournament.
 * Fuzzy matches on player name (case-insensitive, partial match).
 * Accepts slug or natural tournament name.
 */
export function getPlayerTournamentHistory(
  playerName: string,
  tournament?: string
): {
  player: string;
  tournament: string;
  slug: TournamentSlug;
  history: {
    year: number;
    position: number;
    scoreToPar: string;
    totalStrokes: number | null;
    rounds: RoundScore[];
  }[];
  yearsPlayed: number;
  bestFinish: number;
} | null {
  if (!tournament) return null;

  const slug = resolveSlug(tournament);
  if (!slug) return null;

  const data = loadTournament(slug);
  if (!data) return null;

  const nameLower = playerName.toLowerCase();
  const history: {
    year: number;
    position: number;
    scoreToPar: string;
    totalStrokes: number | null;
    rounds: RoundScore[];
  }[] = [];

  for (const [, yearData] of Object.entries(data.years)) {
    const player = yearData.players.find((p) => {
      const pName = p.playerName.toLowerCase();
      return (
        pName === nameLower ||
        pName.includes(nameLower) ||
        nameLower.includes(pName)
      );
    });

    if (player) {
      history.push({
        year: yearData.year,
        position: player.position,
        scoreToPar: player.scoreToPar,
        totalStrokes: player.totalStrokes,
        rounds: player.rounds,
      });
    }
  }

  if (history.length === 0) return null;

  // Sort by year descending (most recent first)
  history.sort((a, b) => b.year - a.year);

  return {
    player: playerName,
    tournament: TOURNAMENT_NAMES[slug],
    slug,
    history,
    yearsPlayed: history.length,
    bestFinish: Math.min(...history.map((h) => h.position)),
  };
}

/**
 * Get a player's history across ALL majors (excluding Masters).
 */
export function getPlayerMajorsHistory(playerName: string) {
  const slugs: TournamentSlug[] = ["us-open", "pga-championship", "the-open"];
  const results: NonNullable<ReturnType<typeof getPlayerTournamentHistory>>[] = [];

  for (const slug of slugs) {
    const h = getPlayerTournamentHistory(playerName, slug);
    if (h) results.push(h);
  }

  if (results.length === 0) return null;

  const allAppearances = results.flatMap((r) => r.history);
  const wins = allAppearances.filter((a) => a.position === 1).length;
  const top5 = allAppearances.filter((a) => a.position <= 5).length;
  const top10 = allAppearances.filter((a) => a.position <= 10).length;
  const totalEvents = allAppearances.length;
  const avgPosition =
    totalEvents > 0
      ? Math.round(
          (allAppearances.reduce((s, a) => s + a.position, 0) / totalEvents) *
            10
        ) / 10
      : 0;

  return {
    player: playerName,
    tournaments: results,
    summary: {
      totalMajorAppearances: totalEvents,
      wins,
      top5,
      top10,
      avgPosition,
    },
  };
}

/**
 * Get the top finishers for a specific tournament/year.
 */
export function getTopFinishers(
  tournament: string,
  year: number,
  limit = 10
): PlayerResult[] {
  const result = getTournamentResults(tournament, year);
  if (!result) return [];
  return result.players.slice(0, limit);
}

/**
 * Analyze a player's scoring trends in a tournament.
 */
export function analyzePlayerTrends(
  playerName: string,
  tournament: string
) {
  const h = getPlayerTournamentHistory(playerName, tournament);
  if (!h || h.history.length === 0) return null;

  // Round-by-round averages
  const roundAvgs: Record<number, { total: number; count: number }> = {};
  for (const app of h.history) {
    for (const round of app.rounds) {
      if (!roundAvgs[round.round])
        roundAvgs[round.round] = { total: 0, count: 0 };
      roundAvgs[round.round].total += round.strokes;
      roundAvgs[round.round].count += 1;
    }
  }

  const avgByRound = Object.entries(roundAvgs).map(
    ([round, { total, count }]) => ({
      round: Number(round),
      avgStrokes: Math.round((total / count) * 100) / 100,
      roundsPlayed: count,
    })
  );

  const positions = h.history.map((a) => a.position);
  const bestFinish = Math.min(...positions);
  const worstFinish = Math.max(...positions);

  // Trend: compare recent avg position vs older
  const recent =
    h.history.length >= 2
      ? (h.history[0].position + h.history[1].position) / 2
      : h.history[0].position;
  const older =
    h.history.length >= 4
      ? (h.history[h.history.length - 1].position +
          h.history[h.history.length - 2].position) /
        2
      : h.history[h.history.length - 1].position;

  const trend =
    recent < older ? "improving" : recent > older ? "declining" : "stable";

  return {
    tournament: h.tournament,
    player: playerName,
    totalAppearances: h.history.length,
    bestFinish,
    worstFinish,
    avgByRound,
    trend,
    history: h.history,
  };
}

/**
 * List all available tournaments and years.
 */
export function getAvailableTournaments(): {
  slug: TournamentSlug;
  name: string;
  years: number[];
}[] {
  const slugs: TournamentSlug[] = ["us-open", "pga-championship", "the-open"];
  return slugs
    .map((slug) => {
      const data = loadTournament(slug);
      return {
        slug,
        name: TOURNAMENT_NAMES[slug],
        years: data
          ? Object.values(data.years)
              .map((y) => y.year)
              .sort((a, b) => b - a)
          : [],
      };
    })
    .filter((t) => t.years.length > 0);
}
