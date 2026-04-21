/**
 * MLB History Charts — deterministic chart builders consuming mlb-history primitives.
 * Two-season overlays render as two colored series via separate yKeys.
 */

import type { ChartConfig } from "@/types";
import type {
  MLBTeamTwoSeason,
  MLBTeamGame,
  MLBPitcherTwoSeason,
  MLBPitcherGame,
  MLBBatterTwoSeason,
  MLBBatterGame,
  MLBBatterVsPitcher,
  MLBStandingsSnapshot,
} from "./mlb-history";
import { getChampionshipHistory, formatChampionshipSummary } from "./championship-history";

// ── Local helpers ──────────────────────────────────────────────────

function shortName(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (last && last.length >= 3) return last;
  return name.slice(0, 10);
}

function fmtGame(date: string, oppName: string, isHome: boolean): string {
  const yy = date.slice(2, 4);
  const mmdd = date.length >= 10 ? `${date.slice(5, 7)}/${date.slice(8, 10)}` : date;
  const opp = shortName(oppName);
  const vs = isHome ? "vs" : "@";
  return `${yy} ${mmdd} ${vs}${opp}`;
}

function fmtPitcherGame(date: string, oppName: string): string {
  const yy = date.slice(2, 4);
  const mmdd = date.length >= 10 ? `${date.slice(5, 7)}/${date.slice(8, 10)}` : date;
  return `${yy} ${mmdd} ${shortName(oppName)}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return Math.round((n / d) * 100);
}

/**
 * Centered-ish rolling mean. Uses a trailing window so each point reflects
 * "last N games up to here" — the shape people expect from a smoothed
 * performance line. Window shrinks at the start so early points aren't empty.
 */
function rollingMean(values: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    out.push(round1(sum / slice.length));
  }
  return out;
}

// ── Team history ───────────────────────────────────────────────────

export function buildMLBTeamHistoryChart(
  team: MLBTeamTwoSeason,
  marketType: "spread" | "moneyline" | "total",
  line: number | undefined,
): ChartConfig | null {
  const games = team.currentSeason;
  if (games.length < 5) return null;

  const recent = games.slice(-20);

  if (marketType === "total" && line != null) {
    // Green/red bars: green = over, red = under
    const rows = recent.map((g) => ({
      game: fmtGame(g.date, g.opponent, g.isHome),
      value: g.totalRuns,
      line,
      overLine: g.totalRuns > line, home: g.isHome,
    }));
    const allOvers = games.filter((g) => g.totalRuns > line).length;
    const last10 = games.slice(-10);
    const l10Overs = last10.filter((g) => g.totalRuns > line).length;
    return {
      type: "hitrate" as ChartConfig["type"],
      title: `${team.teamName} — Game Totals vs ${line} Line`,
      relevance: `Over ${line} in ${allOvers}/${games.length} this season (${pct(allOvers, games.length)}%). Last 10: ${l10Overs}/${last10.length}`,
      data: rows,
      xKey: "game",
      yKeys: ["value"],
    };
  }

  if (marketType === "moneyline") {
    // Green/red bars: green = win, red = loss
    const rows = recent.map((g) => ({
      game: fmtGame(g.date, g.opponent, g.isHome),
      value: g.margin,
      line: 0,
      overLine: g.won, home: g.isHome,
    }));
    const wins = games.filter((g) => g.won).length;
    const last10 = games.slice(-10);
    const l10Wins = last10.filter((g) => g.won).length;
    return {
      type: "hitrate" as ChartConfig["type"],
      title: `${team.teamName} — Win/Loss Margin`,
      relevance: `${wins}-${games.length - wins} this season (${pct(wins, games.length)}%). Last 10: ${l10Wins}-${last10.length - l10Wins}`,
      data: rows,
      xKey: "game",
      yKeys: ["value"],
    };
  }

  // Spread: green = covered, red = didn't
  if (line != null) {
    const rows = recent.map((g) => ({
      game: fmtGame(g.date, g.opponent, g.isHome),
      value: g.margin,
      line: -line,
      overLine: g.margin + line > 0, home: g.isHome,
    }));
    const covers = games.filter((g) => g.margin + line > 0).length;
    const last10 = games.slice(-10);
    const l10Covers = last10.filter((g) => g.margin + line > 0).length;
    return {
      type: "hitrate" as ChartConfig["type"],
      title: `${team.teamName} — Margin vs ${line > 0 ? "+" : ""}${line} Spread`,
      relevance: `Covered in ${covers}/${games.length} this season (${pct(covers, games.length)}%). Last 10: ${l10Covers}/${last10.length}`,
      data: rows,
      xKey: "game",
      yKeys: ["value"],
    };
  }

  // No line — show margin bars with win/loss coloring
  const rows = recent.map((g) => ({
    game: fmtGame(g.date, g.opponent, g.isHome),
    value: g.margin,
    line: 0,
    overLine: g.won, home: g.isHome,
  }));
  return {
    type: "hitrate" as ChartConfig["type"],
    title: `${team.teamName} — Game Margins`,
    relevance: `Run margin per game — green = win, red = loss`,
    data: rows,
    xKey: "game",
    yKeys: ["value"],
  };
}

// ── Pitcher history ────────────────────────────────────────────────

export function buildMLBPitcherHistoryChart(
  pitcher: MLBPitcherTwoSeason,
  focus: "era" | "strikeouts" | "innings",
): ChartConfig | null {
  const total = pitcher.lastSeason.length + pitcher.currentSeason.length;
  if (total < 6) return null;

  const rows: Record<string, unknown>[] = [];
  const pick = (g: MLBPitcherGame): number => {
    if (focus === "era") return round1(g.era);
    if (focus === "strikeouts") return g.k;
    return round1(g.ip);
  };

  const addRow = (g: MLBPitcherGame, isCurrent: boolean) => {
    const label = fmtPitcherGame(g.date, g.opponent);
    const v = pick(g);
    const row: Record<string, unknown> = { game: label };
    if (focus === "era") {
      row.lastSeasonEra = isCurrent ? null : v;
      row.currentSeasonEra = isCurrent ? v : null;
    } else if (focus === "strikeouts") {
      row.lastSeasonK = isCurrent ? null : v;
      row.currentSeasonK = isCurrent ? v : null;
    } else {
      row.lastSeasonIP = isCurrent ? null : v;
      row.currentSeasonIP = isCurrent ? v : null;
    }
    rows.push(row);
  };

  for (const g of pitcher.lastSeason) addRow(g, false);
  for (const g of pitcher.currentSeason) addRow(g, true);

  const lastAvg = pitcher.lastSeason.length
    ? pitcher.lastSeason.reduce((s, g) => s + pick(g), 0) / pitcher.lastSeason.length
    : 0;
  const curAvg = pitcher.currentSeason.length
    ? pitcher.currentSeason.reduce((s, g) => s + pick(g), 0) / pitcher.currentSeason.length
    : 0;

  const label = focus === "era" ? "ERA" : focus === "strikeouts" ? "Strikeouts" : "Innings";
  const yKeys =
    focus === "era"
      ? ["lastSeasonEra", "currentSeasonEra"]
      : focus === "strikeouts"
        ? ["lastSeasonK", "currentSeasonK"]
        : ["lastSeasonIP", "currentSeasonIP"];

  return {
    type: "line",
    title: `${pitcher.pitcherName} — ${label} per Start`,
    relevance: `${pitcher.lastSeasonYear} avg ${round1(lastAvg)}, ${pitcher.currentSeasonYear} avg ${round1(curAvg)}`,
    data: rows,
    xKey: "game",
    yKeys,
  };
}

// ── Pitcher season summary (W-L, ERA, K/9) ────────────────────────

export function buildMLBPitcherSeasonRecord(
  home: MLBPitcherTwoSeason | undefined,
  away: MLBPitcherTwoSeason | undefined,
): ChartConfig | null {
  const pitchers = [home, away].filter((p): p is MLBPitcherTwoSeason => !!p);
  if (pitchers.length === 0) return null;

  type Row = { pitcher: string; season: string; gs: number; record: string; era: string; kPer9: string };
  const rows: Row[] = [];
  for (const p of pitchers) {
    const seasons: Array<{ label: string; games: MLBPitcherGame[] }> = [
      { label: `${p.lastSeasonYear}`, games: p.lastSeason },
      { label: `${p.currentSeasonYear}`, games: p.currentSeason },
    ];
    for (const s of seasons) {
      if (s.games.length === 0) continue;
      const w = s.games.filter((g) => g.win).length;
      const l = s.games.filter((g) => g.loss).length;
      let ip = 0;
      let er = 0;
      let k = 0;
      for (const g of s.games) {
        ip += g.ip;
        er += g.er;
        k += g.k;
      }
      const era = ip > 0 ? ((er / ip) * 9).toFixed(2) : "—";
      const kPer9 = ip > 0 ? ((k / ip) * 9).toFixed(1) : "—";
      rows.push({
        pitcher: p.pitcherName,
        season: s.label,
        gs: s.games.length,
        record: `${w}-${l}`,
        era,
        kPer9,
      });
    }
  }
  if (rows.length === 0) return null;

  const heading =
    pitchers.length === 2
      ? `${pitchers[0].pitcherName} vs ${pitchers[1].pitcherName} — Season W-L, ERA, K/9`
      : `${pitchers[0].pitcherName} — Season W-L, ERA, K/9`;

  return {
    type: "table",
    title: heading,
    relevance:
      pitchers.length === 2
        ? "Both probable pitchers' season records side by side — wins/losses, ERA, and strikeouts per nine."
        : "Probable pitcher's season record, ERA, and strikeouts per nine.",
    data: rows,
    columns: [
      { key: "pitcher", label: "Pitcher" },
      { key: "season", label: "Season" },
      { key: "gs", label: "GS" },
      { key: "record", label: "W-L" },
      { key: "era", label: "ERA" },
      { key: "kPer9", label: "K/9" },
    ],
  };
}

// ── Pitcher matchup — recent starts side by side ──────────────────

export function buildMLBPitcherComparisonTable(
  home: MLBPitcherTwoSeason | undefined,
  away: MLBPitcherTwoSeason | undefined,
  perPitcher: number = 6,
): ChartConfig | null {
  const pitchers = [home, away].filter((p): p is MLBPitcherTwoSeason => !!p);
  if (pitchers.length === 0) return null;

  const data: Record<string, unknown>[] = [];
  for (const p of pitchers) {
    // Most recent `perPitcher` starts across both seasons.
    const all = [...p.lastSeason, ...p.currentSeason]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, perPitcher)
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const g of all) {
      const result = g.win ? "W" : g.loss ? "L" : "ND";
      data.push({
        pitcher: p.pitcherName,
        date: g.date.slice(5, 10),
        opp: shortName(g.opponent),
        ip: round1(g.ip),
        h: g.h,
        er: g.er,
        k: g.k,
        bb: g.bb,
        result,
      });
    }
  }
  if (data.length === 0) return null;

  return {
    type: "table",
    title:
      pitchers.length === 2
        ? `${pitchers[0].pitcherName} vs ${pitchers[1].pitcherName} — Recent Starts`
        : `${pitchers[0].pitcherName} — Recent Starts`,
    relevance:
      pitchers.length === 2
        ? `Side-by-side last ${perPitcher} starts for both probable pitchers. Decision column: W, L, or ND (no decision).`
        : `Last ${perPitcher} starts. Decision column: W, L, or ND (no decision).`,
    data,
    columns: [
      { key: "pitcher", label: "Pitcher" },
      { key: "date", label: "Date" },
      { key: "opp", label: "Opp" },
      { key: "ip", label: "IP" },
      { key: "h", label: "H" },
      { key: "er", label: "ER" },
      { key: "k", label: "K" },
      { key: "bb", label: "BB" },
      { key: "result", label: "Dec" },
    ],
  };
}

// ── Team season record summary ───────────────────────────────────

export function buildMLBTeamRecordTable(team: MLBTeamTwoSeason): ChartConfig | null {
  const last = team.lastSeason;
  const current = team.currentSeason;
  if (last.length + current.length === 0) return null;

  function summarize(games: MLBTeamGame[], label: string) {
    const w = games.filter((g) => g.won).length;
    const l = games.length - w;
    const winPct = games.length > 0 ? ((w / games.length) * 100).toFixed(1) : "—";
    const runDiff =
      games.length > 0
        ? round1(
            games.reduce((s, g) => s + g.margin, 0) / games.length,
          )
        : 0;
    return { period: label, record: `${w}-${l}`, winPct: `${winPct}%`, runDiff };
  }

  const rows: Record<string, unknown>[] = [];
  if (last.length > 0) rows.push(summarize(last, `${team.lastSeasonYear}`));
  if (current.length > 0) {
    rows.push(summarize(current, `${team.currentSeasonYear} YTD`));
    rows.push(summarize(current.slice(-10), "Last 10"));
  }

  return {
    type: "table",
    title: `${team.teamName} — Record & Win %`,
    relevance: "Season and recent win percentage alongside the run-differential chart.",
    data: rows,
    columns: [
      { key: "period", label: "Period" },
      { key: "record", label: "Record" },
      { key: "winPct", label: "Win %" },
      { key: "runDiff", label: "Run Diff/G" },
    ],
  };
}

// ── Pitcher vs opponent ────────────────────────────────────────────

export function buildMLBPitcherVsOpponentTable(
  pitcher: MLBPitcherTwoSeason,
  opponentId: number,
  opponentName: string,
  extendedCareer?: MLBPitcherGame[],
): ChartConfig | null {
  const source = extendedCareer && extendedCareer.length > 0
    ? extendedCareer
    : [...pitcher.lastSeason, ...pitcher.currentSeason];
  const all = source.filter((g) => g.opponentId === opponentId);
  if (all.length === 0) return null;
  all.sort((a, b) => a.date.localeCompare(b.date));

  let totER = 0;
  let totIP = 0;
  let totK = 0;
  const data = all.map((g) => {
    totER += g.er;
    totIP += g.ip;
    totK += g.k;
    return {
      date: g.date,
      ip: round1(g.ip),
      h: g.h,
      er: g.er,
      k: g.k,
      bb: g.bb,
      era: round1(g.era),
    };
  });

  const totalEra = totIP > 0 ? round1((totER / totIP) * 9) : 0;

  return {
    type: "table",
    title: `${pitcher.pitcherName} vs ${opponentName} — Recent Starts`,
    relevance: `${all.length} starts: ${totER} ER in ${round1(totIP)} IP, ${totK} K (${totalEra} ERA)`,
    data,
    columns: [
      { key: "date", label: "Date" },
      { key: "ip", label: "IP" },
      { key: "h", label: "H" },
      { key: "er", label: "ER" },
      { key: "k", label: "K" },
      { key: "bb", label: "BB" },
      { key: "era", label: "ERA" },
    ],
  };
}

// ── Batter history ─────────────────────────────────────────────────

export function buildMLBBatterHistoryChart(
  batter: MLBBatterTwoSeason,
  stat: "hits" | "homeRuns" | "rbi" | "totalBases" | "runs" | "strikeOuts" | "stolenBases",
  line: number,
): ChartConfig | null {
  const total = batter.lastSeason.length + batter.currentSeason.length;
  if (total < 20) return null;

  const pick = (g: MLBBatterGame): number => {
    switch (stat) {
      case "hits":
        return g.hits;
      case "homeRuns":
        return g.hr;
      case "rbi":
        return g.rbi;
      case "totalBases":
        return g.totalBases;
      case "runs":
        return g.runs;
      case "strikeOuts":
        return g.so;
      case "stolenBases":
        return g.stolenBases;
    }
  };

  // Green/red hit rate bar chart — props.cash style
  const allGames = [...batter.currentSeason];
  const recentGames = allGames.slice(-20); // Show last 20 games for readability
  const rows: Record<string, unknown>[] = recentGames.map((g) => {
    const v = pick(g);
    return {
      game: fmtPitcherGame(g.date, g.opponent),
      value: v,
      line,
      overLine: v >= line,
    };
  });

  const hits = allGames.filter((g) => pick(g) >= line).length;
  const curTotal = allGames.length;
  const last10 = allGames.slice(-10);
  const last10Hits = last10.filter((g) => pick(g) >= line).length;

  const label =
    stat === "homeRuns"
      ? "HR"
      : stat === "totalBases"
        ? "Total Bases"
        : stat === "strikeOuts"
          ? "Strikeouts"
          : stat === "stolenBases"
            ? "Stolen Bases"
            : stat === "rbi"
              ? "RBI"
              : stat.charAt(0).toUpperCase() + stat.slice(1);

  return {
    type: "hitrate" as ChartConfig["type"],
    title: `${batter.batterName} — ${label} vs ${line} Line`,
    relevance: `Over ${line} in ${hits}/${curTotal} this season (${pct(hits, curTotal)}%). Last 10: ${last10Hits}/${last10.length} (${pct(last10Hits, last10.length)}%)`,
    data: rows,
    xKey: "game",
    yKeys: ["value"],
  };
}

// ── Batter vs pitcher table ────────────────────────────────────────

export function buildMLBBatterVsPitcherTable(
  bvp: MLBBatterVsPitcher,
): ChartConfig | null {
  if (!bvp) return null;
  const small = bvp.pa < 5;
  return {
    type: "table",
    title: `${bvp.batterName} vs ${bvp.pitcherName} — Career`,
    relevance: small
      ? `Small sample — ${bvp.pa} PA`
      : `${bvp.pa} PA, ${bvp.hits}-${bvp.ab}, ${bvp.hr} HR, ${bvp.so} K`,
    data: [
      {
        pa: bvp.pa,
        ab: bvp.ab,
        h: bvp.hits,
        hr: bvp.hr,
        rbi: bvp.rbi,
        bb: bvp.bb,
        k: bvp.so,
        avg: bvp.avg,
      },
    ],
    columns: [
      { key: "pa", label: "PA" },
      { key: "ab", label: "AB" },
      { key: "h", label: "H" },
      { key: "hr", label: "HR" },
      { key: "rbi", label: "RBI" },
      { key: "bb", label: "BB" },
      { key: "k", label: "K" },
      { key: "avg", label: "AVG" },
    ],
  };
}

// ── Futures ────────────────────────────────────────────────────────

export function buildMLBFuturesChart(
  teamName: string,
  snapshots: MLBStandingsSnapshot[],
  market: "division" | "league" | "world_series",
): ChartConfig | null {
  if (!snapshots || snapshots.length === 0) return null;
  const sorted = [...snapshots].sort((a, b) => a.season - b.season);
  const data: Record<string, unknown>[] = [];
  const tn = teamName.toLowerCase();
  for (const snap of sorted) {
    const row = snap.rows.find(
      (r) => r.teamName.toLowerCase() === tn || r.teamName.toLowerCase().includes(tn),
    );
    if (!row) continue;
    const rank = market === "division" ? row.divisionRank : row.leagueRank;
    data.push({ season: String(snap.season), rank });
  }
  if (data.length === 0) return null;

  const latest = data[data.length - 1] as { season: string; rank: number };
  const marketLabel =
    market === "division"
      ? "Division"
      : market === "league"
        ? "League"
        : "World Series";

  return {
    type: "bar",
    title: `${teamName} — ${marketLabel} Rank by Season`,
    relevance:
      market === "world_series"
        ? `Currently ${latest.rank} in the league (${latest.season}). League rank is a rough proxy for WS odds.`
        : `Currently ${latest.rank} in the ${marketLabel.toLowerCase()} (${latest.season})`,
    data,
    xKey: "season",
    yKeys: ["rank"],
  };
}

// ── Statcast lasers ────────────────────────────────────────────────

export function buildMLBLasersChart(
  exitVelo:
    | { available: false }
    | {
        available: true;
        avgExitVelo: number;
        maxExitVelo: number;
        hardHitPct: number;
        barrelPct: number;
      },
): ChartConfig | null {
  if (!exitVelo.available) {
    return {
      type: "table",
      title: "Hard-Hit & Exit Velocity",
      relevance: "Statcast exit velocity data not yet wired — coming soon",
      data: [{ note: "Statcast data unavailable in this build" }],
      columns: [{ key: "note", label: "Status" }],
    };
  }
  return {
    type: "table",
    title: "Hard-Hit & Exit Velocity",
    relevance: `Avg EV ${round1(exitVelo.avgExitVelo)} mph, Barrel ${round1(exitVelo.barrelPct)}%`,
    data: [
      {
        avgEV: round1(exitVelo.avgExitVelo),
        maxEV: round1(exitVelo.maxExitVelo),
        hardHit: `${round1(exitVelo.hardHitPct)}%`,
        barrel: `${round1(exitVelo.barrelPct)}%`,
      },
    ],
    columns: [
      { key: "avgEV", label: "Avg EV" },
      { key: "maxEV", label: "Max EV" },
      { key: "hardHit", label: "Hard-Hit%" },
      { key: "barrel", label: "Barrel%" },
    ],
  };
}

// ── First N innings ────────────────────────────────────────────────

export function buildMLBFirstInningsChart(
  team: MLBTeamTwoSeason,
  innings: 1 | 3 | 5,
  line: number | undefined,
): ChartConfig | null {
  const pick = (g: MLBTeamGame): number | undefined => {
    if (innings === 1) return g.firstInningRuns;
    if (innings === 3) return g.f3Runs;
    return g.f5Runs;
  };

  const lastUsable = team.lastSeason.filter((g) => pick(g) !== undefined);
  const curUsable = team.currentSeason.filter((g) => pick(g) !== undefined);
  const total = lastUsable.length + curUsable.length;
  if (total < 10) return null;

  const rows: Record<string, unknown>[] = [];
  const addRow = (g: MLBTeamGame, isCurrent: boolean) => {
    const v = pick(g);
    if (v === undefined) return;
    const row: Record<string, unknown> = {
      game: fmtGame(g.date, g.opponent, g.isHome),
      lastSeasonRuns: isCurrent ? null : v,
      currentSeasonRuns: isCurrent ? v : null,
    };
    if (line !== undefined) row.line = line;
    rows.push(row);
  };
  for (const g of lastUsable) addRow(g, false);
  for (const g of curUsable) addRow(g, true);

  const plural = innings === 1 ? "" : "s";
  const relevance =
    line !== undefined
      ? (() => {
          const overs = [...lastUsable, ...curUsable].filter(
            (g) => (pick(g) ?? 0) > line,
          ).length;
          const curOvers = curUsable.filter((g) => (pick(g) ?? 0) > line).length;
          return `Over ${line} through ${innings} in ${overs}/${total} games (${curOvers}/${curUsable.length} this season)`;
        })()
      : `${total} games with usable linescores`;

  return {
    type: "line",
    title: `${team.teamName} — First ${innings} Inning${plural} Total Runs`,
    relevance,
    data: rows,
    xKey: "game",
    yKeys:
      line !== undefined
        ? ["lastSeasonRuns", "currentSeasonRuns", "line"]
        : ["lastSeasonRuns", "currentSeasonRuns"],
  };
}

// ── Dispatcher ─────────────────────────────────────────────────────

export interface MLBHistoryContext {
  teams: Record<string, MLBTeamTwoSeason>;
  probablePitchers: Record<string, MLBPitcherTwoSeason>;
  pitchersByName: Record<string, MLBPitcherTwoSeason>;
  batters: Record<string, MLBBatterTwoSeason>;
  batterVsPitcher: Record<string, MLBBatterVsPitcher>;
  standings: MLBStandingsSnapshot[];
  exitVelo: Record<string, { available: false } | { available: true; avgExitVelo: number; maxExitVelo: number; hardHitPct: number; barrelPct: number }>;
  // Probable pitcher's career vs opposing team, keyed by team name (whose pitcher we track).
  // Pulled across 6 seasons when available for a deeper track record than the 2-season main chart.
  pitcherCareerVsOpponent: Record<string, MLBPitcherGame[]>;
}

function detectPitcherProp(market: string, description: string): "strikeouts" | "era" | "innings" | null {
  const m = `${market} ${description}`.toLowerCase();
  if (m.includes("strikeout") || m.includes("k's") || /\bks?\b/.test(m)) return "strikeouts";
  if (m.includes("earned run") || m.includes("era")) return "era";
  if (m.includes("inning") || m.includes("outs recorded") || m.includes("recorded outs")) return "innings";
  return null;
}

function detectHitterStat(market: string, description: string):
  | "hits"
  | "homeRuns"
  | "rbi"
  | "totalBases"
  | "runs"
  | "strikeOuts"
  | "stolenBases"
  | null {
  const m = `${market} ${description}`.toLowerCase();
  if (m.includes("total base")) return "totalBases";
  if (m.includes("home run") || m.includes("hr") || /\bhr\b/.test(m)) return "homeRuns";
  if (m.includes("rbi") || m.includes("runs batted")) return "rbi";
  if (m.includes("stolen base")) return "stolenBases";
  if (m.includes("run scored") || m.includes("runs scored")) return "runs";
  if (m.includes("strikeout")) return "strikeOuts";
  if (m.includes("hit")) return "hits";
  return null;
}

function detectFuturesMarket(market: string, description: string): "division" | "league" | "world_series" | null {
  const m = `${market} ${description}`.toLowerCase();
  if (m.includes("world series")) return "world_series";
  if (m.includes("pennant") || m.includes("league champ") || m.includes("al champ") || m.includes("nl champ")) return "league";
  if (m.includes("division")) return "division";
  return null;
}

function detectInningsBet(market: string, description: string): 1 | 3 | 5 | null {
  const m = `${market} ${description}`.toLowerCase();
  if (m.includes("first 5") || m.includes("f5") || m.includes("1st 5")) return 5;
  if (m.includes("first 3") || m.includes("f3") || m.includes("1st 3")) return 3;
  if (m.includes("first inning") || m.includes("1st inning") || m.includes("nrfi") || m.includes("yrfi")) return 1;
  return null;
}

// ── Home vs Away Splits ──────────────────────────────────────────

export function buildMLBHomeAwaySplits(
  team: MLBTeamTwoSeason,
  line?: number,
  venueHint?: "home" | "away",
): ChartConfig | null {
  const games = team.currentSeason;
  const home = games.filter((g) => g.isHome);
  const away = games.filter((g) => !g.isHome);

  const avg = (arr: MLBTeamGame[], fn: (g: MLBTeamGame) => number) =>
    arr.length > 0 ? Math.round((arr.reduce((s, g) => s + fn(g), 0) / arr.length) * 10) / 10 : 0;

  // Single-venue column when venueHint is known
  if (venueHint) {
    const vGames = venueHint === "home" ? home : away;
    if (vGames.length < 2) return null;
    const wins = vGames.filter((g) => g.won).length;
    const label = venueHint === "home" ? "At Home" : "On Road";

    const data: Record<string, string>[] = [
      { stat: "Record", Value: `${wins}-${vGames.length - wins}` },
      { stat: "Win %", Value: `${Math.round((wins / vGames.length) * 100)}%` },
      { stat: "Avg Runs For", Value: `${avg(vGames, (g) => g.teamScore)}` },
      { stat: "Avg Runs Against", Value: `${avg(vGames, (g) => g.oppScore)}` },
      { stat: "Avg Total Runs", Value: `${avg(vGames, (g) => g.totalRuns)}` },
    ];

    if (line != null) {
      const covers = vGames.filter((g) => g.margin + line > 0).length;
      data.push({ stat: "Run Line Cover Rate", Value: `${Math.round((covers / vGames.length) * 100)}%` });
    }

    return {
      type: "table",
      title: `${team.teamName} — ${label} (${vGames.length}g)`,
      relevance: `${label} ${wins}-${vGames.length - wins} (${Math.round((wins / vGames.length) * 100)}%)`,
      data,
      columns: [
        { key: "stat", label: "" },
        { key: "Value", label: `${label} (${vGames.length}g)` },
      ],
    };
  }

  if (home.length < 2 || away.length < 2) return null;

  const homeWins = home.filter((g) => g.won).length;
  const awayWins = away.filter((g) => g.won).length;

  const data: Record<string, string>[] = [
    { stat: "Record", Home: `${homeWins}-${home.length - homeWins}`, Away: `${awayWins}-${away.length - awayWins}` },
    { stat: "Win %", Home: `${Math.round((homeWins / home.length) * 100)}%`, Away: `${Math.round((awayWins / away.length) * 100)}%` },
    { stat: "Avg Runs For", Home: `${avg(home, (g) => g.teamScore)}`, Away: `${avg(away, (g) => g.teamScore)}` },
    { stat: "Avg Runs Against", Home: `${avg(home, (g) => g.oppScore)}`, Away: `${avg(away, (g) => g.oppScore)}` },
    { stat: "Avg Total Runs", Home: `${avg(home, (g) => g.totalRuns)}`, Away: `${avg(away, (g) => g.totalRuns)}` },
  ];

  if (line != null) {
    const homeCovers = home.filter((g) => g.margin + line > 0).length;
    const awayCovers = away.filter((g) => g.margin + line > 0).length;
    data.push({ stat: "Run Line Cover Rate", Home: `${Math.round((homeCovers / home.length) * 100)}%`, Away: `${Math.round((awayCovers / away.length) * 100)}%` });
  }

  return {
    type: "table",
    title: `${team.teamName} — Home vs Away (${team.currentSeasonYear})`,
    relevance: `Home ${homeWins}-${home.length - homeWins} (${Math.round((homeWins / home.length) * 100)}%), Away ${awayWins}-${away.length - awayWins} (${Math.round((awayWins / away.length) * 100)}%)`,
    data,
    columns: [
      { key: "stat", label: "" },
      { key: "Home", label: `Home (${home.length}g)` },
      { key: "Away", label: `Away (${away.length}g)` },
    ],
  };
}

// ── Head-to-head vs opponent ─────────────────────────────────────

function shortDateMLB(d: string): string {
  try {
    const dt = new Date(d);
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
  } catch {
    return d.slice(5, 10);
  }
}

export function buildMLBTeamH2HTable(
  team: MLBTeamTwoSeason,
  opponentName: string,
): ChartConfig | null {
  const oppLower = opponentName.toLowerCase();
  const allGames = [...team.lastSeason, ...team.currentSeason];
  const h2h = allGames.filter((g) => g.opponent.toLowerCase().includes(oppLower));
  if (h2h.length === 0) return null;

  const wins = h2h.filter((g) => g.won).length;
  return {
    type: "table",
    title: `${team.teamName} vs ${opponentName} — head-to-head (${wins}-${h2h.length - wins})`,
    relevance: `${h2h.length} matchups across ${team.lastSeasonYear}-${team.currentSeasonYear}`,
    data: h2h.map((g) => ({
      date: shortDateMLB(g.date),
      season: `${g.season}`,
      site: g.isHome ? "Home" : "Away",
      result: g.won ? "W" : "L",
      score: `${g.teamScore}-${g.oppScore}`,
      total: g.totalRuns,
    })),
    columns: [
      { key: "date", label: "Date" },
      { key: "season", label: "Year" },
      { key: "site", label: "Site" },
      { key: "result", label: "Result" },
      { key: "score", label: "Score" },
      { key: "total", label: "Runs" },
    ],
  };
}

function getVenueHint(teamName: string, homeTeam?: string, awayTeam?: string): "home" | "away" | undefined {
  if (!homeTeam && !awayTeam) return undefined;
  const lower = teamName.toLowerCase();
  const lastWord = lower.split(/\s+/).pop() || "";
  if (homeTeam) {
    const hl = homeTeam.toLowerCase();
    if (lower.includes(hl) || hl.includes(lastWord)) return "home";
  }
  if (awayTeam) {
    const al = awayTeam.toLowerCase();
    if (lower.includes(al) || al.includes(lastWord)) return "away";
  }
  return undefined;
}

export function buildMLBDefaultCharts(
  betType: string,
  market: string | undefined,
  description: string | undefined,
  teams: string[],
  players: string[],
  line: number | undefined,
  history: MLBHistoryContext,
  homeTeam?: string,
  awayTeam?: string,
): ChartConfig[] {
  const out: ChartConfig[] = [];
  const marketStr = market || "";
  const descStr = description || "";

  const innings = detectInningsBet(marketStr, descStr);
  const futuresKind = detectFuturesMarket(marketStr, descStr);

  // Futures: division/league/world series
  if (betType === "futures" || futuresKind) {
    const kind = futuresKind || "division";
    for (const teamName of teams) {
      const chart = buildMLBFuturesChart(teamName, history.standings, kind);
      if (chart) out.push(chart);
      // Championship history table
      const record = getChampionshipHistory(teamName, "MLB");
      if (record) {
        const futuresType = kind === "world_series" ? "title" : kind === "league" ? "league" : "division";
        const titleYears = record.title;
        const leagueYears = record.league;
        const divYears = record.division;
        const data: Record<string, string>[] = [];
        if (titleYears.length > 0) data.push({ stat: "World Series Titles", Value: `${titleYears.length}x — last: ${titleYears[0]}`, Years: titleYears.slice(0, 6).join(", ") + (titleYears.length > 6 ? "..." : "") });
        else data.push({ stat: "World Series Titles", Value: "Never", Years: "—" });
        if (leagueYears.length > 0) data.push({ stat: "Pennants (AL/NL)", Value: `${leagueYears.length}x — last: ${leagueYears[0]}`, Years: leagueYears.slice(0, 6).join(", ") + (leagueYears.length > 6 ? "..." : "") });
        else data.push({ stat: "Pennants (AL/NL)", Value: "Never", Years: "—" });
        if (divYears.length > 0) data.push({ stat: "Division Titles", Value: `${divYears.length}x — last: ${divYears[0]}`, Years: divYears.slice(0, 6).join(", ") + (divYears.length > 6 ? "..." : "") });
        else data.push({ stat: "Division Titles", Value: "Never", Years: "—" });
        out.push({
          type: "table",
          title: `${teamName} — Championship History`,
          relevance: formatChampionshipSummary(teamName, record, futuresType),
          data,
          columns: [
            { key: "stat", label: "" },
            { key: "Value", label: "Record" },
            { key: "Years", label: "Recent Years" },
          ],
        });
      }
    }
    return out;
  }

  // First N innings (NRFI / F3 / F5)
  if (innings) {
    for (const teamName of teams) {
      const team = history.teams[teamName];
      if (!team) continue;
      const chart = buildMLBFirstInningsChart(team, innings, line);
      if (chart) out.push(chart);
    }
    // Still add probable pitcher history since it drives early-inning scoring
    for (const teamName of teams) {
      const p = history.probablePitchers[teamName];
      if (!p) continue;
      const c = buildMLBPitcherHistoryChart(p, "era");
      if (c) out.push(c);
    }
    return out;
  }

  // Player props
  if (betType === "player_prop") {
    const pitcherFocus = detectPitcherProp(marketStr, descStr);
    for (const playerName of players) {
      if (pitcherFocus) {
        const pitcherTS = history.pitchersByName[playerName];
        if (pitcherTS) {
          const c = buildMLBPitcherHistoryChart(pitcherTS, pitcherFocus);
          if (c) out.push(c);
          const oppTeamName = teams[0];
          const oppTeam = oppTeamName ? history.teams[oppTeamName] : undefined;
          if (oppTeam) {
            const career = history.pitcherCareerVsOpponent[playerName];
            const vs = buildMLBPitcherVsOpponentTable(pitcherTS, oppTeam.teamId, oppTeam.teamName, career);
            if (vs) out.push(vs);
          }
        }
        continue;
      }
      // Hitter prop
      const stat = detectHitterStat(marketStr, descStr) || "hits";
      const batter = history.batters[playerName];
      if (batter && line !== undefined) {
        const c = buildMLBBatterHistoryChart(batter, stat, line);
        if (c) out.push(c);
      }
      // vs opposing pitcher
      const bvp = history.batterVsPitcher[playerName];
      if (bvp) {
        const t = buildMLBBatterVsPitcherTable(bvp);
        if (t) out.push(t);
      }
      // Lasers: only for HR bets
      if (stat === "homeRuns") {
        const ev = history.exitVelo[playerName];
        if (ev) {
          const c = buildMLBLasersChart(ev);
          if (c) out.push(c);
        }
      }
    }
    return out;
  }

  // Team-level bets: spread / moneyline / over_under
  const marketType: "spread" | "moneyline" | "total" | null =
    betType === "spread" ? "spread" : betType === "moneyline" ? "moneyline" : betType === "over_under" ? "total" : null;
  if (!marketType) return out;

  for (const teamName of teams) {
    const team = history.teams[teamName];
    if (!team) continue;
    const chart = buildMLBTeamHistoryChart(team, marketType, line);
    if (chart) out.push(chart);
    const rec = buildMLBTeamRecordTable(team);
    if (rec) out.push(rec);
  }

  // Venue splits — combined into one table when both teams' venues known
  if (teams.length === 2 && homeTeam && awayTeam) {
    const awayTeamData = history.teams[teams.find((t) => getVenueHint(t, homeTeam, awayTeam) === "away") || ""];
    const homeTeamData = history.teams[teams.find((t) => getVenueHint(t, homeTeam, awayTeam) === "home") || ""];
    if (awayTeamData && homeTeamData) {
      const awayGames = awayTeamData.currentSeason.filter((g) => !g.isHome);
      const homeGames = homeTeamData.currentSeason.filter((g) => g.isHome);
      if (awayGames.length >= 2 && homeGames.length >= 2) {
        const avg = (arr: MLBTeamGame[], fn: (g: MLBTeamGame) => number) =>
          arr.length > 0 ? Math.round((arr.reduce((s, g) => s + fn(g), 0) / arr.length) * 10) / 10 : 0;
        const awayWins = awayGames.filter((g) => g.won).length;
        const homeWins = homeGames.filter((g) => g.won).length;
        const awayCol = `${shortName(awayTeamData.teamName)} (Road)`;
        const homeCol = `${shortName(homeTeamData.teamName)} (Home)`;
        const data: Record<string, string>[] = [
          { stat: "Record", [awayCol]: `${awayWins}-${awayGames.length - awayWins}`, [homeCol]: `${homeWins}-${homeGames.length - homeWins}` },
          { stat: "Win %", [awayCol]: `${pct(awayWins, awayGames.length)}%`, [homeCol]: `${pct(homeWins, homeGames.length)}%` },
          { stat: "Avg Runs For", [awayCol]: `${avg(awayGames, (g) => g.teamScore)}`, [homeCol]: `${avg(homeGames, (g) => g.teamScore)}` },
          { stat: "Avg Runs Against", [awayCol]: `${avg(awayGames, (g) => g.oppScore)}`, [homeCol]: `${avg(homeGames, (g) => g.oppScore)}` },
          { stat: "Avg Total", [awayCol]: `${avg(awayGames, (g) => g.totalRuns)}`, [homeCol]: `${avg(homeGames, (g) => g.totalRuns)}` },
        ];
        if (line != null) {
          const awayCovers = awayGames.filter((g) => g.margin + line > 0).length;
          const homeCovers = homeGames.filter((g) => g.margin + line > 0).length;
          data.push({ stat: "Cover Rate", [awayCol]: `${pct(awayCovers, awayGames.length)}%`, [homeCol]: `${pct(homeCovers, homeGames.length)}%` });
        }
        data.push({ stat: "Games", [awayCol]: `${awayGames.length}`, [homeCol]: `${homeGames.length}` });
        out.push({
          type: "table",
          title: "Venue Matchup — Road vs Home",
          relevance: `${awayTeamData.teamName} ${awayWins}-${awayGames.length - awayWins} on road vs ${homeTeamData.teamName} ${homeWins}-${homeGames.length - homeWins} at home`,
          data,
          columns: [{ key: "stat", label: "" }, { key: awayCol, label: awayCol }, { key: homeCol, label: homeCol }],
        });
      }
    }
  } else {
    // Fallback: per-team splits when venue unknown
    for (const teamName of teams) {
      const team = history.teams[teamName];
      if (!team) continue;
      const splits = buildMLBHomeAwaySplits(team, line);
      if (splits) out.push(splits);
    }
  }

  // H2H
  for (const teamName of teams) {
    const team = history.teams[teamName];
    if (!team) continue;
    const opponent = teams.find((t) => t !== teamName);
    if (opponent) {
      const h2h = buildMLBTeamH2HTable(team, opponent);
      if (h2h) out.push(h2h);
      break; // Only need one H2H table, not two
    }
  }

  // Both probable pitchers compared side by side — replaces the old per-team
  // ERA chart and pitcher-vs-opponent-team table which users said felt wrong
  // ("Yamamoto vs Mets" when they really wanted pitcher-vs-pitcher).
  const homeTeamName = teams[0];
  const awayTeamName = teams[1];
  const homePitcher = homeTeamName ? history.probablePitchers[homeTeamName] : undefined;
  const awayPitcher = awayTeamName ? history.probablePitchers[awayTeamName] : undefined;
  if (homePitcher || awayPitcher) {
    const record = buildMLBPitcherSeasonRecord(homePitcher, awayPitcher);
    if (record) out.push(record);
    // Recent starts table removed — redundant with the full season record above
  }

  return out;
}
