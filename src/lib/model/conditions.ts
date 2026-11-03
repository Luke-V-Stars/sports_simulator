// Game conditions that move a team's expected score before anyone plays:
// rest (NBA back-to-backs, NFL short weeks and byes) and weather.
//
// The sizes below are rough figures in line with what public analyses of
// past games tend to find. They're estimates, kept small on purpose, and each
// one is a single number here that's easy to change.

import type { LeagueId } from "../leagues";
import type { Adjustment } from "../sim/types";
import type { Game } from "../types";
import type { GameWeather } from "../weather";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// Effect on the final margin; half comes off the tired team's own score and
// half goes to the opponent (tired legs on defense too).
const NBA_BACK_TO_BACK = -2;
const NFL_SHORT_WEEK = -1; // 5 or fewer days since the last game
const NFL_EXTRA_REST = 1; // 12+ days, usually a bye week

// Per team: every mph of wind past 10 costs this much (kicking and deep
// passes suffer), up to the cap. Heavy rain or snow and real cold cost a bit.
const WIND_POINTS_PER_MPH = -0.15;
const WIND_CAP = -3;
const WET_POINTS = -0.75; // 1+ mm of rain or snow per hour
const COLD_POINTS = -0.5; // below 25°F

export interface SideAdjustments {
  home: Adjustment[];
  away: Adjustment[];
}

// Rest: compares each team's time since its last game. `schedule` is the
// season's games, played or not (only those before this one are used).
export function restAdjustments(league: LeagueId, game: Game, schedule: Game[]): SideAdjustments {
  const result: SideAdjustments = { home: [], away: [] };
  const kickoff = Date.parse(game.date);
  for (const [side, other] of [
    ["home", "away"],
    ["away", "home"],
  ] as const) {
    const teamId = game[side].team.id;
    const last = schedule
      .filter((g) => g.home.team.id === teamId || g.away.team.id === teamId)
      .map((g) => Date.parse(g.date))
      .filter((t) => t < kickoff)
      .reduce((a, b) => Math.max(a, b), -Infinity);
    const rest = restFor(league, kickoff - last);
    if (!rest) continue;
    const abbr = game[side].team.abbr;
    result[side].push({ label: rest.label, points: rest.margin / 2 });
    result[other].push({ label: `${abbr}: ${rest.label.toLowerCase()}`, points: -rest.margin / 2 });
  }
  return result;
}

function restFor(league: LeagueId, sinceLast: number): { label: string; margin: number } | undefined {
  if (!Number.isFinite(sinceLast) || sinceLast > 30 * DAY_MS) return undefined; // season opener
  if (league === "nba") {
    return sinceLast < 36 * HOUR_MS ? { label: "Back-to-back (2nd night)", margin: NBA_BACK_TO_BACK } : undefined;
  }
  const days = Math.round(sinceLast / DAY_MS);
  if (days <= 5) return { label: `Short week (${days} days' rest)`, margin: NFL_SHORT_WEEK };
  if (days >= 12) return { label: `Extra rest (${days} days)`, margin: NFL_EXTRA_REST };
  return undefined;
}

// Weather costs both teams the same.
export function weatherAdjustments(weather: GameWeather | undefined): Adjustment[] {
  if (!weather) return [];
  const result: Adjustment[] = [];
  const wind = Math.max(WIND_CAP, WIND_POINTS_PER_MPH * Math.max(0, weather.windMph - 10));
  if (wind < 0) result.push({ label: `Wind (${Math.round(weather.windMph)} mph)`, points: wind });
  if (weather.precipMm >= 1) result.push({ label: "Rain or snow", points: WET_POINTS });
  if (weather.tempF < 25) result.push({ label: `Cold (${Math.round(weather.tempF)}°F)`, points: COLD_POINTS });
  return result;
}
