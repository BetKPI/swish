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

// ── Team history ───────────────────────────────────────────────────

export function buildMLBTeamHistoryChart(
  team: MLBTeamTwoSeason,
  marketType: "spread" | "moneyline" | "total",
  line: number | undefined,
): ChartConfig | null {
  const total = team.lastSeason.length + team.currentSeason.length;
  if (total < 10) return null;

  const rows: Record<string, unknown>[] = [];
  const addRow = (g: MLBTeamGame, isCurrent: boolean) => {
    const label = fmtGame(g.date, g.opponent, g.isHome);
    const row: Record<string, unknown> = { game: label };
    if (marketType === "total") {
      row.lastSeasonTotal = isCurrent ? null : g.totalRuns;
      row.currentSeasonTotal = isCurrent ? g.totalRuns : null;
      if (line !== undefined) row.line = line;
    } else {
      row.lastSeasonMargin = isCurrent ? null : g.margin;
      row.currentSeasonMargin = isCurrent ? g.margin : null;
      if (marketType === "spread" && line !== undefined) row.line = -line;
    }
    rows.push(row);
  };

  for (const g of team.lastSeason) addRow(g, false);
  for (const g of team.currentSeason) addRow(g, true);

  if (marketType === "total") {
    const threshold = line ?? 0;
    const overs = [...team.lastSeason, ...team.currentSeason].filter(
      (g) => g.totalRuns > threshold,
    ).length;
    const curOvers = team.currentSeason.filter((g) => g.totalRuns > threshold).length;
    return {
      type: "line",
      title: `${team.teamName} — Game Totals History`,
      relevance:
        line !== undefined
          ? `Over ${line} in ${overs}/${total} games (${curOvers}/${team.currentSeason.length} this season)`
          : `${total} games across ${team.lastSeasonYear}-${team.currentSeasonYear}`,
      data: rows,
      xKey: "game",
      yKeys:
        line !== undefined
          ? ["lastSeasonTotal", "currentSeasonTotal", "line"]
          : ["lastSeasonTotal", "currentSeasonTotal"],
    };
  }

  if (marketType === "moneyline") {
    const wins = team.lastSeason.filter((g) => g.won).length;
    const losses = team.lastSeason.length - wins;
    const curWins = team.currentSeason.filter((g) => g.won).length;
    const curLosses = team.currentSeason.length - curWins;
    return {
      type: "line",
      title: `${team.teamName} — Win/Loss Margin History`,
      relevance: `${wins}-${losses} last season, ${curWins}-${curLosses} this season`,
      data: rows,
      xKey: "game",
      yKeys: ["lastSeasonMargin", "currentSeasonMargin"],
    };
  }

  const threshold = line ?? 0;
  const covers = [...team.lastSeason, ...team.currentSeason].filter(
    (g) => g.margin > -threshold,
  ).length;
  const thisSeasonCovers = team.currentSeason.filter(
    (g) => g.margin > -threshold,
  ).length;
  return {
    type: "line",
    title: `${team.teamName} — Margin History`,
    relevance:
      line !== undefined
        ? `Covered ${line > 0 ? "+" : ""}${line} in ${covers}/${total} games across last season and YTD (${thisSeasonCovers}/${team.currentSeason.length} this year)`
        : `${total} games across ${team.lastSeasonYear}-${team.currentSeasonYear}`,
    data: rows,
    xKey: "game",
    yKeys:
      line !== undefined
        ? ["lastSeasonMargin", "currentSeasonMargin", "line"]
        : ["lastSeasonMargin", "currentSeasonMargin"],
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

  const rows: Record<string, unknown>[] = [];
  const addRow = (g: MLBBatterGame, isCurrent: boolean) => {
    const v = pick(g);
    rows.push({
      game: fmtPitcherGame(g.date, g.opponent),
      lastSeasonValue: isCurrent ? null : v,
      currentSeasonValue: isCurrent ? v : null,
      line,
    });
  };
  for (const g of batter.lastSeason) addRow(g, false);
  for (const g of batter.currentSeason) addRow(g, true);

  const hits = [...batter.lastSeason, ...batter.currentSeason].filter(
    (g) => pick(g) >= line,
  ).length;
  const curHits = batter.currentSeason.filter((g) => pick(g) >= line).length;

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
    type: "line",
    title: `${batter.batterName} — ${label} History`,
    relevance: `Hit ${line}+ in ${hits}/${total} games (${pct(hits, total)}% — ${pct(curHits, batter.currentSeason.length)}% this season)`,
    data: rows,
    xKey: "game",
    yKeys: ["lastSeasonValue", "currentSeasonValue", "line"],
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

export function buildMLBDefaultCharts(
  betType: string,
  market: string | undefined,
  description: string | undefined,
  teams: string[],
  players: string[],
  line: number | undefined,
  history: MLBHistoryContext,
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
  }

  for (const teamName of teams) {
    const p = history.probablePitchers[teamName];
    if (!p) continue;
    const focus: "era" | "strikeouts" | "innings" = marketType === "total" ? "era" : "era";
    const c = buildMLBPitcherHistoryChart(p, focus);
    if (c) out.push(c);
    const opponentName = teams.find((t) => t !== teamName);
    if (opponentName) {
      const opp = history.teams[opponentName];
      if (opp) {
        const career = history.pitcherCareerVsOpponent[teamName];
        const vs = buildMLBPitcherVsOpponentTable(p, opp.teamId, opp.teamName, career);
        if (vs) out.push(vs);
      }
    }
  }

  return out;
}
