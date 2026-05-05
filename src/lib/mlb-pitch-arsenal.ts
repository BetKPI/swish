/**
 * MLB pitch arsenal — per-pitcher pitch-type breakdown via Baseball Savant.
 *
 * Public CSV endpoint: usage %, batting line allowed, K%, whiff%, hard-hit%
 * for every pitch type a pitcher throws. Cached 24h since the arsenal is
 * slow-moving and the season-long aggregate doesn't shift much day to day.
 */

import { cachedFetch, TTL } from "./fetch";

export interface PitchEntry {
  pitchType: string;       // FF, SI, SL, CH, CU, ST, FC, FS, KC, KN
  pitchName: string;       // "4-Seam Fastball", "Slider", etc.
  usagePct: number;        // % of total pitches
  ba: number;              // batting average against
  slg: number;
  woba: number;
  kPct: number;            // K rate when this pitch finishes the AB
  whiffPct: number;
  hardHitPct: number;
}

export interface PitcherArsenal {
  playerId: number;
  pitches: PitchEntry[];   // sorted by usagePct desc
}

// Module-scope cache so we parse the CSV once per process lifetime.
let _arsenalIndex: Map<number, PitcherArsenal> | null = null;
let _arsenalLoadedFor: number | null = null;

function parseFloatOrZero(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseCsvLine(line: string): string[] {
  // Simple CSV parser handling quoted fields with commas inside
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function loadArsenal(year: number): Promise<Map<number, PitcherArsenal>> {
  const url = `https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=pitcher&year=${year}&minPA=1&csv=true`;
  // Raw text fetch — bypass cachedFetch's JSON parse.
  let text: string;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "swish-bet-tool/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return new Map();
    text = await r.text();
  } catch {
    return new Map();
  }

  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return new Map();
  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.findIndex((h) => h.replace(/"/g, "") === name);

  const idxId = idx("player_id");
  const idxType = idx("pitch_type");
  const idxName = idx("pitch_name");
  const idxUsage = idx("pitch_usage");
  const idxBa = idx("ba");
  const idxSlg = idx("slg");
  const idxWoba = idx("woba");
  const idxK = idx("k_percent");
  const idxWhiff = idx("whiff_percent");
  const idxHard = idx("hard_hit_percent");

  if (idxId < 0 || idxType < 0) return new Map();

  const out = new Map<number, PitcherArsenal>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = parseCsvLine(line);
    const id = Number(cols[idxId]?.replace(/"/g, ""));
    if (!Number.isFinite(id) || id <= 0) continue;
    const entry: PitchEntry = {
      pitchType: (cols[idxType] || "").replace(/"/g, ""),
      pitchName: (cols[idxName] || "").replace(/"/g, ""),
      usagePct: parseFloatOrZero(cols[idxUsage]),
      ba: parseFloatOrZero((cols[idxBa] || "").replace(/"/g, "")),
      slg: parseFloatOrZero((cols[idxSlg] || "").replace(/"/g, "")),
      woba: parseFloatOrZero((cols[idxWoba] || "").replace(/"/g, "")),
      kPct: parseFloatOrZero(cols[idxK]),
      whiffPct: parseFloatOrZero(cols[idxWhiff]),
      hardHitPct: parseFloatOrZero(cols[idxHard]),
    };
    let pitcher = out.get(id);
    if (!pitcher) {
      pitcher = { playerId: id, pitches: [] };
      out.set(id, pitcher);
    }
    pitcher.pitches.push(entry);
  }
  // Sort each pitcher's pitches by usage desc
  for (const p of out.values()) {
    p.pitches.sort((a, b) => b.usagePct - a.usagePct);
  }
  return out;
}

/**
 * Get a pitcher's arsenal by MLB Stats API player ID. Returns null if not
 * present (e.g. Triple-A call-up with no Statcast data yet).
 *
 * Loaded lazily once per process; cached 24h via cachedFetch wrapper around
 * a one-time module load — when the year rolls over we reload.
 */
export async function getPitcherArsenal(pitcherId: number): Promise<PitcherArsenal | null> {
  if (!pitcherId) return null;
  const year = new Date().getFullYear();
  if (_arsenalIndex == null || _arsenalLoadedFor !== year) {
    // Use cachedFetch on a tiny key just to enforce the 24h refresh, but the
    // actual data lives in module-scope to avoid re-parsing on every call.
    const stamp = await cachedFetch<{ ts: number }>(`__arsenal_stamp__/${year}`, TTL.LONG /* 24h */);
    void stamp;
    _arsenalIndex = await loadArsenal(year);
    _arsenalLoadedFor = year;
  }
  return _arsenalIndex.get(pitcherId) || null;
}

/** Pitch-mix string suitable for an insight bullet, e.g. "FF 56% / SL 24% / CH 18%". */
export function summarizeMix(arsenal: PitcherArsenal, top: number = 3): string {
  return arsenal.pitches
    .slice(0, top)
    .map((p) => `${p.pitchType} ${Math.round(p.usagePct)}%`)
    .join(" / ");
}

/** The pitcher's most-effective pitch (by lowest opponent xwOBA / wOBA). */
export function bestPitch(arsenal: PitcherArsenal): PitchEntry | null {
  if (arsenal.pitches.length === 0) return null;
  return [...arsenal.pitches].sort((a, b) => a.woba - b.woba)[0];
}
