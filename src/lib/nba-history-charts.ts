/**
 * NBA History Charts — deterministic chart builders consuming nba-history primitives.
 * Two-season overlays render as two colored series via separate yKeys.
 */

import type { ChartConfig } from "@/types";
import type {
  NBATeamTwoSeason,
  NBATeamGame,
  NBAPlayerTwoSeason,
  NBAPlayerGame,
  NBAStandingsSnapshot,
} from "./nba-history";

// ── Shared helpers ─────────────────────────────────────────────────

function shortDate(d: string): string {
  try {
    const dt = new Date(d);
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
  } catch {
    return d.slice(5, 10);
  }
}

function splitBySeason<T extends { season: number }>(arr: T[], last: number, curr: number) {
  return {
    last: arr.filter((g) => g.season === last),
    current: arr.filter((g) => g.season === curr),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function rollingMean(values: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    out.push(round1(slice.reduce((a, b) => a + b, 0) / slice.length));
  }
  return out;
}

function seasonLabel(year: number): string {
  return `${year - 1}-${String(year).slice(2)}`;
}

// ── Team history (spread / moneyline / total) ────────────────────

export function buildNBATeamHistoryChart(
  team: NBATeamTwoSeason,
  marketType: "spread" | "moneyline" | "total",
  line: number | undefined,
): ChartConfig | null {
  if (team.games.length === 0) return null;
  const { last, current } = splitBySeason(team.games, team.lastSeason, team.currentSeason);
  if (last.length === 0 && current.length === 0) return null;

  const pick = (g: NBATeamGame): number =>
    marketType === "total" ? g.total : g.margin;
  const lastRaw = last.map(pick);
  const currRaw = current.map(pick);
  const lastAvg = rollingMean(lastRaw, 10);
  const currAvg = rollingMean(currRaw, 10);

  const maxLen = Math.max(lastAvg.length, currAvg.length);
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < maxLen; i++) {
    const row: Record<string, unknown> = { game: `G${i + 1}` };
    if (i < lastAvg.length) row.lastSeason = lastAvg[i];
    if (i < currAvg.length) row.currentSeason = currAvg[i];
    if (line != null) row.line = marketType === "spread" ? -line : line;
    rows.push(row);
  }

  const yKeys = line != null ? ["lastSeason", "currentSeason", "line"] : ["lastSeason", "currentSeason"];

  const lastLabel = seasonLabel(team.lastSeason);
  const currLabel = seasonLabel(team.currentSeason);

  if (marketType === "total") {
    const threshold = line ?? 0;
    const overs = [...lastRaw, ...currRaw].filter((v) => v > threshold).length;
    const curOvers = currRaw.filter((v) => v > threshold).length;
    return {
      type: "line",
      title: `${team.teamName} — Total Points (10-game rolling avg)`,
      relevance:
        line != null
          ? `Over ${line} in ${overs} of ${lastRaw.length + currRaw.length} games (${curOvers} of ${currRaw.length} this season). Smoothed across ${lastLabel} and ${currLabel}.`
          : `Smoothed game-total trend across ${lastLabel} and ${currLabel}.`,
      data: rows,
      xKey: "game",
      yKeys,
    };
  }

  if (marketType === "moneyline") {
    const lastW = last.filter((g) => g.won).length;
    const curW = current.filter((g) => g.won).length;
    return {
      type: "line",
      title: `${team.teamName} — Point Differential (10-game rolling avg)`,
      relevance: `Last season ${lastW}-${last.length - lastW}, this season ${curW}-${current.length - curW}. Above zero = winning more than losing.`,
      data: rows,
      xKey: "game",
      yKeys: ["lastSeason", "currentSeason"],
    };
  }

  const threshold = line ?? 0;
  const covers = [...lastRaw, ...currRaw].filter((v) => v > -threshold).length;
  const thisCovers = currRaw.filter((v) => v > -threshold).length;
  return {
    type: "line",
    title: `${team.teamName} — Margin vs Spread (10-game rolling avg)`,
    relevance:
      line != null
        ? `Covered ${line > 0 ? "+" : ""}${line} in ${covers} of ${lastRaw.length + currRaw.length} games (${thisCovers} of ${currRaw.length} this season). When the line sits above the spread reference, they've been covering.`
        : `Smoothed margin trend across ${lastLabel} and ${currLabel}.`,
    data: rows,
    xKey: "game",
    yKeys,
  };
}

