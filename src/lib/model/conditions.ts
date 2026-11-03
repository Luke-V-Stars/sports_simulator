// Game conditions that move a team's expected score before anyone plays:
// rest (NBA back-to-backs, NFL short weeks and byes) and weather.
//
// The sizes below are rough figures in line with what public analyses of
// past games tend to find. They're estimates, kept small on purpose, and each
// one is a single number here that's easy to change.

import type { LeagueId } from "../leagues";
import type { Adjustment, SideInput } from "../sim/types";
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

// ---------- Matchups ----------

// Only 8-10 games per defense, so its tendencies are pulled halfway to
// typical and capped (about ±15%; keeping NFL total yards can stretch it a bit).
const MATCHUP_WEIGHT = 0.5;
const MATCHUP_CAP = 0.15;

// Team stats a defense can push up or down. (NBA points come from the score.)
const MATCHUP_KEYS: Record<LeagueId, string[]> = {
  nfl: ["passYds", "rushYds", "int"],
  nba: ["reb", "ast", "fg3", "stl", "blk"],
};

// Multipliers on the attacking team's totals from what this defense usually
// allows, e.g. { passYds: 1.06, rushYds: 0.95 }. "Typical" is the average of
// what both teams make and allow, a stand-in for the league average.
//
// NFL yards already rise and fall with the expected score (which already
// counts the defense), so only the pass/run mix moves: total yards stay the
// same. Receptions follow passing.
export function matchupFactors(league: LeagueId, attack: SideInput, defense: SideInput): Record<string, number> {
  const factors: Record<string, number> = {};
  for (const key of MATCHUP_KEYS[league]) {
    const values = [attack.teamAvg[key], attack.allowedAvg[key], defense.teamAvg[key], defense.allowedAvg[key]];
    if (values.some((v) => v === undefined)) continue;
    const typical = values.reduce((a, b) => a + b, 0) / values.length;
    if (typical <= 0) continue;
    const lean = MATCHUP_WEIGHT * (defense.allowedAvg[key] / typical - 1);
    factors[key] = 1 + Math.max(-MATCHUP_CAP, Math.min(MATCHUP_CAP, lean));
  }
  if (league === "nfl" && factors.passYds && factors.rushYds) {
    const pass = attack.teamAvg.passYds;
    const rush = attack.teamAvg.rushYds;
    const keepTotal = (pass + rush) / (pass * factors.passYds + rush * factors.rushYds);
    factors.passYds *= keepTotal;
    factors.rushYds *= keepTotal;
    factors.rec = factors.passYds;
  }
  return factors;
}

// Short labels for the game page: "Passing +6%".
export function matchupLabels(league: LeagueId, factors: Record<string, number>): string[] {
  const names: Record<string, string> = {
    passYds: "Passing",
    rushYds: "Rushing",
    int: "Interceptions",
    reb: "Rebounds",
    ast: "Assists",
    fg3: "Threes",
    stl: "Steals",
    blk: "Blocks",
  };
  return MATCHUP_KEYS[league]
    .filter((key) => factors[key] !== undefined && Math.abs(factors[key] - 1) >= 0.03)
    .map((key) => `${names[key]} ${factors[key] > 1 ? "+" : "−"}${Math.round(Math.abs(factors[key] - 1) * 100)}%`);
}
