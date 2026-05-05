/**
 * Game-time weather for MLB stadiums via Open-Meteo (free, no auth, no
 * rate limit on hobby use). Returns wind, temp, humidity, precip
 * probability for the closest hour to first pitch.
 *
 * Wind is converted into fielding-relative direction (out to CF / in
 * from CF / L to R / R to L) using the stadium's CF bearing.
 *
 * Cached via cachedFetch (1-hour TTL — weather forecast is volatile).
 */

import { cachedFetch, TTL } from "./fetch";
import { getParkCoords, classifyWind, type ParkCoords } from "./mlb-park-coords";

export interface GameWeather {
  parkName: string;
  roof: ParkCoords["roof"];
  /** First-pitch (or evaluation) hour, ISO local. */
  hourLocal: string;
  /** Temperature in Fahrenheit. */
  tempF: number;
  /** Wind speed in mph. */
  windMph: number;
  /** Compass bearing wind is blowing TO (0-359). */
  windToBearing: number;
  /** Fielding-relative wind: "out to CF", "in from CF", "L to R", "R to L". */
  windDir: string;
  /** Relative humidity 0-100. */
  humidity: number;
  /** Precipitation probability 0-100. */
  precipProb: number;
  /** "Outdoor" / "indoor" heuristic — closed roofs and retractables-when-rainy effectively neutralize weather. */
  effectivelyIndoor: boolean;
}

interface OpenMeteoResponse {
  hourly?: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    precipitation_probability: number[];
    windspeed_10m: number[];
    winddirection_10m: number[];
  };
}

/**
 * Pull the forecast for the home park and pick the hour closest to the
 * provided game time (or the next 6pm-9pm window if game time unknown).
 *
 * @param homeTeam Team name (e.g. "New York Yankees") or abbreviation
 * @param gameTimeIso Optional ISO 8601 game start time. If omitted, picks
 *                    the next evening hour (default 7pm local park time).
 */
export async function getGameWeather(
  homeTeam: string,
  gameTimeIso?: string,
): Promise<GameWeather | null> {
  const park = getParkCoords(homeTeam);
  if (!park) return null;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${park.lat}&longitude=${park.lon}` +
    `&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,windspeed_10m,winddirection_10m` +
    `&temperature_unit=fahrenheit` +
    `&windspeed_unit=mph` +
    `&forecast_days=2` +
    `&timezone=auto`;

  const data = await cachedFetch<OpenMeteoResponse>(url, TTL.MEDIUM /* 1h */);
  if (!data?.hourly) return null;

  const times = data.hourly.time || [];
  if (times.length === 0) return null;

  // Pick the hour closest to game time (or to "tonight 7pm")
  const target = gameTimeIso ? new Date(gameTimeIso).getTime() : pickNextEvening(times[0]);
  let bestIdx = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const ts = new Date(times[i]).getTime();
    const d = Math.abs(ts - target);
    if (d < bestDelta) { bestDelta = d; bestIdx = i; }
  }

  const tempF = round1(data.hourly.temperature_2m[bestIdx]);
  const humidity = Math.round(data.hourly.relative_humidity_2m[bestIdx] || 0);
  const precipProb = Math.round(data.hourly.precipitation_probability[bestIdx] || 0);
  const windMph = round1(data.hourly.windspeed_10m[bestIdx] || 0);
  // Open-Meteo `winddirection_10m` is the direction wind is COMING FROM.
  // We want direction it's blowing TO (relative to fielding), so add 180.
  const windFromBearing = data.hourly.winddirection_10m[bestIdx] || 0;
  const windToBearing = (windFromBearing + 180) % 360;
  const windDir = classifyWind(windToBearing, park.bearingCF);

  // Closed-roof or retractable+rain treats park as effectively indoor for HR purposes.
  const effectivelyIndoor =
    park.roof === "closed" ||
    (park.roof === "retractable" && precipProb >= 50);

  return {
    parkName: park.parkName,
    roof: park.roof,
    hourLocal: times[bestIdx],
    tempF,
    windMph,
    windToBearing,
    windDir,
    humidity,
    precipProb,
    effectivelyIndoor,
  };
}

function pickNextEvening(firstIso: string): number {
  // Default to next 7 PM in the park's local timezone (which Open-Meteo
  // returns aligned to since we set timezone=auto).
  const first = new Date(firstIso);
  const candidate = new Date(first);
  candidate.setHours(19, 0, 0, 0);
  if (candidate.getTime() < Date.now()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
