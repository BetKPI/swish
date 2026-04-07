/**
 * PGA Tournament History — loads historical results from static JSON files.
 * Data covers major tournaments: US Open, PGA Championship, The Open Championship.
 * Masters data is handled separately by masters.ts (hole-by-hole detail).
 */

import fs from "fs";
import path from "path";

interface TournamentResult {
  year: number;
  position: number | string;
  score: string;
  toPar: string;
  rounds: number[];
}

interface TournamentHistory {
  tournament: string;
  years: Record<string, TournamentResult[]>;
}

const TOURNAMENT_FILES: Record<string, string> = {
  "us open": "us-open.json",
  "u.s. open": "us-open.json",
  "pga championship": "pga-championship.json",
  "the open": "the-open.json",
  "open championship": "the-open.json",
  "british open": "the-open.json",
};

const cache: Record<string, TournamentHistory | null> = {};

function loadTournament(tournament: string): TournamentHistory | null {
  const key = tournament.toLowerCase();
  if (key in cache) return cache[key];

  const fileName = TOURNAMENT_FILES[key];
  if (!fileName) {
    cache[key] = null;
    return null;
  }

  try {
    const filePath = path.join(process.cwd(), "models", "pga-history", fileName);
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as TournamentHistory;
    cache[key] = data;
    return data;
  } catch {
    cache[key] = null;
    return null;
  }
}

export function getPlayerTournamentHistory(
  playerName: string,
  tournament?: string
): Record<string, unknown> | null {
  if (!tournament) return null;

  const data = loadTournament(tournament);
  if (!data) return null;

  const nameLower = playerName.toLowerCase();
  const results: TournamentResult[] = [];

  for (const [year, entries] of Object.entries(data.years)) {
    const match = entries.find(
      (e) => e.score !== undefined &&
        (typeof e === "object" && "name" in e
          ? (e as unknown as { name: string }).name.toLowerCase().includes(nameLower)
          : false)
    );
    if (match) {
      results.push({ ...match, year: parseInt(year, 10) });
    }
  }

  if (results.length === 0) return null;

  return {
    player: playerName,
    tournament: data.tournament,
    history: results,
    yearsPlayed: results.length,
    bestFinish: Math.min(...results.map((r) => typeof r.position === "number" ? r.position : 999)),
  };
}

export function getTournamentResults(
  tournament: string,
  year: number
): Record<string, unknown> | null {
  const data = loadTournament(tournament);
  if (!data) return null;

  const yearData = data.years[String(year)];
  if (!yearData) return null;

  return {
    tournament: data.tournament,
    year,
    results: yearData,
  };
}
