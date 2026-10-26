// Team strength ratings.
//
// Idea: every final score tells us something. If the Eagles score 30 against a
// defense that usually allows 20, their offense looks about 10 points better
// than average. We repeat that over every game, adjusting for how good each
// opponent was, until the numbers settle. This is a version of the "Simple
// Rating System" that sports analysts use.
//
// Recent games count more than old ones, last season counts a little, and
// every team is gently pulled toward average so a couple of fluky games
// can't produce extreme ratings.

import { LEAGUES, type LeagueId } from "../leagues";
import type { Game, TeamRating, TeamSeasonStats } from "../types";

export interface RatingsResult {
  ratings: Record<string, TeamRating>;
  leagueAverage: number; // points an average team scores per game
  gamesUsed: number;
}

interface Observation {
  team: string; // the team that scored
  opp: string; // the team defending
  points: number;
  home: number; // +0.5 at home, -0.5 away, 0 neutral site
  weight: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function fitRatings(
  league: LeagueId,
  games: Game[],
  currentSeason: number,
  asOf: string,
): RatingsResult {
  const config = LEAGUES[league];
  const asOfMs = Date.parse(asOf);

  const obs: Observation[] = [];
  const teams = new Set<string>();
  for (const g of games) {
    if (!g.completed || g.home.score === null || g.away.score === null) continue;
    const ageDays = Math.max(0, (asOfMs - Date.parse(g.date)) / DAY_MS);
    let weight = Math.pow(0.5, ageDays / config.ratingHalfLifeDays);
    if (g.seasonYear < currentSeason) weight *= config.previousSeasonWeight;
    const home = g.neutralSite ? 0 : 0.5;
    obs.push({ team: g.home.team.id, opp: g.away.team.id, points: g.home.score, home, weight });
    obs.push({ team: g.away.team.id, opp: g.home.team.id, points: g.away.score, home: -home, weight });
    teams.add(g.home.team.id);
    teams.add(g.away.team.id);
  }

  let totalWeight = 0;
  let mu = 0;
  for (const o of obs) {
    mu += o.weight * o.points;
    totalWeight += o.weight;
  }
  mu = totalWeight > 0 ? mu / totalWeight : 0;

  // offense[t]: points t scores above average.
  // allowed[t]: points t's defense ALLOWS above average (so lower is better).
  const offense = new Map<string, number>();
  const allowed = new Map<string, number>();
  for (const t of teams) {
    offense.set(t, 0);
    allowed.set(t, 0);
  }

  const shrink = config.ratingShrinkGames;
  const hfa = config.homeAdvantage;
  for (let iter = 0; iter < 60; iter++) {
    const offNum = new Map<string, number>();
    const offDen = new Map<string, number>();
    for (const o of obs) {
      const residual = o.points - mu - o.home * hfa - allowed.get(o.opp)!;
      offNum.set(o.team, (offNum.get(o.team) ?? 0) + o.weight * residual);
      offDen.set(o.team, (offDen.get(o.team) ?? 0) + o.weight);
    }
    for (const t of teams) offense.set(t, (offNum.get(t) ?? 0) / ((offDen.get(t) ?? 0) + shrink));

    const defNum = new Map<string, number>();
    const defDen = new Map<string, number>();
    for (const o of obs) {
      const residual = o.points - mu - o.home * hfa - offense.get(o.team)!;
      defNum.set(o.opp, (defNum.get(o.opp) ?? 0) + o.weight * residual);
      defDen.set(o.opp, (defDen.get(o.opp) ?? 0) + o.weight);
    }
    for (const t of teams) allowed.set(t, (defNum.get(t) ?? 0) / ((defDen.get(t) ?? 0) + shrink));

    // Keep the average team at exactly 0 so ratings read as "vs. average".
    const meanOff = average([...offense.values()]);
    const meanAllowed = average([...allowed.values()]);
    for (const t of teams) {
      offense.set(t, offense.get(t)! - meanOff);
      allowed.set(t, allowed.get(t)! - meanAllowed);
    }
    mu += meanOff + meanAllowed;
  }

  const ratings: Record<string, TeamRating> = {};
  for (const t of teams) {
    const off = offense.get(t)!;
    const def = -allowed.get(t)!;
    ratings[t] = { teamId: t, offense: off, defense: def, net: off + def };
  }
  return { ratings, leagueAverage: mu, gamesUsed: obs.length / 2 };
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

const ZERO: TeamRating = { teamId: "", offense: 0, defense: 0, net: 0 };

// Points each team should score against the other, before injuries.
export function expectedScores(
  league: LeagueId,
  result: RatingsResult,
  homeId: string,
  awayId: string,
  neutralSite: boolean,
): { home: number; away: number } {
  const home = result.ratings[homeId] ?? ZERO;
  const away = result.ratings[awayId] ?? ZERO;
  const edge = neutralSite ? 0 : LEAGUES[league].homeAdvantage / 2;
  return {
    home: result.leagueAverage + home.offense - away.defense + edge,
    away: result.leagueAverage + away.offense - home.defense - edge,
  };
}

// Chance the home team wins, using a bell curve around the expected margin.
// (The game page runs the full simulation; this is the quick version used on
// the schedule lists.)
export function quickHomeWinChance(league: LeagueId, expectedMargin: number): number {
  return normalCdf(expectedMargin / LEAGUES[league].marginSpread);
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun approximation of the error function.
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

// Win-loss record, points per game and recent form from this season's games.
export function computeTeamStats(games: Game[], seasonYear: number): Record<string, TeamSeasonStats> {
  const stats: Record<string, TeamSeasonStats> = {};
  const get = (id: string) =>
    (stats[id] ??= {
      teamId: id,
      wins: 0,
      losses: 0,
      ties: 0,
      gamesPlayed: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      lastFive: [],
    });

  const finished = games
    .filter((g) => g.completed && g.seasonYear === seasonYear && g.home.score !== null && g.away.score !== null)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  for (const g of finished) {
    for (const [mine, theirs] of [
      [g.home, g.away],
      [g.away, g.home],
    ] as const) {
      const s = get(mine.team.id);
      const result = mine.score! > theirs.score! ? "W" : mine.score! < theirs.score! ? "L" : "T";
      if (result === "W") s.wins++;
      else if (result === "L") s.losses++;
      else s.ties++;
      s.gamesPlayed++;
      s.pointsFor += mine.score!;
      s.pointsAgainst += theirs.score!;
      if (s.lastFive.length < 5) s.lastFive.push(result);
    }
  }
  for (const s of Object.values(stats)) {
    s.pointsFor /= s.gamesPlayed;
    s.pointsAgainst /= s.gamesPlayed;
  }
  return stats;
}

export function formatRecord(s: TeamSeasonStats | undefined): string {
  if (!s) return "0-0";
  return s.ties ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`;
}