// ── Team record vs the line (ATS / O-U / SU) summary table ────────

export function buildNBATeamBetTypeTable(
  team: NBATeamTwoSeason,
  marketType: "spread" | "moneyline" | "total",
  line: number | undefined,
): ChartConfig | null {
  if (team.games.length === 0) return null;
  const { last, current } = splitBySeason(team.games, team.lastSeason, team.currentSeason);

  function summarize(games: NBATeamGame[]) {
    if (marketType === "moneyline") {
      const w = games.filter((g) => g.won).length;
      const l = games.length - w;
      return `${w}-${l} (${games.length > 0 ? ((w / games.length) * 100).toFixed(1) : "0"}%)`;
    }
    if (marketType === "total") {
      if (line == null) {
        const avg = games.length > 0 ? games.reduce((s, g) => s + g.total, 0) / games.length : 0;
        return `${avg.toFixed(1)} avg`;
      }
      const over = games.filter((g) => g.total > line).length;
      const under = games.filter((g) => g.total < line).length;
      const push = games.length - over - under;
      return `${over}-${under}${push > 0 ? `-${push}` : ""} O/U (${games.length > 0 ? ((over / games.length) * 100).toFixed(0) : "0"}% O)`;
    }
    // spread: line is "team is favored by X" — team covers if margin > line
    if (line == null) {
      const w = games.filter((g) => g.won).length;
      return `${w}-${games.length - w} SU`;
    }
    const cover = games.filter((g) => g.margin > -line).length;
    const notCover = games.filter((g) => g.margin < -line).length;
    const push = games.length - cover - notCover;
    return `${cover}-${notCover}${push > 0 ? `-${push}` : ""} ATS (${games.length > 0 ? ((cover / games.length) * 100).toFixed(0) : "0"}%)`;
  }

  const rows = [
    { season: `${team.lastSeason - 1}-${String(team.lastSeason).slice(2)}`, record: summarize(last), gp: last.length },
    { season: `${team.currentSeason - 1}-${String(team.currentSeason).slice(2)} YTD`, record: summarize(current), gp: current.length },
  ];

  return {
    type: "table",
    title: `${team.teamName} — ${marketType === "moneyline" ? "SU" : marketType === "total" ? "O/U" : "ATS"} track record`,
    relevance: `How ${team.teamName} has performed on this ${marketType} bet type across both seasons.`,
    data: rows,
    columns: [
      { key: "season", label: "Season" },
      { key: "record", label: "Record" },
      { key: "gp", label: "GP" },
    ],
  };
}

// ── Home vs Away Splits ──────────────────────────────────────────

export function buildNBAHomeAwaySplits(
  team: NBATeamTwoSeason,
  line?: number,
): ChartConfig | null {
  const currentGames = team.games.filter((g) => g.season === team.currentSeason);
  const home = currentGames.filter((g) => g.home);
  const away = currentGames.filter((g) => !g.home);
  if (home.length < 2 || away.length < 2) return null;

  const avg = (arr: NBATeamGame[], fn: (g: NBATeamGame) => number) =>
    arr.length > 0 ? Math.round((arr.reduce((s, g) => s + fn(g), 0) / arr.length) * 10) / 10 : 0;

  const homeWins = home.filter((g) => g.won).length;
  const awayWins = away.filter((g) => g.won).length;

  const data: Record<string, string>[] = [
    { stat: "Record", Home: `${homeWins}-${home.length - homeWins}`, Away: `${awayWins}-${away.length - awayWins}` },
    { stat: "Win %", Home: `${Math.round((homeWins / home.length) * 100)}%`, Away: `${Math.round((awayWins / away.length) * 100)}%` },
    { stat: "Avg Points For", Home: `${avg(home, (g) => g.teamScore)}`, Away: `${avg(away, (g) => g.teamScore)}` },
    { stat: "Avg Points Against", Home: `${avg(home, (g) => g.opponentScore)}`, Away: `${avg(away, (g) => g.opponentScore)}` },
    { stat: "Avg Margin", Home: `${avg(home, (g) => g.margin) > 0 ? "+" : ""}${avg(home, (g) => g.margin)}`, Away: `${avg(away, (g) => g.margin) > 0 ? "+" : ""}${avg(away, (g) => g.margin)}` },
    { stat: "Avg Total", Home: `${avg(home, (g) => g.total)}`, Away: `${avg(away, (g) => g.total)}` },
  ];

  if (line != null) {
    const homeCovers = home.filter((g) => g.margin + line > 0).length;
    const awayCovers = away.filter((g) => g.margin + line > 0).length;
    data.push({ stat: "ATS Cover Rate", Home: `${Math.round((homeCovers / home.length) * 100)}%`, Away: `${Math.round((awayCovers / away.length) * 100)}%` });
  }

  return {
    type: "table",
    title: `${team.teamName} — Home vs Away (${team.currentSeason - 1}-${String(team.currentSeason).slice(2)})`,
    relevance: `Home ${homeWins}-${home.length - homeWins} (${Math.round((homeWins / home.length) * 100)}%), Away ${awayWins}-${away.length - awayWins} (${Math.round((awayWins / away.length) * 100)}%)`,
    data,
    columns: [
      { key: "stat", label: "" },
      { key: "Home", label: `Home (${home.length}g)` },
      { key: "Away", label: `Away (${away.length}g)` },
    ],
  };
}

