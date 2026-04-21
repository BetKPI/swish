/**
 * NHL History Charts — deterministic chart builders consuming nhl-history primitives.
 */

import type { ChartConfig } from "@/types";
import type {
  NHLTeamTwoSeason,
  NHLTeamGame,
  NHLPlayerTwoSeason,
  NHLPlayerGame,
  NHLStandingsSnapshot,
} from "./nhl-history";
import { getChampionshipHistory, formatChampionshipSummary } from "./championship-history";

function shortDate(d: string): string {
  try {
    const dt = new Date(d);
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
  } catch {
    return d.slice(5, 10);
  }
}

function splitBySeason<T extends { season: string }>(arr: T[], last: string, curr: string) {
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

function seasonLabelFromCode(code: string): string {
  return `${code.slice(2, 4)}-${code.slice(6)}`;
}

// ── Team history (spread / moneyline / total) ────────────────────

export function buildNHLTeamHistoryChart(
  team: NHLTeamTwoSeason,
  marketType: "spread" | "moneyline" | "total",
  line: number | undefined,
): ChartConfig | null {
  if (team.games.length === 0) return null;
  const { last, current } = splitBySeason(team.games, team.lastSeason, team.currentSeason);

  const pick = (g: NHLTeamGame): number => (marketType === "total" ? g.total : g.margin);
  const lastRaw = last.map(pick);
  const currRaw = current.map(pick);
  const lastAvg = rollingMean(lastRaw, 12);
  const currAvg = rollingMean(currRaw, 12);

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

  const lastLabel = seasonLabelFromCode(team.lastSeason);
  const currLabel = seasonLabelFromCode(team.currentSeason);

  if (marketType === "total") {
    const threshold = line ?? 0;
    const overs = [...lastRaw, ...currRaw].filter((v) => v > threshold).length;
    const curOvers = currRaw.filter((v) => v > threshold).length;
    return {
      type: "line",
      title: `${team.teamName} — Total Goals (12-game rolling avg)`,
      relevance:
        line != null
          ? `Over ${line} in ${overs} of ${lastRaw.length + currRaw.length} games (${curOvers} of ${currRaw.length} this season). Smoothed across ${lastLabel} and ${currLabel}.`
          : `Smoothed total-goals trend across ${lastLabel} and ${currLabel}.`,
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
      title: `${team.teamName} — Goal Differential (12-game rolling avg)`,
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
    title: `${team.teamName} — Margin vs Spread (12-game rolling avg)`,
    relevance:
      line != null
        ? `Covered ${line > 0 ? "+" : ""}${line} in ${covers} of ${lastRaw.length + currRaw.length} games (${thisCovers} of ${currRaw.length} this season).`
        : `Smoothed margin trend across ${lastLabel} and ${currLabel}.`,
    data: rows,
    xKey: "game",
    yKeys,
  };
}

export function buildNHLTeamBetTypeTable(
  team: NHLTeamTwoSeason,
  marketType: "spread" | "moneyline" | "total",
  line: number | undefined,
): ChartConfig | null {
  if (team.games.length === 0) return null;
  const { last, current } = splitBySeason(team.games, team.lastSeason, team.currentSeason);

  function summarize(games: NHLTeamGame[]) {
    if (marketType === "moneyline") {
      const w = games.filter((g) => g.won).length;
      return `${w}-${games.length - w} (${games.length > 0 ? ((w / games.length) * 100).toFixed(0) : "0"}%)`;
    }
    if (marketType === "total") {
      if (line == null) {
        const avg = games.length > 0 ? games.reduce((s, g) => s + g.total, 0) / games.length : 0;
        return `${avg.toFixed(2)} avg`;
      }
      const over = games.filter((g) => g.total > line).length;
      const under = games.filter((g) => g.total < line).length;
      const push = games.length - over - under;
      return `${over}-${under}${push > 0 ? `-${push}` : ""} O/U`;
    }
    if (line == null) return `${games.filter((g) => g.won).length}-${games.filter((g) => !g.won).length}`;
    const cover = games.filter((g) => g.margin > -line).length;
    const notCover = games.filter((g) => g.margin < -line).length;
    const push = games.length - cover - notCover;
    return `${cover}-${notCover}${push > 0 ? `-${push}` : ""} ATS`;
  }

  return {
    type: "table",
    title: `${team.teamName} — ${marketType === "moneyline" ? "SU" : marketType === "total" ? "O/U" : "ATS"} track record`,
    relevance: `How ${team.teamName} has done on this ${marketType} bet type across both seasons.`,
    data: [
      { season: team.lastSeason.slice(2, 4) + "-" + team.lastSeason.slice(6), record: summarize(last), gp: last.length },
      { season: team.currentSeason.slice(2, 4) + "-" + team.currentSeason.slice(6) + " YTD", record: summarize(current), gp: current.length },
    ],
    columns: [
      { key: "season", label: "Season" },
      { key: "record", label: "Record" },
      { key: "gp", label: "GP" },
    ],
  };
}

export function buildNHLHomeAwaySplits(
  team: NHLTeamTwoSeason,
  line?: number,
  venueHint?: "home" | "away",
): ChartConfig | null {
  const currentGames = team.games.filter((g) => g.season === team.currentSeason);
  const home = currentGames.filter((g) => g.home);
  const away = currentGames.filter((g) => !g.home);

  const avg = (arr: NHLTeamGame[], fn: (g: NHLTeamGame) => number) =>
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
      { stat: "Avg Goals For", Value: `${avg(vGames, (g) => g.teamScore)}` },
      { stat: "Avg Goals Against", Value: `${avg(vGames, (g) => g.opponentScore)}` },
      { stat: "Avg Total", Value: `${avg(vGames, (g) => g.total)}` },
    ];

    if (line != null) {
      const covers = vGames.filter((g) => g.margin + line > 0).length;
      data.push({ stat: "Puckline Cover Rate", Value: `${Math.round((covers / vGames.length) * 100)}%` });
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
    { stat: "Avg Goals For", Home: `${avg(home, (g) => g.teamScore)}`, Away: `${avg(away, (g) => g.teamScore)}` },
    { stat: "Avg Goals Against", Home: `${avg(home, (g) => g.opponentScore)}`, Away: `${avg(away, (g) => g.opponentScore)}` },
    { stat: "Avg Total", Home: `${avg(home, (g) => g.total)}`, Away: `${avg(away, (g) => g.total)}` },
  ];

  if (line != null) {
    const homeCovers = home.filter((g) => g.margin + line > 0).length;
    const awayCovers = away.filter((g) => g.margin + line > 0).length;
    data.push({ stat: "Puckline Cover Rate", Home: `${Math.round((homeCovers / home.length) * 100)}%`, Away: `${Math.round((awayCovers / away.length) * 100)}%` });
  }

  const seasonLabel = team.currentSeason.length >= 8
    ? `${team.currentSeason.slice(2, 4)}-${team.currentSeason.slice(6, 8)}`
    : team.currentSeason;

  return {
    type: "table",
    title: `${team.teamName} — Home vs Away (${seasonLabel})`,
    relevance: `Home ${homeWins}-${home.length - homeWins} (${Math.round((homeWins / home.length) * 100)}%), Away ${awayWins}-${away.length - awayWins} (${Math.round((awayWins / away.length) * 100)}%)`,
    data,
    columns: [
      { key: "stat", label: "" },
      { key: "Home", label: `Home (${home.length}g)` },
      { key: "Away", label: `Away (${away.length}g)` },
    ],
  };
}

export function buildNHLTeamH2HTable(
  team: NHLTeamTwoSeason,
  opponentName: string,
): ChartConfig | null {
  const lower = opponentName.toLowerCase();
  const h2h = team.games.filter(
    (g) => g.opponent.toLowerCase().includes(lower) || g.opponentAbbrev.toLowerCase() === lower,
  );
  if (h2h.length === 0) return null;

  return {
    type: "table",
    title: `${team.teamName} vs ${opponentName} — head-to-head`,
    relevance: `Direct matchups across both seasons.`,
    data: h2h.map((g) => ({
      date: shortDate(g.date),
      season: g.seasonLabel,
      site: g.home ? "Home" : "Away",
      result: g.won ? "W" : "L",
      score: `${g.teamScore}-${g.opponentScore}`,
      total: g.total,
    })),
    columns: [
      { key: "date", label: "Date" },
      { key: "season", label: "Season" },
      { key: "site", label: "Site" },
      { key: "result", label: "Result" },
      { key: "score", label: "Score" },
      { key: "total", label: "Total" },
    ],
  };
}

// ── Player prop history ────────────────────────────────────────────

export type NHLPlayerStatKey = "goals" | "assists" | "points" | "shots";

function getStat(g: NHLPlayerGame, stat: NHLPlayerStatKey): number {
  return g[stat] ?? 0;
}

export function buildNHLPlayerHistoryChart(
  player: NHLPlayerTwoSeason,
  stat: NHLPlayerStatKey,
  line: number | undefined,
): ChartConfig | null {
  if (player.games.length === 0) return null;
  const rows: Record<string, unknown>[] = [];
  for (const g of player.games) {
    const isCurrent = g.season === player.currentSeason;
    rows.push({
      date: shortDate(g.date),
      opponent: g.opponent,
      [isCurrent ? "currentSeason" : "lastSeason"]: getStat(g, stat),
      ...(line != null ? { line } : {}),
    });
  }
  return {
    type: "line",
    title: `${player.playerName} — ${stat}`,
    relevance: `Game-by-game ${stat} across both seasons${line != null ? ` vs the ${line} line` : ""}.`,
    data: rows,
    xKey: "date",
    yKeys: ["lastSeason", "currentSeason", ...(line != null ? ["line"] : [])],
  };
}

export function buildNHLPlayerHitRateTable(
  player: NHLPlayerTwoSeason,
  stat: NHLPlayerStatKey,
  line: number,
): ChartConfig | null {
  if (player.games.length === 0) return null;
  const { last, current } = splitBySeason(player.games, player.lastSeason, player.currentSeason);
  function rate(arr: NHLPlayerGame[]) {
    if (arr.length === 0) return { rec: "—", pct: "—" };
    const hits = arr.filter((g) => getStat(g, stat) > line).length;
    return { rec: `${hits}/${arr.length}`, pct: `${((hits / arr.length) * 100).toFixed(0)}%` };
  }
  const l = rate(last);
  const c = rate(current);
  return {
    type: "table",
    title: `${player.playerName} — over ${line} ${stat} hit rate`,
    relevance: `How often ${player.playerName} has gone over ${line} ${stat} across both seasons.`,
    data: [
      { season: player.lastSeason.slice(2, 4) + "-" + player.lastSeason.slice(6), record: l.rec, pct: l.pct },
      { season: player.currentSeason.slice(2, 4) + "-" + player.currentSeason.slice(6) + " YTD", record: c.rec, pct: c.pct },
    ],
    columns: [
      { key: "season", label: "Season" },
      { key: "record", label: "Over" },
      { key: "pct", label: "Rate" },
    ],
  };
}

export function buildNHLPlayerVsOpponentTable(
  player: NHLPlayerTwoSeason,
  stat: NHLPlayerStatKey,
  line: number | undefined,
  opponentName: string,
): ChartConfig | null {
  const lower = opponentName.toLowerCase();
  const matches = player.games.filter((g) => g.opponent.toLowerCase().includes(lower));
  if (matches.length === 0) return null;
  return {
    type: "table",
    title: `${player.playerName} vs ${opponentName} — ${stat} history`,
    relevance: `Every game ${player.playerName} has played against ${opponentName}.`,
    data: matches.map((g) => ({
      date: shortDate(g.date),
      site: g.home ? "Home" : "Away",
      value: getStat(g, stat),
      ...(line != null ? { hit: getStat(g, stat) > line ? "✓" : "✗" } : {}),
    })),
    columns: [
      { key: "date", label: "Date" },
      { key: "site", label: "Site" },
      { key: "value", label: stat },
      ...(line != null ? [{ key: "hit", label: `> ${line}` }] : []),
    ],
  };
}

// ── Futures (division / conference / title) ──────────────────────

export function buildNHLFuturesChart(
  teamName: string,
  snapshots: NHLStandingsSnapshot[],
): ChartConfig | null {
  if (snapshots.length === 0) return null;
  const rows: Record<string, unknown>[] = [];
  const lower = teamName.toLowerCase();
  for (const snap of snapshots) {
    const me = snap.rows.find((r) => r.team.toLowerCase().includes(lower));
    if (!me) continue;
    const divPeers = snap.rows.filter((r) => r.division === me.division);
    const divRank = divPeers
      .sort((a, b) => b.points - a.points)
      .findIndex((r) => r.team === me.team) + 1;
    const confPeers = snap.rows.filter((r) => r.conference === me.conference);
    const confRank = confPeers
      .sort((a, b) => b.points - a.points)
      .findIndex((r) => r.team === me.team) + 1;
    rows.push({
      date: snap.dateLabel,
      record: `${me.wins}-${me.losses}-${me.otLosses}`,
      points: me.points,
      divisionRank: divRank || "—",
      conferenceRank: confRank || "—",
    });
  }
  if (rows.length === 0) return null;
  return {
    type: "table",
    title: `${teamName} — futures track record`,
    relevance: `How ${teamName} has finished in their division and conference across recent seasons.`,
    data: rows,
    columns: [
      { key: "date", label: "Snapshot" },
      { key: "record", label: "Record" },
      { key: "points", label: "Pts" },
      { key: "divisionRank", label: "Div Rank" },
      { key: "conferenceRank", label: "Conf Rank" },
    ],
  };
}

// ── First period ──────────────────────────────────────────────────

export function buildNHLFirstPeriodChart(
  team: NHLTeamTwoSeason,
  line: number | undefined,
): ChartConfig | null {
  const games = team.games.filter((g) => g.p1Team != null && g.p1Opp != null);
  if (games.length === 0) return null;
  const rows = games.map((g) => {
    const isCurrent = g.season === team.currentSeason;
    const combined = (g.p1Team || 0) + (g.p1Opp || 0);
    return {
      date: shortDate(g.date),
      opponent: g.opponent,
      [isCurrent ? "currentSeasonP1" : "lastSeasonP1"]: combined,
      ...(line != null ? { line } : {}),
    };
  });
  return {
    type: "line",
    title: `${team.teamName} — first-period goals (combined)`,
    relevance: `Total first-period goals scored in ${team.teamName}'s games across both seasons${line != null ? ` vs the ${line} line` : ""}.`,
    data: rows,
    xKey: "date",
    yKeys: ["lastSeasonP1", "currentSeasonP1", ...(line != null ? ["line"] : [])],
  };
}

export function buildNHLFirstPeriodHitRate(
  team: NHLTeamTwoSeason,
  line: number,
): ChartConfig | null {
  const games = team.games.filter((g) => g.p1Team != null && g.p1Opp != null);
  if (games.length === 0) return null;
  const { last, current } = splitBySeason(games, team.lastSeason, team.currentSeason);
  function rate(arr: NHLTeamGame[]) {
    if (arr.length === 0) return { rec: "—", pct: "—" };
    const hits = arr.filter((g) => (g.p1Team || 0) + (g.p1Opp || 0) > line).length;
    return { rec: `${hits}/${arr.length}`, pct: `${((hits / arr.length) * 100).toFixed(0)}%` };
  }
  const l = rate(last);
  const c = rate(current);
  return {
    type: "table",
    title: `${team.teamName} — over ${line} 1st period goals hit rate`,
    relevance: `How often ${team.teamName}'s games have gone over ${line} combined first-period goals.`,
    data: [
      { season: team.lastSeason.slice(2, 4) + "-" + team.lastSeason.slice(6), record: l.rec, pct: l.pct },
      { season: team.currentSeason.slice(2, 4) + "-" + team.currentSeason.slice(6) + " YTD", record: c.rec, pct: c.pct },
    ],
    columns: [
      { key: "season", label: "Season" },
      { key: "record", label: "Over" },
      { key: "pct", label: "Rate" },
    ],
  };
}

// ── Dispatcher ────────────────────────────────────────────────────

export interface NHLHistoryContext {
  teams: Record<string, NHLTeamTwoSeason>;
  players: Record<string, NHLPlayerTwoSeason>;
  standings: NHLStandingsSnapshot[];
}

function detectPlayerStat(market: string, description: string): NHLPlayerStatKey | null {
  const m = `${market} ${description}`.toLowerCase();
  if (m.includes("shots on goal") || m.includes("sog")) return "shots";
  if (m.includes("shot")) return "shots";
  if (m.includes("assist")) return "assists";
  if (m.includes("point")) return "points";
  if (m.includes("goal")) return "goals";
  return null;
}

function isFirstPeriodBet(market: string, description: string): boolean {
  const m = `${market} ${description}`.toLowerCase();
  return (
    m.includes("1st period") ||
    m.includes("first period") ||
    m.includes("1p") ||
    m.includes("p1 ") ||
    m.includes("period 1")
  );
}

function isFuturesBet(market: string, description: string, betType: string): boolean {
  const m = `${market} ${description}`.toLowerCase();
  return (
    betType === "futures" ||
    m.includes("division") ||
    m.includes("conference") ||
    m.includes("stanley cup") ||
    m.includes("champion") ||
    m.includes("presidents")
  );
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

export function buildNHLDefaultCharts(
  betType: string,
  market: string | undefined,
  description: string | undefined,
  teams: string[],
  players: string[],
  line: number | undefined,
  history: NHLHistoryContext,
  homeTeam?: string,
  awayTeam?: string,
): ChartConfig[] {
  const out: ChartConfig[] = [];
  const marketStr = market || "";
  const descStr = description || "";

  // First period bets
  if (isFirstPeriodBet(marketStr, descStr)) {
    for (const teamName of teams) {
      const team = history.teams[teamName];
      if (!team) continue;
      const chart = buildNHLFirstPeriodChart(team, line);
      if (chart) out.push(chart);
      if (line != null) {
        const rate = buildNHLFirstPeriodHitRate(team, line);
        if (rate) out.push(rate);
      }
    }
    if (out.length > 0) return out;
  }

  // Futures
  if (isFuturesBet(marketStr, descStr, betType)) {
    for (const teamName of teams) {
      const chart = buildNHLFuturesChart(teamName, history.standings);
      if (chart) out.push(chart);
      const record = getChampionshipHistory(teamName, "NHL");
      if (record) {
        const titleYears = record.title;
        const confYears = record.league;
        const divYears = record.division;
        const data: Record<string, string>[] = [];
        if (titleYears.length > 0) data.push({ stat: "Stanley Cup", Value: `${titleYears.length}x — last: ${titleYears[0]}`, Years: titleYears.slice(0, 6).join(", ") + (titleYears.length > 6 ? "..." : "") });
        else data.push({ stat: "Stanley Cup", Value: "Never", Years: "—" });
        if (confYears.length > 0) data.push({ stat: "Conference Finals", Value: `${confYears.length}x — last: ${confYears[0]}`, Years: confYears.slice(0, 6).join(", ") + (confYears.length > 6 ? "..." : "") });
        else data.push({ stat: "Conference Finals", Value: "Never", Years: "—" });
        if (divYears.length > 0) data.push({ stat: "Division Titles", Value: `${divYears.length}x — last: ${divYears[0]}`, Years: divYears.slice(0, 6).join(", ") + (divYears.length > 6 ? "..." : "") });
        else data.push({ stat: "Division Titles", Value: "Never", Years: "—" });
        out.push({
          type: "table",
          title: `${teamName} — Championship History`,
          relevance: formatChampionshipSummary(teamName, record, "title"),
          data,
          columns: [{ key: "stat", label: "" }, { key: "Value", label: "Record" }, { key: "Years", label: "Recent Years" }],
        });
      }
    }
    if (out.length > 0) return out;
  }

  // Player props
  if (betType === "player_prop") {
    const stat = detectPlayerStat(marketStr, descStr) || "points";
    for (const playerName of players) {
      const p = history.players[playerName];
      if (!p) continue;
      const hist = buildNHLPlayerHistoryChart(p, stat, line);
      if (hist) out.push(hist);
      if (line != null) {
        const hr = buildNHLPlayerHitRateTable(p, stat, line);
        if (hr) out.push(hr);
      }
      const opp = teams[0];
      if (opp) {
        const vs = buildNHLPlayerVsOpponentTable(p, stat, line, opp);
        if (vs) out.push(vs);
      }
    }
    return out;
  }

  // Team-level bets
  const marketType: "spread" | "moneyline" | "total" | null =
    betType === "spread" ? "spread" : betType === "moneyline" ? "moneyline" : betType === "over_under" ? "total" : null;
  if (!marketType) return out;

  for (const teamName of teams) {
    const team = history.teams[teamName];
    if (!team) continue;
    const chart = buildNHLTeamHistoryChart(team, marketType, line);
    if (chart) out.push(chart);
    const rec = buildNHLTeamBetTypeTable(team, marketType, line);
    if (rec) out.push(rec);
  }

  // Venue splits — combined when both venues known
  if (teams.length === 2 && homeTeam && awayTeam) {
    const awayName = teams.find((t) => getVenueHint(t, homeTeam, awayTeam) === "away");
    const homeName = teams.find((t) => getVenueHint(t, homeTeam, awayTeam) === "home");
    const awayTeamData = awayName ? history.teams[awayName] : undefined;
    const homeTeamData = homeName ? history.teams[homeName] : undefined;
    if (awayTeamData && homeTeamData) {
      const awayGames = awayTeamData.games.filter((g) => g.season === awayTeamData.currentSeason && !g.home);
      const homeGames = homeTeamData.games.filter((g) => g.season === homeTeamData.currentSeason && g.home);
      if (awayGames.length >= 2 && homeGames.length >= 2) {
        const avg = (arr: NHLTeamGame[], fn: (g: NHLTeamGame) => number) =>
          arr.length > 0 ? Math.round((arr.reduce((s, g) => s + fn(g), 0) / arr.length) * 10) / 10 : 0;
        const awayWins = awayGames.filter((g) => g.won).length;
        const homeWins = homeGames.filter((g) => g.won).length;
        const awayCol = `${awayTeamData.teamAbbrev} (Road)`;
        const homeCol = `${homeTeamData.teamAbbrev} (Home)`;
        const data: Record<string, string>[] = [
          { stat: "Record", [awayCol]: `${awayWins}-${awayGames.length - awayWins}`, [homeCol]: `${homeWins}-${homeGames.length - homeWins}` },
          { stat: "Win %", [awayCol]: `${Math.round((awayWins / awayGames.length) * 100)}%`, [homeCol]: `${Math.round((homeWins / homeGames.length) * 100)}%` },
          { stat: "Avg Goals For", [awayCol]: `${avg(awayGames, (g) => g.teamScore)}`, [homeCol]: `${avg(homeGames, (g) => g.teamScore)}` },
          { stat: "Avg Goals Against", [awayCol]: `${avg(awayGames, (g) => g.opponentScore)}`, [homeCol]: `${avg(homeGames, (g) => g.opponentScore)}` },
          { stat: "Avg Total", [awayCol]: `${avg(awayGames, (g) => g.total)}`, [homeCol]: `${avg(homeGames, (g) => g.total)}` },
          { stat: "Games", [awayCol]: `${awayGames.length}`, [homeCol]: `${homeGames.length}` },
        ];
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
    for (const teamName of teams) {
      const team = history.teams[teamName];
      if (!team) continue;
      const splits = buildNHLHomeAwaySplits(team, line);
      if (splits) out.push(splits);
    }
  }

  // H2H
  if (teams.length >= 2) {
    const team = history.teams[teams[0]];
    if (team) {
      const h2h = buildNHLTeamH2HTable(team, teams[1]);
      if (h2h) out.push(h2h);
    }
  }

  return out;
}
