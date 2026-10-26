// Pulls together a whole league's season so we can rate every team.

import { getCurrentSeason, getMonthGames, getTeams } from "../espn";
import { seasonMonthKeys, type LeagueId } from "../leagues";
import type { Game, Team, TeamSeasonStats } from "../types";
import {
  computeTeamStats,
  expectedScores,
  fitRatings,
  quickHomeWinChance,
  type RatingsResult,
} from "./ratings";

// Seasons types that count: 2 regular season, 3 playoffs, 5 NBA play-in.
const REAL_GAME_TYPES = new Set([2, 3, 5]);

// Every real game in a season (completed and upcoming), oldest first.
export async function getSeasonGames(league: LeagueId, seasonYear: number): Promise<Game[]> {
  const [teams, months] = await Promise.all([
    getTeams(league),
    Promise.all(seasonMonthKeys(league, seasonYear).map((m) => getMonthGames(league, m))),
  ]);
  const teamIds = new Set(teams.map((t) => t.id));
  const seen = new Set<string>();
  const games: Game[] = [];
  for (const g of months.flat()) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    if (g.seasonYear !== seasonYear || !REAL_GAME_TYPES.has(g.seasonType)) continue;
    // Skips All-Star and Pro Bowl games, whose "teams" aren't real teams.
    if (!teamIds.has(g.home.team.id) || !teamIds.has(g.away.team.id)) continue;
    games.push(g);
  }
  return games.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

export interface LeagueSnapshot {
  league: LeagueId;
  seasonYear: number;
  teams: Team[];
  ratings: RatingsResult;
  stats: Record<string, TeamSeasonStats>;
  // Completed games used (this season and last), oldest first.
  completedGames: Game[];
  asOf: string;
}

// Ratings and records for every team. Pass `cutoff` (an ISO date) to only use
// games played before it — the game page does this so a finished game is
// "predicted" using only what was known before kickoff.
export async function getLeagueSnapshot(
  league: LeagueId,
  seasonYear?: number,
  cutoff?: string,
): Promise<LeagueSnapshot> {
  const season = seasonYear ?? (await getCurrentSeason(league)).year;
  const [teams, current, previous] = await Promise.all([
    getTeams(league),
    getSeasonGames(league, season),
    getSeasonGames(league, season - 1),
  ]);
  const cutoffMs = cutoff ? Date.parse(cutoff) : Infinity;
  const completedGames = [...previous, ...current].filter(
    (g) => g.completed && Date.parse(g.date) < cutoffMs,
  );
  const asOf = cutoff ?? completedGames.at(-1)?.date ?? new Date(0).toISOString();
  return {
    league,
    seasonYear: season,
    teams,
    ratings: fitRatings(league, completedGames, season, asOf),
    stats: computeTeamStats(completedGames, season),
    completedGames,
    asOf,
  };
}

// Quick prediction for the schedule lists (the game page runs the full
// simulation instead, which also accounts for injuries).
export function predictGame(snapshot: LeagueSnapshot, game: Game) {
  const expected = expectedScores(
    snapshot.league,
    snapshot.ratings,
    game.home.team.id,
    game.away.team.id,
    game.neutralSite,
  );
  return {
    homeWin: quickHomeWinChance(snapshot.league, expected.home - expected.away),
    homePoints: expected.home,
    awayPoints: expected.away,
  };
}

// 1 = best team by net rating.
export function powerRanks(snapshot: LeagueSnapshot): Record<string, number> {
  const sorted = Object.values(snapshot.ratings.ratings).sort((a, b) => b.net - a.net);
  return Object.fromEntries(sorted.map((r, i) => [r.teamId, i + 1]));
}
