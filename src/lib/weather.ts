// Weather at outdoor NFL stadiums, from Open-Meteo (free, no account or key).
// It covers forecasts up to about two weeks ahead and the past ~3 months, so
// both upcoming games and this season's finished ones get weather.

import { cacheLife } from "next/cache";

// Outdoor stadium cities (matching Game.venueLocation) -> latitude, longitude.
// Domes and covered stadiums are left out on purpose: no weather there.
// A city missing from this list (say, a new international game) simply gets
// no weather adjustment.
const OUTDOOR_STADIUMS: Record<string, [number, number]> = {
  "Baltimore|MD": [39.278, -76.623],
  "Charlotte|NC": [35.226, -80.853],
  "Chicago|IL": [41.862, -87.617],
  "Cincinnati|OH": [39.095, -84.516],
  "Cleveland|OH": [41.506, -81.7],
  "Denver|CO": [39.744, -105.02],
  "East Rutherford|NJ": [40.814, -74.074],
  "Foxborough|MA": [42.091, -71.264],
  "Green Bay|WI": [44.501, -88.062],
  "Jacksonville|FL": [30.324, -81.637],
  "Kansas City|MO": [39.049, -94.484],
  "Landover|MD": [38.908, -76.864],
  "Miami Gardens|FL": [25.958, -80.239],
  "Nashville|TN": [36.166, -86.771],
  "Orchard Park|NY": [42.774, -78.787],
  "Philadelphia|PA": [39.901, -75.168],
  "Pittsburgh|PA": [40.447, -80.016],
  "Santa Clara|CA": [37.403, -121.97],
  "Seattle|WA": [47.595, -122.332],
  "Tampa|FL": [27.976, -82.503],
  // International games
  "Berlin|Germany": [52.515, 13.239],
  "Dublin|Ireland": [53.361, -6.251],
  "London|England": [51.556, -0.28],
  "Melbourne|VIC": [-37.82, 144.983],
  "Mexico City|Mexico": [19.303, -99.15],
  "Munich|Germany": [48.219, 11.625],
  "Rio De Janeiro|Brazil": [-22.912, -43.23],
  "Saint-Denis|France": [48.924, 2.36],
  "Sao Paulo|Brazil": [-23.545, -46.474],
};

export interface GameWeather {
  tempF: number; // average over the game
  windMph: number;
  precipMm: number; // rain or snow per hour
}

const GAME_HOURS = 4; // kickoff through the end of a typical game

// Average weather over the game at an outdoor stadium, or undefined for a
// dome, an unknown stadium, or a date the service can't cover.
export async function getGameWeather(venueLocation: string | undefined, kickoff: string): Promise<GameWeather | undefined> {
  const coords = venueLocation ? OUTDOOR_STADIUMS[venueLocation] : undefined;
  if (!coords) return undefined;
  const start = new Date(kickoff);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date(start.getTime() + GAME_HOURS * 3_600_000);
  const hourly = await getHourly(coords[0], coords[1], day(start), day(end)).catch(() => undefined);
  if (!hourly) return undefined;

  // Hours are in UTC, written like "2026-11-15T18:00".
  const from = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), start.getUTCHours());
  const hours = hourly.time
    .map((t, i) => ({ t: Date.parse(`${t}:00Z`), i }))
    .filter(({ t }) => t >= from && t < from + GAME_HOURS * 3_600_000)
    .map(({ i }) => i);
  const avg = (values: (number | null)[]) => {
    const known = hours.map((i) => values[i]).filter((v): v is number => v !== null);
    return known.length ? known.reduce((a, b) => a + b, 0) / known.length : undefined;
  };
  const tempF = avg(hourly.temperature_2m);
  const windMph = avg(hourly.wind_speed_10m);
  const precipMm = avg(hourly.precipitation);
  if (tempF === undefined || windMph === undefined) return undefined;
  return { tempF, windMph, precipMm: precipMm ?? 0 };
}

interface Hourly {
  time: string[];
  temperature_2m: (number | null)[];
  wind_speed_10m: (number | null)[];
  precipitation: (number | null)[];
}

async function getHourly(lat: number, lon: number, startDay: string, endDay: string): Promise<Hourly> {
  "use cache";
  cacheLife("hours"); // forecasts change; past days don't, but this is cheap
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,wind_speed_10m,precipitation&temperature_unit=fahrenheit&wind_speed_unit=mph` +
    `&timezone=GMT&start_date=${startDay}&end_date=${endDay}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather request failed (${res.status}): ${url}`);
  const data = (await res.json()) as { hourly?: Hourly };
  if (!data.hourly) throw new Error(`Weather response had no hourly data: ${url}`);
  return data.hourly;
}
