// Gathers everything the game page needs for one matchup.

import { getDepthChart, getGameDetails, getPlayerGameLog, getRoster, mapLimit } from "../espn";
import { LEAGUES, type LeagueId } from "../leagues";
import type { ActualResult, Game, GameDetails, Injury, RosterPlayer, TeamRating, TeamSeasonStats } from "../types";
import type { MatchupInput } from "../sim/types";
import { getGameWeather, type GameWeather } from "../weather";
import { matchupFactors, restAdjustments, weatherAdjustments } from "./conditions";
import { getLeagueSnapshot, getSeasonGames, powerRanks, type LeagueSnapshot } from "./league";
import {
  buildSide,
  injuriesAtKickoff,
  isRegular,
  playChance,
  type PlayerHistory,
  type SampleGame,
} from "./players";
import { expectedScores, ratingWeight } from "./ratings";

export interface TeamContext {
  rating: TeamRating;
  rank: number; // power rank, 1 = best
  stats?: TeamSeasonStats;
  injuries: Injury[];
  sampleGames: number; // how many box scores the player averages use
}

export interface MatchupData {
  game: Game;
  input: MatchupInput;
  home: TeamContext;
  away: TeamContext;
  teamCount: number;
  leagueAverage: number;
  weather?: GameWeather; // outdoor NFL games only
  actual?: ActualResult; // only for finished games
}

export async function getMatchup(league: LeagueId, eventId: string): Promise<MatchupData> {
  const details = await getGameDetails(league, eventId);
  const game = details.game;
  // Only use games played before this one (matters when viewing a past game).
  const snapshot = await getLeagueSnapshot(league, game.seasonYear, game.date);
  const expected = expectedScores(league, snapshot.ratings, game.home.team.id, game.away.team.id, game.neutralSite);
  const ranks = powerRanks(snapshot);
  // Game conditions: rest for each team (from the whole schedule, since games
  // between now and a future game count too), weather for both.
  const [schedule, weather] = await Promise.all([
    getSeasonGames(league, game.seasonYear),
    league === "nfl" ? getGameWeather(game.venueLocation, game.date) : undefined,
  ]);
  const rest = restAdjustments(league, game, schedule);

  const [home, away] = await Promise.all(
    (["home", "away"] as const).map(async (side) => {
      const team = game[side].team;
      const [sample, currentRoster, depth] = await Promise.all([
        loadSample(league, team.id, snapshot),
        getRoster(league, team.id),
        // Nice to have: without it we fall back to box-score usage.
        getDepthChart(league, team.id).catch(() => ({})),
      ]);
      const { roster, injuries } = injuriesAtKickoff(currentRoster, details.injuries[team.id] ?? [], game.date);
      const history = await loadHistory(league, sample, roster, depth, injuries, snapshot.seasonYear, game.date);
      const input = buildSide({
        league,
        team,
        expectedPoints: expected[side],
        sample,
        roster,
        depth,
        injuries,
        history,
        teamGames: teamGames(snapshot, team.id).map((g) => ({
          id: g.id,
          date: g.date,
          weight: ratingWeight(league, g, snapshot.seasonYear, snapshot.asOf),
        })),
        gameDate: game.date,
        adjustments: [...rest[side], ...weatherAdjustments(weather)],
      });
      const context: TeamContext = {
        rating: snapshot.ratings.ratings[team.id] ?? { teamId: team.id, offense: 0, defense: 0, net: 0 },
        rank: ranks[team.id] ?? 0,
        stats: snapshot.stats[team.id],
        injuries,
        sampleGames: sample.length,
      };
      return { input, context };
    }),
  );

  // Each offense against the other's defense.
  home.input.matchup = matchupFactors(league, home.input, away.input);
  away.input.matchup = matchupFactors(league, away.input, home.input);

  return {
    game,
    input: {
      league,
      postseason: game.seasonType === 3,
      home: home.input,
      away: away.input,
    },
    home: home.context,
    away: away.context,
    teamCount: snapshot.teams.length,
    leagueAverage: snapshot.ratings.leagueAverage,
    weather,
    actual: actualResult(details),
  };
}