// ── Head-to-head vs opponent table ─────────────────────────────────

export function buildNBATeamH2HTable(
  team: NBATeamTwoSeason,
  opponentName: string,
): ChartConfig | null {
  const oppLower = opponentName.toLowerCase();
  const h2h = team.games.filter((g) => g.opponent.toLowerCase().includes(oppLower));
  if (h2h.length === 0) return null;

  const rows = h2h.map((g) => ({
    date: shortDate(g.date),
    season: `${g.season - 1}-${String(g.season).slice(2)}`,
    site: g.home ? "Home" : "Away",
    result: g.won ? "W" : "L",
    score: `${g.teamScore}-${g.opponentScore}`,
    margin: g.margin,
    total: g.total,
  }));

  return {
    type: "table",
    title: `${team.teamName} vs ${opponentName} — head-to-head`,
    relevance: `Direct matchups across both seasons (and prior).`,
    data: rows,
    columns: [
      { key: "date", label: "Date" },
      { key: "season", label: "Season" },
      { key: "site", label: "Site" },
      { key: "result", label: "Result" },
      { key: "score", label: "Score" },
      { key: "margin", label: "Margin" },
      { key: "total", label: "Total" },
    ],
  };
}

// ── Player prop history ────────────────────────────────────────────

export type NBAPlayerStatKey = "PTS" | "REB" | "AST" | "3PM" | "STL" | "BLK" | "TO" | "MIN" | "FGM" | "FGA";

function findStat(game: NBAPlayerGame, key: NBAPlayerStatKey): number | null {
  // ESPN labels for NBA gamelog typically: "PTS", "REB", "AST", "3PT" (e.g. 3-7), "FG", "STL", "BLK", "TO", "MIN".
  // We only read numeric fields, so "3PM"/"FGM" may be missing — try common aliases.
  const s = game.stats;
  if (key === "PTS") return s.PTS ?? null;
  if (key === "REB") return s.REB ?? null;
  if (key === "AST") return s.AST ?? null;
  if (key === "STL") return s.STL ?? null;
  if (key === "BLK") return s.BLK ?? null;
  if (key === "TO") return s.TO ?? null;
  if (key === "MIN") return s.MIN ?? null;
  if (key === "3PM") return s["3PM"] ?? null;
  if (key === "FGM") return s.FGM ?? null;
  if (key === "FGA") return s.FGA ?? null;
  return null;
}

export function buildNBAPlayerHistoryChart(
  player: NBAPlayerTwoSeason,
  stat: NBAPlayerStatKey,
  line: number | undefined,
): ChartConfig | null {
  if (player.games.length === 0) return null;

  const rows: Record<string, unknown>[] = [];
  let hasAny = false;
  for (const g of player.games) {
    const v = findStat(g, stat);
    if (v == null) continue;
    hasAny = true;
    const isCurrent = g.season === player.currentSeason;
    rows.push({
      date: shortDate(g.date),
      opponent: g.opponent,
      [isCurrent ? "currentSeason" : "lastSeason"]: v,
      ...(line != null ? { line } : {}),
    });
  }
  if (!hasAny) return null;

  return {
    type: "line",
    title: `${player.playerName} — ${stat} (${player.lastSeason - 1}-${String(player.lastSeason).slice(2)} & ${player.currentSeason - 1}-${String(player.currentSeason).slice(2)})`,
    relevance: `Game-by-game ${stat} across both seasons${line != null ? ` vs the ${line} line` : ""}.`,
    data: rows,
    xKey: "date",
    yKeys: ["lastSeason", "currentSeason", ...(line != null ? ["line"] : [])],
  };
}

