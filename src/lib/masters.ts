/**
 * Masters hole-by-hole data from ESPN Core API.
 * Free, no auth required. Data available 2019-2025.
 */

import { cachedFetch, TTL } from "./fetch";

const CORE = "https://sports.core.api.espn.com/v2/sports/golf/leagues/pga";

// Known Masters event IDs
const MASTERS_EVENTS: Record<number, string> = {
  2025: "401703504",
  2024: "401580344",
  2023: "401465508",
  2022: "401353232",
  2021: "401243010",
  2020: "401219478",
  2019: "401056527",
};

// Augusta National hole details (par values)
const AUGUSTA_PARS = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]; // holes 1-18
const AUGUSTA_NAMES: Record<number, string> = {
  1: "Tea Olive", 2: "Pink Dogwood", 3: "Flowering Peach", 4: "Flowering Crab Apple",
  5: "Magnolia", 6: "Juniper", 7: "Pampas", 8: "Yellow Jasmine", 9: "Carolina Cherry",
  10: "Camellia", 11: "White Dogwood", 12: "Golden Bell", 13: "Azalea",
  14: "Chinese Fir", 15: "Firethorn", 16: "Redbud", 17: "Nandina", 18: "Holly",
};

// ── Types ──────────────────────────────────────────────────────────

export interface HoleScore {
  hole: number;
  par: number;
  strokes: number;
  toPar: number;
  scoreType: string; // PAR, BIRDIE, EAGLE, BOGEY, DOUBLE_BOGEY
}

export interface RoundData {
  round: number;
  totalStrokes: number;
  toPar: string;
  holes: HoleScore[];
}

export interface MastersPlayerHistory {
  playerName: string;
  playerId: string;
  years: {
    year: number;
    rounds: RoundData[];
    totalScore?: number;
    totalToPar?: string;
    position?: number;
  }[];
}

// ── Fetch player's Masters history ────────────────────────────────