// The real final score and box score, once the game is over.
function actualResult({ game, boxScore }: GameDetails): ActualResult | undefined {
  if (!game.completed || game.home.score === null || game.away.score === null) return undefined;
  const home = boxScore[game.home.team.id] ?? [];
  const away = boxScore[game.away.team.id] ?? [];
  return {
    home: game.home.score,
    away: game.away.score,
    players: home.length && away.length ? { home, away } : undefined,
  };
}

// The team's most recent games this season; if there aren't enough yet
// (early season), top up with the end of last season at half weight.
async function loadSample(league: LeagueId, teamId: string, snapshot: LeagueSnapshot): Promise<SampleGame[]> {
  const wanted = LEAGUES[league].playerSampleGames;
  const games = teamGames(snapshot, teamId);
  const current = games.filter((g) => g.seasonYear === snapshot.seasonYear).slice(0, wanted);
  const previous = games
    .filter((g) => g.seasonYear < snapshot.seasonYear)
    .slice(0, Math.max(0, wanted - current.length));

  const chosen = [
    ...current.map((game) => ({ game, weight: 1 })),
    ...previous.map((game) => ({ game, weight: 0.5 })),
  ];
  const sample = await mapLimit(chosen, 6, async ({ game, weight }) => {
    const box = await getGameDetails(league, game.id).catch(() => undefined);
    if (!box) return { id: game.id, lines: [], oppLines: [], benched: [], teamPoints: 0, weight }; // ESPN lost this one
    const [side, opp] = game.home.team.id === teamId ? [game.home, game.away] : [game.away, game.home];
    return {
      id: game.id,
      lines: box.boxScore[teamId] ?? [],
      oppLines: box.boxScore[opp.team.id] ?? [],
      benched: box.benched?.[teamId] ?? [], // missing in box scores cached before this field existed
      teamPoints: side.score ?? 0,
      weight,
    };
  });
  // Ignore any game ESPN has no box score for (or won't send at all).
  return sample.filter((g) => g.lines.length > 0);
}

// The team's finished games before this one, newest first.
function teamGames(snapshot: LeagueSnapshot, teamId: string): Game[] {
  return snapshot.completedGames.filter((g) => g.home.team.id === teamId || g.away.team.id === teamId).reverse();
}

// Healthy regulars who missed some of the sampled games (back from injury, or
// just traded here) are topped up with their own most recent games from
// ESPN's per-player game log, up to the usual number of games.
async function loadHistory(
  league: LeagueId,
  sample: SampleGame[],
  roster: RosterPlayer[],
  depth: Record<string, number>,
  injuries: Injury[],
  seasonYear: number,
  before: string, // only games before this date
): Promise<Record<string, PlayerHistory>> {
  const wanted = LEAGUES[league].playerSampleGames;
  const injuryById = new Map(injuries.map((i) => [i.playerId, i]));
  const sampleIds = new Set(sample.map((g) => g.id));
  const needed = roster
    .map((r) => ({ r, played: sample.filter((g) => g.lines.some((l) => l.playerId === r.id)).length }))
    .filter(({ r, played }) => {
      const injury = injuryById.get(r.id);
      const healthy = !r.unavailable && (!injury || playChance(injury.status) > 0);
      return healthy && isRegular(league, r.position, depth[r.id]) && played < sample.length;
    });

  // This season counts fully and last season half, like the team's games.
  const seasons = [
    { season: seasonYear, weight: 1 },
    { season: seasonYear - 1, weight: 0.5 },
  ];
  const results = await mapLimit(needed, 4, async ({ r, played }) => {
    const logs = await Promise.all(
      seasons.map(({ season }) => getPlayerGameLog(league, r.id, season).catch(() => [])),
    );
    const games = seasons.flatMap(({ weight }, i) =>
      logs[i].filter((g) => Date.parse(g.date) < Date.parse(before)).map((g) => ({ ...g, weight })),
    );
    const history: PlayerHistory = {
      // Games already in the sample are counted there.
      extra: games.filter((g) => !sampleIds.has(g.id)).slice(0, Math.max(0, wanted - played)),
      played: games.map(({ id, date, teamId }) => ({ id, date, teamId })),
    };
    return [r.id, history] as const;
  });
  return Object.fromEntries(results);
}