export function buildNBAPlayerHitRateTable(
  player: NBAPlayerTwoSeason,
  stat: NBAPlayerStatKey,
  line: number,
): ChartConfig | null {
  if (player.games.length === 0) return null;
  const { last, current } = splitBySeason(player.games, player.lastSeason, player.currentSeason);

  function hitRate(games: NBAPlayerGame[]) {
    const vals = games.map((g) => findStat(g, stat)).filter((v): v is number => v != null);
    if (vals.length === 0) return { rec: "—", pct: "—" };
    const hits = vals.filter((v) => v > line).length;
    return { rec: `${hits}/${vals.length}`, pct: `${((hits / vals.length) * 100).toFixed(0)}%` };
  }

  const l = hitRate(last);
  const c = hitRate(current);

  return {
    type: "table",
    title: `${player.playerName} — over ${line} ${stat} hit rate`,
    relevance: `How often ${player.playerName} has gone over ${line} ${stat} across both seasons.`,
    data: [
      { season: `${player.lastSeason - 1}-${String(player.lastSeason).slice(2)}`, record: l.rec, pct: l.pct },
      { season: `${player.currentSeason - 1}-${String(player.currentSeason).slice(2)} YTD`, record: c.rec, pct: c.pct },
    ],
    columns: [
      { key: "season", label: "Season" },
      { key: "record", label: "Over" },
      { key: "pct", label: "Rate" },
    ],
  };
}

export function buildNBAPlayerVsOpponentTable(
  player: NBAPlayerTwoSeason,
  stat: NBAPlayerStatKey,
  line: number | undefined,
  opponentName: string,
): ChartConfig | null {
  const oppLower = opponentName.toLowerCase();
  const matches = player.games.filter((g) => g.opponent.toLowerCase().includes(oppLower));
  if (matches.length === 0) return null;

  const rows = matches.map((g) => ({
    date: shortDate(g.date),
    season: `${g.season - 1}-${String(g.season).slice(2)}`,
    site: g.home ? "Home" : "Away",
    value: findStat(g, stat) ?? "—",
    ...(line != null ? { hit: typeof findStat(g, stat) === "number" && (findStat(g, stat) as number) > line ? "✓" : "✗" } : {}),
  }));

  const columns = [
    { key: "date", label: "Date" },
    { key: "season", label: "Season" },
    { key: "site", label: "Site" },
    { key: "value", label: stat },
    ...(line != null ? [{ key: "hit", label: `> ${line}` }] : []),
  ];

  return {
    type: "table",
    title: `${player.playerName} vs ${opponentName} — ${stat} history`,
    relevance: `Every game ${player.playerName} has played against ${opponentName} across both seasons.`,
    data: rows,
    columns,
  };
}

// ── Futures (division / conference / title) ───────────────────────

export function buildNBAFuturesChart(
  teamName: string,
  standings: NBAStandingsSnapshot[],
  kind: "division" | "conference" | "title",
): ChartConfig | null {
  if (standings.length === 0) return null;
  const rows: Record<string, unknown>[] = [];
  const teamLower = teamName.toLowerCase();

  for (const snap of standings) {
    const me = snap.rows.find((r) => r.team.toLowerCase().includes(teamLower));
    if (!me) continue;
    const peers = snap.rows.filter((r) => r.conference === me.conference);
    const rank = peers.findIndex((r) => r.team === me.team) + 1;
    rows.push({
      season: `${snap.season - 1}-${String(snap.season).slice(2)}`,
      record: `${me.wins}-${me.losses}`,
      winPct: me.winPct,
      conferenceRank: rank > 0 ? rank : "—",
      seed: me.seed || "—",
    });
  }
  if (rows.length === 0) return null;

  const kindLabel =
    kind === "title" ? "championship" : kind === "conference" ? "conference" : "division";

  return {
    type: "table",
    title: `${teamName} — ${kindLabel} futures track record`,
    relevance: `How ${teamName} has finished in their ${kind === "division" ? "division" : "conference"} across recent seasons.`,
    data: rows,
    columns: [
      { key: "season", label: "Season" },
      { key: "record", label: "Record" },
      { key: "conferenceRank", label: "Conf Rank" },
      { key: "seed", label: "Seed" },
    ],
  };
}

// ── Quarter / 3Q 100+ chart ────────────────────────────────────────