export async function fetchMastersHistory(
  playerName: string,
  yearsToFetch: number[] = [2025, 2024, 2023, 2022]
): Promise<MastersPlayerHistory | null> {
  // First, find the player's ESPN ID from the most recent Masters
  const playerId = await findPlayerInMasters(playerName);
  if (!playerId) {
    console.log(`[Masters] Player not found: "${playerName}"`);
    return null;
  }

  console.log(`[Masters] Found ${playerName} → id=${playerId}`);

  const years: MastersPlayerHistory["years"] = [];

  for (const year of yearsToFetch) {
    const eventId = MASTERS_EVENTS[year];
    if (!eventId) continue;

    try {
      const rounds = await fetchPlayerRounds(eventId, playerId);
      if (rounds.length > 0) {
        const totalStrokes = rounds.reduce((s, r) => s + r.totalStrokes, 0);
        const totalPar = AUGUSTA_PARS.reduce((s, p) => s + p, 0) * rounds.length;
        const diff = totalStrokes - totalPar;
        years.push({
          year,
          rounds,
          totalScore: totalStrokes,
          totalToPar: diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`,
        });
      }
    } catch (e) {
      console.error(`[Masters] Error fetching ${year} for ${playerName}:`, e);
    }
  }

  if (years.length === 0) return null;

  return { playerName, playerId, years };
}

// ── Find player ID from Masters competitor list ───────────────────

async function findPlayerInMasters(playerName: string): Promise<string | null> {
  const nameLower = playerName.toLowerCase();

  // Check most recent Masters first, then work backwards
  for (const year of [2025, 2024, 2023, 2022]) {
    const eventId = MASTERS_EVENTS[year];
    if (!eventId) continue;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await cachedFetch(
        `${CORE}/events/${eventId}/competitions/${eventId}/competitors?limit=100`,
        TTL.LONG
      );
      if (!data?.items) continue;

      for (const item of data.items) {
        const ref = item.$ref || item["$ref"];
        if (!ref) continue;

        // Extract ID from URL
        const match = ref.match(/competitors\/(\d+)/);
        if (!match) continue;
        const id = match[1];

        // Fetch athlete name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const comp: any = await cachedFetch(ref, TTL.LONG);
        if (!comp?.athlete?.$ref && !comp?.athlete?.["$ref"]) continue;

        const athleteRef = comp.athlete.$ref || comp.athlete["$ref"];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const athlete: any = await cachedFetch(athleteRef, TTL.LONG);
        const name = (athlete?.displayName || "").toLowerCase();

        if (name === nameLower || name.includes(nameLower) || nameLower.includes(name)) {
          return id;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ── Fetch hole-by-hole for a player in a specific Masters ─────────

async function fetchPlayerRounds(
  eventId: string,
  playerId: string
): Promise<RoundData[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await cachedFetch(
      `${CORE}/events/${eventId}/competitions/${eventId}/competitors/${playerId}/linescores`,
      TTL.LONG
    );
    if (!data?.items) return [];

    const rounds: RoundData[] = [];
    for (const item of data.items) {
      // Skip playoff rounds (period > 4)
      if (item.period > 4) continue;

      const holes: HoleScore[] = (item.linescores || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (h: any) => ({
          hole: h.period,
          par: h.par,
          strokes: h.value,
          toPar: h.value - h.par,
          scoreType: h.scoreType?.name || "PAR",
        })
      );

      rounds.push({
        round: item.period,
        totalStrokes: item.value,
        toPar: item.displayValue || "E",
        holes,
      });
    }

    return rounds;
  } catch {
    return [];
  }
}

// ── Analysis helpers ──────────────────────────────────────────────

export function analyzeHoleHistory(history: MastersPlayerHistory, hole: number) {
  const scores: { year: number; round: number; strokes: number; toPar: number; scoreType: string }[] = [];
  const par = AUGUSTA_PARS[hole - 1] || 4;

  for (const year of history.years) {
    for (const round of year.rounds) {
      const holeData = round.holes.find((h) => h.hole === hole);
      if (holeData) {
        scores.push({
          year: year.year,
          round: round.round,
          strokes: holeData.strokes,
          toPar: holeData.toPar,
          scoreType: holeData.scoreType,
        });
      }
    }
  }

  const total = scores.length;
  const avgStrokes = total > 0 ? Math.round((scores.reduce((s, v) => s + v.strokes, 0) / total) * 100) / 100 : 0;
  const birdies = scores.filter((s) => s.toPar < 0).length;
  const pars = scores.filter((s) => s.toPar === 0).length;
  const bogeys = scores.filter((s) => s.toPar > 0).length;

  return {
    hole,
    holeName: AUGUSTA_NAMES[hole] || `Hole ${hole}`,
    par,
    totalRounds: total,
    avgStrokes,
    birdieRate: total > 0 ? Math.round((birdies / total) * 100) : 0,
    parRate: total > 0 ? Math.round((pars / total) * 100) : 0,
    bogeyRate: total > 0 ? Math.round((bogeys / total) * 100) : 0,
    scores,
  };
}

export function analyzeAmenCorner(history: MastersPlayerHistory) {
  return [11, 12, 13].map((h) => analyzeHoleHistory(history, h));
}

export function analyzeSundayScoring(history: MastersPlayerHistory) {
  return history.years
    .map((y) => {
      const round4 = y.rounds.find((r) => r.round === 4);
      if (!round4) return null;
      return {
        year: y.year,
        round4Score: round4.totalStrokes,
        round4ToPar: round4.toPar,
        frontNine: round4.holes.filter((h) => h.hole <= 9).reduce((s, h) => s + h.strokes, 0),
        backNine: round4.holes.filter((h) => h.hole > 9).reduce((s, h) => s + h.strokes, 0),
      };
    })
    .filter(Boolean);
}

export function getAugustaPars() {
  return AUGUSTA_PARS.map((par, i) => ({
    hole: i + 1,
    par,
    name: AUGUSTA_NAMES[i + 1] || `Hole ${i + 1}`,
  }));
}
