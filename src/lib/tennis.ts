/**
 * Tennis match history from ESPN Core API.
 * Fetches event logs, match results, and H2H records.
 * Supports ATP and WTA, multiple seasons (2024-2026).
 */

import { cachedFetch, TTL } from "./fetch";

const CORE = "https://sports.core.api.espn.com/v2/sports/tennis/leagues";
const SITE = "https://site.api.espn.com/apis";

// ── Types ──────────────────────────────────────────────────────────

export interface TennisMatch {
  date: string;
  tournament: string;
  round: string;
  roundType: number; // 1-7 (1=R1, 5=QF, 6=SF, 7=F)
  opponent: string;
  opponentId: string;
  won: boolean;
  score: string; // "6-1 6-3" or full text
  surface: string;
}

export interface TennisPlayerProfile {
  name: string;
  id: string;
  ranking?: number;
  points?: number;
  matches: TennisMatch[];
  record: { wins: number; losses: number };
  surfaceRecords: Record<string, { wins: number; losses: number }>;
}

export interface TennisH2H {
  player1: string;
  player2: string;
  player1Wins: number;
  player2Wins: number;
  matches: TennisMatch[];
}

// ── Surface mapping (static - ESPN doesn't provide surface) ──────

const TOURNAMENT_SURFACES: Record<string, string> = {
  // Grand Slams
  "australian open": "Hard",
  "roland garros": "Clay", "french open": "Clay",
  "wimbledon": "Grass", "the championships": "Grass",
  "us open": "Hard",
  // Masters 1000 Clay
  "monte-carlo": "Clay", "monte carlo": "Clay", "rolex monte-carlo": "Clay",
  "madrid": "Clay", "mutua madrid": "Clay",
  "rome": "Clay", "italian open": "Clay", "internazionali": "Clay",
  // Masters 1000 Hard
  "indian wells": "Hard", "bnp paribas": "Hard",
  "miami": "Hard", "miami open": "Hard",
  "canadian open": "Hard", "national bank": "Hard", "rogers cup": "Hard", "montreal": "Hard", "toronto": "Hard",
  "cincinnati": "Hard", "western & southern": "Hard",
  "shanghai": "Hard", "rolex shanghai": "Hard",
  "paris": "Hard (Indoor)", "rolex paris": "Hard (Indoor)",
  // ATP Finals
  "atp finals": "Hard (Indoor)", "nitto atp finals": "Hard (Indoor)", "turin": "Hard (Indoor)",
  // Other common
  "brisbane": "Hard", "adelaide": "Hard", "auckland": "Hard",
  "rotterdam": "Hard (Indoor)", "dubai": "Hard", "doha": "Hard", "qatar": "Hard",
  "barcelona": "Clay", "lyon": "Clay", "hamburg": "Clay",
  "halle": "Grass", "queen's": "Grass", "queen": "Grass", "eastbourne": "Grass",
  "washington": "Hard", "atlanta": "Hard",
  "basel": "Hard (Indoor)", "vienna": "Hard (Indoor)", "stockholm": "Hard (Indoor)",
  "beijing": "Hard", "tokyo": "Hard",
};

function getSurface(tournamentName: string): string {
  const lower = tournamentName.toLowerCase();
  for (const [key, surface] of Object.entries(TOURNAMENT_SURFACES)) {
    if (lower.includes(key)) return surface;
  }
  return "Unknown";
}

// ── Round mapping ────────────────────────────────────────────────

const ROUND_NAMES: Record<number, string> = {
  1: "R1", 2: "R2", 3: "R3", 4: "R4", 5: "QF", 6: "SF", 7: "F",
};

// ── Player search ────────────────────────────────────────────────

export async function searchTennisPlayer(
  name: string
): Promise<{ id: string; name: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await cachedFetch(
    `${SITE}/common/v3/search?query=${encodeURIComponent(name)}&type=player&sport=tennis&limit=5`,
    TTL.LONG
  );
  const items = data?.items || [];
  const nameLower = name.toLowerCase();
  for (const item of items) {
    const displayName = (item.displayName || "").toLowerCase();
    if (displayName.includes(nameLower) || nameLower.includes(displayName)) {
      return { id: item.id, name: item.displayName };
    }
  }
  // Fallback: last name match
  const lastName = nameLower.split(/\s+/).pop() || "";
  for (const item of items) {
    if ((item.displayName || "").toLowerCase().includes(lastName)) {
      return { id: item.id, name: item.displayName };
    }
  }
  return items[0] ? { id: items[0].id, name: items[0].displayName } : null;
}

// ── Event log fetcher ────────────────────────────────────────────