export function buildNBAQuarterScoringChart(
  team: NBATeamTwoSeason,
  through: "half" | "q3",
  line: number | undefined,
): ChartConfig | null {
  const games = team.games.filter((g) => g.q1 != null && g.q2 != null && g.q3 != null);
  if (games.length === 0) return null;

  const rows = games.map((g) => {
    const teamThrough =
      through === "q3"
        ? (g.q1 || 0) + (g.q2 || 0) + (g.q3 || 0)
        : (g.q1 || 0) + (g.q2 || 0);
    const gameThrough =
      through === "q3"
        ? (g.q1 || 0) + (g.q2 || 0) + (g.q3 || 0) + (g.oppQ1 || 0) + (g.oppQ2 || 0) + (g.oppQ3 || 0)
        : (g.q1 || 0) + (g.q2 || 0) + (g.oppQ1 || 0) + (g.oppQ2 || 0);
    const isCurrent = g.season === team.currentSeason;
    return {
      date: shortDate(g.date),
      opponent: g.opponent,
      [isCurrent ? "currentSeasonTeam" : "lastSeasonTeam"]: teamThrough,
      [isCurrent ? "currentSeasonGame" : "lastSeasonGame"]: gameThrough,
      ...(line != null ? { line } : {}),
    };
  });

  const label = through === "q3" ? "through 3Q" : "through the half";
  return {
    type: "line",
    title: `${team.teamName} — scoring ${label}`,
    relevance: `${team.teamName}'s points ${label} and the full-game context${line != null ? ` vs the ${line} line` : ""}.`,
    data: rows,
    xKey: "date",
    yKeys: [
      "lastSeasonTeam",
      "currentSeasonTeam",
      "lastSeasonGame",
      "currentSeasonGame",
      ...(line != null ? ["line"] : []),
    ],
  };
}

export function buildNBAQuarterHitRateTable(
  team: NBATeamTwoSeason,
  through: "half" | "q3",
  line: number,
  metric: "team" | "game",
): ChartConfig | null {
  const games = team.games.filter((g) => g.q1 != null && g.q2 != null && (through === "half" || g.q3 != null));
  if (games.length === 0) return null;
  const { last, current } = splitBySeason(games, team.lastSeason, team.currentSeason);
  function rate(arr: NBATeamGame[]) {
    if (arr.length === 0) return { rec: "—", pct: "—" };
    const hits = arr.filter((g) => {
      const teamPts =
        through === "q3"
          ? (g.q1 || 0) + (g.q2 || 0) + (g.q3 || 0)
          : (g.q1 || 0) + (g.q2 || 0);
      const gamePts =
        teamPts +
        (through === "q3"
          ? (g.oppQ1 || 0) + (g.oppQ2 || 0) + (g.oppQ3 || 0)
          : (g.oppQ1 || 0) + (g.oppQ2 || 0));
      return (metric === "team" ? teamPts : gamePts) > line;
    }).length;
    return { rec: `${hits}/${arr.length}`, pct: `${((hits / arr.length) * 100).toFixed(0)}%` };
  }
  const l = rate(last);
  const c = rate(current);
  const label = through === "q3" ? "3Q" : "half";
  return {
    type: "table",
    title: `${team.teamName} — over ${line} ${metric} pts through ${label}`,
    relevance: `How often ${team.teamName}'s${metric === "game" ? " combined game" : ""} scoring has exceeded ${line} through ${label}.`,
    data: [
      { season: `${team.lastSeason - 1}-${String(team.lastSeason).slice(2)}`, record: l.rec, pct: l.pct },
      { season: `${team.currentSeason - 1}-${String(team.currentSeason).slice(2)} YTD`, record: c.rec, pct: c.pct },
    ],
    columns: [
      { key: "season", label: "Season" },
      { key: "record", label: "Over" },
      { key: "pct", label: "Rate" },
    ],
  };
}

// ── Dispatcher ─────────────────────────────────────────────────────

export interface NBAHistoryContext {
  teams: Record<string, NBATeamTwoSeason>;
  players: Record<string, NBAPlayerTwoSeason>;
  standings: NBAStandingsSnapshot[];
  // First-basket data from the pre-built JSON (optional, keyed by team tricode).
  firstBasket?: Record<string, unknown>;
}

