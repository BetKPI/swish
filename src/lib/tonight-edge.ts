/**
 * Tonight's MLB edge — pulls today's schedule and computes the most
 * notable signals per game so the /tonight page renders SEO-friendly
 * content that's indexable by Google.
 *
 * Uses only public free APIs we already integrate against.
 */

import { cachedFetch, TTL } from "./fetch";
import { getPitcherArsenal, type PitcherArsenal } from "./mlb-pitch-arsenal";
import { getPitcherPlatoonSplits, type PitcherPlatoonSplits } from "./mlb-history";
import { getGameWeather, type GameWeather } from "./mlb-weather";
import { getParkFactors } from "./mlb-park-factors";

export interface TonightGame {
  gamePk: number;
  date: string;
  gameTimeIso: string;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  homeStarter?: TonightStarter;
  awayStarter?: TonightStarter;
  weather?: GameWeather | null;
  parkHrFactor?: number;
}

export interface TonightStarter {
  id: number;
  name: string;
  pitchHand?: "L" | "R";
  era?: number;
  kPer9?: number;
  arsenal?: PitcherArsenal | null;
  splits?: PitcherPlatoonSplits | null;
}

interface MlbScheduleResponse {
  dates?: Array<{
    date?: string;
    games?: Array<{
      gamePk?: number;
      gameDate?: string;
      teams?: {
        home?: { team?: { id?: number; name?: string }; probablePitcher?: { id?: number; fullName?: string } };
        away?: { team?: { id?: number; name?: string }; probablePitcher?: { id?: number; fullName?: string } };
      };
    }>;
  }>;
}

interface PitcherStatsResponse {
  people?: Array<{
    pitchHand?: { code?: string };
    stats?: Array<{
      splits?: Array<{ stat?: { era?: string; strikeoutsPer9Inn?: string } }>;
    }>;
  }>;
}

async function fetchPitcherSummary(pitcherId: number): Promise<{ pitchHand?: "L" | "R"; era?: number; kPer9?: number }> {
  const year = new Date().getFullYear();
  const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}?hydrate=stats(group=[pitching],type=season,season=${year})`;
  const data = await cachedFetch<PitcherStatsResponse>(url, TTL.LONG);
  const p = data?.people?.[0];
  if (!p) return {};
  const pitchHand = p.pitchHand?.code === "L" || p.pitchHand?.code === "R" ? p.pitchHand.code as "L" | "R" : undefined;
  const stat = p.stats?.[0]?.splits?.[0]?.stat;
  const era = stat?.era ? Number(stat.era) : undefined;
  const kPer9 = stat?.strikeoutsPer9Inn ? Number(stat.strikeoutsPer9Inn) : undefined;
  return { pitchHand, era, kPer9 };
}

/**
 * Pull tonight's MLB games. If `date` omitted, defaults to today in the
 * caller's timezone (server-time). Cached 1h via cachedFetch.
 */
export async function getTonightMLB(dateOverride?: string, options?: { lite?: boolean }): Promise<TonightGame[]> {
  const date = dateOverride || new Date().toISOString().slice(0, 10);
  const lite = options?.lite ?? false;
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher`;
  const data = await cachedFetch<MlbScheduleResponse>(url, TTL.MEDIUM);
  const games = data?.dates?.[0]?.games || [];

  const out: TonightGame[] = [];
  for (const g of games) {
    if (!g.gamePk) continue;
    const home = g.teams?.home?.team;
    const away = g.teams?.away?.team;
    if (!home?.id || !away?.id) continue;

    const game: TonightGame = {
      gamePk: g.gamePk,
      date,
      gameTimeIso: g.gameDate || `${date}T19:00:00Z`,
      homeTeam: { id: home.id, name: home.name || "" },
      awayTeam: { id: away.id, name: away.name || "" },
    };

    const homePP = g.teams?.home?.probablePitcher;
    const awayPP = g.teams?.away?.probablePitcher;

    const homeStarterFetch = homePP?.id && homePP?.fullName
      ? (async () => {
          // Lite mode: just the summary (era / k9 / hand) - skip arsenal and
          // splits since those are heavy. Used for the /tonight SEO page so
          // it renders fast even on cold starts.
          const fetches: Promise<unknown>[] = [fetchPitcherSummary(homePP.id!)];
          if (!lite) {
            fetches.push(getPitcherArsenal(homePP.id!));
            fetches.push(getPitcherPlatoonSplits(homePP.id!));
          }
          const [summary, arsenal, splits] = await Promise.all(fetches);
          game.homeStarter = {
            id: homePP.id!,
            name: homePP.fullName!,
            ...(summary as Awaited<ReturnType<typeof fetchPitcherSummary>>),
            arsenal: (arsenal as PitcherArsenal | null | undefined) ?? null,
            splits: (splits as PitcherPlatoonSplits | null | undefined) ?? null,
          };
        })()
      : Promise.resolve();

    const awayStarterFetch = awayPP?.id && awayPP?.fullName
      ? (async () => {
          const fetches: Promise<unknown>[] = [fetchPitcherSummary(awayPP.id!)];
          if (!lite) {
            fetches.push(getPitcherArsenal(awayPP.id!));
            fetches.push(getPitcherPlatoonSplits(awayPP.id!));
          }
          const [summary, arsenal, splits] = await Promise.all(fetches);
          game.awayStarter = {
            id: awayPP.id!,
            name: awayPP.fullName!,
            ...(summary as Awaited<ReturnType<typeof fetchPitcherSummary>>),
            arsenal: (arsenal as PitcherArsenal | null | undefined) ?? null,
            splits: (splits as PitcherPlatoonSplits | null | undefined) ?? null,
          };
        })()
      : Promise.resolve();

    const weatherFetch = (async () => {
      try {
        game.weather = await getGameWeather(home.name || "", g.gameDate);
      } catch {
        game.weather = null;
      }
    })();

    await Promise.all([homeStarterFetch, awayStarterFetch, weatherFetch]);

    const pf = getParkFactors(home.name || "");
    if (pf) game.parkHrFactor = pf.hr;

    out.push(game);
  }

  // Sort by interestingness — games with a known starter who has high K/9 first
  out.sort((a, b) => {
    const aK = Math.max(a.homeStarter?.kPer9 || 0, a.awayStarter?.kPer9 || 0);
    const bK = Math.max(b.homeStarter?.kPer9 || 0, b.awayStarter?.kPer9 || 0);
    return bK - aK;
  });

  return out;
}