async function fetchEventLog(
  league: string,
  playerId: string,
  season: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const allItems: unknown[] = [];
  let page = 1;
  const maxPages = 4; // Cap to avoid too many calls

  while (page <= maxPages) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${CORE}/${league}/seasons/${season}/athletes/${playerId}/eventlog?page=${page}`,
      TTL.MEDIUM
    );
    const events = data?.events;
    if (!events?.items?.length) break;
    allItems.push(...events.items);
    if (page >= (events.pageCount || 1)) break;
    page++;
  }

  return allItems;
}

// ── Match detail fetcher ─────────────────────────────────────────

async function fetchMatchDetail(
  competitionRef: string,
  eventRef: string,
  playerId: string
): Promise<TennisMatch | null> {
  try {
    const [comp, event] = await Promise.all([
      cachedFetch<Record<string, unknown>>(competitionRef, TTL.LONG),
      cachedFetch<Record<string, unknown>>(eventRef, TTL.LONG),
    ]);
    if (!comp || !event) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = comp as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = event as any;

    const competitors = c.competitors || [];
    if (competitors.length < 2) return null;

    // Skip byes
    if (competitors.some((p: { name: string; id: string }) => p.name === "Bye" || p.id === "0")) return null;

    const player = competitors.find((p: { id: string }) => p.id === playerId);
    const opponent = competitors.find((p: { id: string }) => p.id !== playerId);
    if (!player || !opponent) return null;

    // Status might be direct or a $ref
    let statusName = c.status?.type?.name || "";
    if (!statusName && c.status?.$ref) {
      try {
        const statusData = await cachedFetch<Record<string, unknown>>(c.status.$ref, TTL.LONG);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        statusName = (statusData as any)?.type?.name || "";
      } catch { /* skip */ }
    }
    if (!statusName.includes("FINAL") && !statusName.includes("RETIRED") && !statusName.includes("WALKOVER")) {
      return null; // Not completed
    }

    const roundType = c.round?.roundType || 0;
    const scoreText = c.notes?.[0]?.text || "";
    // Parse score from notes text: "(1) Alcaraz bt Baez 6-1 6-3" → "6-1 6-3"
    const scoreMatch = scoreText.match(/\d+-\d+(?:\(\d+\))?\s*/g);
    const score = scoreMatch ? scoreMatch.join(" ").trim() : scoreText;

    return {
      date: (c.date || e.date || "").slice(0, 10),
      tournament: e.name || e.shortName || "Unknown",
      round: ROUND_NAMES[roundType] || `R${roundType}`,
      roundType,
      opponent: opponent.name || "Unknown",
      opponentId: opponent.id || "",
      won: player.winner === true,
      score,
      surface: getSurface(e.name || ""),
    };
  } catch {
    return null;
  }
}

// ── Main: get player match history ───────────────────────────────

export async function getPlayerMatchHistory(
  playerName: string,
  league: "atp" | "wta" = "atp",
  seasons: number[] = [2026, 2025]
): Promise<TennisPlayerProfile | null> {
  const player = await searchTennisPlayer(playerName);
  if (!player) return null;

  const allMatches: TennisMatch[] = [];

  for (const season of seasons) {
    const eventLog = await fetchEventLog(league, player.id, season);

    // Fetch match details - limit concurrent requests to stay within time budget
    const batchSize = 5;
    const maxMatches = 40; // Cap total matches per player
    for (let i = 0; i < eventLog.length && allMatches.length < maxMatches; i += batchSize) {
      const batch = eventLog.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((item: { competition?: { $ref: string }; event?: { $ref: string }; played?: boolean }) => {
          if (!item.played || !item.competition?.$ref || !item.event?.$ref) return null;
          return fetchMatchDetail(item.competition.$ref, item.event.$ref, player.id);
        })
      );
      for (const match of results) {
        if (match) allMatches.push(match);
      }
    }
  }

  // Sort by date descending (most recent first)
  allMatches.sort((a, b) => b.date.localeCompare(a.date));

  // Compute records
  const wins = allMatches.filter(m => m.won).length;
  const losses = allMatches.filter(m => !m.won).length;

  // Surface breakdown
  const surfaceRecords: Record<string, { wins: number; losses: number }> = {};
  for (const m of allMatches) {
    const s = m.surface.split(" ")[0]; // "Hard (Indoor)" → "Hard"
    if (!surfaceRecords[s]) surfaceRecords[s] = { wins: 0, losses: 0 };
    if (m.won) surfaceRecords[s].wins++;
    else surfaceRecords[s].losses++;
  }

  return {
    name: player.name,
    id: player.id,
    matches: allMatches,
    record: { wins, losses },
    surfaceRecords,
  };
}

// ── H2H between two players ─────────────────────────────────────

export async function getH2H(
  player1Name: string,
  player2Name: string,
  league: "atp" | "wta" = "atp",
  seasons: number[] = [2026, 2025, 2024]
): Promise<TennisH2H | null> {
  const [p1, p2] = await Promise.all([
    searchTennisPlayer(player1Name),
    searchTennisPlayer(player2Name),
  ]);
  if (!p1 || !p2) return null;

  // Fetch event logs for both players across all seasons
  const [p1Events, p2Events] = await Promise.all([
    Promise.all(seasons.map(s => fetchEventLog(league, p1.id, s))).then(arrs => arrs.flat()),
    Promise.all(seasons.map(s => fetchEventLog(league, p2.id, s))).then(arrs => arrs.flat()),
  ]);

  // Find matching competition refs (same match)
  const p1CompRefs = new Map<string, { competition: { $ref: string }; event: { $ref: string } }>();
  for (const item of p1Events) {
    if (item.competition?.$ref) {
      p1CompRefs.set(item.competition.$ref, { competition: item.competition, event: item.event });
    }
  }

  const sharedComps: { compRef: string; eventRef: string }[] = [];
  for (const item of p2Events) {
    if (item.competition?.$ref && p1CompRefs.has(item.competition.$ref)) {
      const p1Item = p1CompRefs.get(item.competition.$ref)!;
      sharedComps.push({ compRef: item.competition.$ref, eventRef: p1Item.event.$ref });
    }
  }

  // Fetch match details for H2H matches
  const matches: TennisMatch[] = [];
  for (const { compRef, eventRef } of sharedComps) {
    const match = await fetchMatchDetail(compRef, eventRef, p1.id);
    if (match) matches.push(match);
  }

  matches.sort((a, b) => b.date.localeCompare(a.date));

  return {
    player1: p1.name,
    player2: p2.name,
    player1Wins: matches.filter(m => m.won).length,
    player2Wins: matches.filter(m => !m.won).length,
    matches,
  };
}