function detectPlayerStat(market: string, description: string): NBAPlayerStatKey | null {
  const m = `${market} ${description}`.toLowerCase();
  if (m.includes("3-point") || m.includes("three") || m.includes("3pt") || m.includes("3 pointer")) return "3PM";
  if (m.includes("rebound")) return "REB";
  if (m.includes("assist")) return "AST";
  if (m.includes("steal")) return "STL";
  if (m.includes("block")) return "BLK";
  if (m.includes("turnover")) return "TO";
  if (m.includes("minute")) return "MIN";
  if (m.includes("point")) return "PTS";
  return null;
}

function detectQuarterBet(
  market: string,
  description: string,
): { through: "half" | "q3"; metric: "team" | "game" } | null {
  const m = `${market} ${description}`.toLowerCase();
  const half = m.includes("first half") || m.includes("1st half") || /\b1h\b/.test(m);
  const q3 = m.includes("3q") || m.includes("3rd quarter") || m.includes("third quarter") || m.includes("through 3") || m.includes("first 3 quarter") || m.includes("1st 3 quarter");
  if (!half && !q3) return null;
  const metric: "team" | "game" = m.includes("team") ? "team" : "game";
  return { through: q3 ? "q3" : "half", metric };
}

function detectFuturesKind(
  market: string,
  description: string,
  betType: string,
): "division" | "conference" | "title" | null {
  const m = `${market} ${description}`.toLowerCase();
  if (m.includes("champion") && !m.includes("division") && !m.includes("conference")) return "title";
  if (m.includes("conference") || m.includes("east") || m.includes("west")) return "conference";
  if (m.includes("division")) return "division";
  if (betType === "futures" || betType === "game_prop") return "division";
  return null;
}

export function buildNBADefaultCharts(
  betType: string,
  market: string | undefined,
  description: string | undefined,
  teams: string[],
  players: string[],
  line: number | undefined,
  history: NBAHistoryContext,
): ChartConfig[] {
  const out: ChartConfig[] = [];
  const marketStr = market || "";
  const descStr = description || "";

  // Quarter-based exotics (1H, 3Q 100+)
  const quarter = detectQuarterBet(marketStr, descStr);
  if (quarter) {
    for (const teamName of teams) {
      const team = history.teams[teamName];
      if (!team) continue;
      const chart = buildNBAQuarterScoringChart(team, quarter.through, line);
      if (chart) out.push(chart);
      if (line != null) {
        const rate = buildNBAQuarterHitRateTable(team, quarter.through, line, quarter.metric);
        if (rate) out.push(rate);
      }
    }
    if (out.length > 0) return out;
  }

  // Futures
  const futuresKind = detectFuturesKind(marketStr, descStr, betType);
  if (betType === "futures" || futuresKind) {
    for (const teamName of teams) {
      const chart = buildNBAFuturesChart(teamName, history.standings, futuresKind || "division");
      if (chart) out.push(chart);
    }
    if (out.length > 0) return out;
  }

  // Player props
  if (betType === "player_prop") {
    const stat = detectPlayerStat(marketStr, descStr) || "PTS";
    for (const playerName of players) {
      const p = history.players[playerName];
      if (!p) continue;
      const hist = buildNBAPlayerHistoryChart(p, stat, line);
      if (hist) out.push(hist);
      if (line != null) {
        const hr = buildNBAPlayerHitRateTable(p, stat, line);
        if (hr) out.push(hr);
      }
      // vs opponent
      const opp = teams[0];
      if (opp) {
        const vs = buildNBAPlayerVsOpponentTable(p, stat, line, opp);
        if (vs) out.push(vs);
      }
    }
    return out;
  }

  // Team-level bets: spread / moneyline / total
  const marketType: "spread" | "moneyline" | "total" | null =
    betType === "spread" ? "spread" : betType === "moneyline" ? "moneyline" : betType === "over_under" ? "total" : null;
  if (!marketType) return out;

  for (const teamName of teams) {
    const team = history.teams[teamName];
    if (!team) continue;
    const chart = buildNBATeamHistoryChart(team, marketType, line);
    if (chart) out.push(chart);
    const rec = buildNBATeamBetTypeTable(team, marketType, line);
    if (rec) out.push(rec);
    const splits = buildNBAHomeAwaySplits(team, line);
    if (splits) out.push(splits);
    const opponent = teams.find((t) => t !== teamName);
    if (opponent) {
      const h2h = buildNBATeamH2HTable(team, opponent);
      if (h2h) out.push(h2h);
    }
  }

  return out;
}
