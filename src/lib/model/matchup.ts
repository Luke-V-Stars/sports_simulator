// Gathers everything the game page needs for one matchup.

import { getDepthChart, getGameDetails, getRoster, mapLimit } from "../espn";
import { LEAGUES, type LeagueId } from "../leagues";
import type { ActualResult, Game, GameDetails, Injury, TeamRating, TeamSeasonStats } from "../types";
import type { MatchupInput } from "../sim/types";
import { getLeagueSnapshot, powerRanks, type LeagueSnapshot } from "./league";
import { buildSide, type SampleGame } from "./players";
import { expectedScores } from "./ratings";

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
  actual?: ActualResult; // only for finished games
}

export async function getMatchup(league: LeagueId, eventId: string): Promise<MatchupData> {
  const details = await getGameDetails(league, eventId);
  const game = details.game;
  // Only use games played before this one (matters when viewing a past game).
  const snapshot = await getLeagueSnapshot(league, game.seasonYear, game.date);
  const expected = expectedScores(league, snapshot.ratings, game.home.team.id, game.away.team.id, game.neutralSite);
  const ranks = powerRanks(snapshot);

  const [home, away] = await Promise.all(
    (["home", "away"] as const).map(async (side) => {
      const team = game[side].team;
      const injuries = details.injuries[team.id] ?? [];
      const [sample, roster, depth] = await Promise.all([
        loadSample(league, team.id, snapshot),
        getRoster(league, team.id),
        // Nice to have: without it we fall back to box-score usage.
        league === "nfl" ? getDepthChart(league, team.id).catch(() => ({})) : {},
      ]);
      const input = buildSide({
        league,
        team,
        expectedPoints: expected[side],
        sample,
        roster,
        depth,
        injuries,
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
  const teamGames = snapshot.completedGames
    .filter((g) => g.home.team.id === teamId || g.away.team.id === teamId)
    .reverse(); // newest first
  const current = teamGames.filter((g) => g.seasonYear === snapshot.seasonYear).slice(0, wanted);
  const previous = teamGames
    .filter((g) => g.seasonYear < snapshot.seasonYear)
    .slice(0, Math.max(0, wanted - current.length));

  const chosen = [
    ...current.map((game) => ({ game, weight: 1 })),
    ...previous.map((game) => ({ game, weight: 0.5 })),
  ];
  const sample = await mapLimit(chosen, 6, async ({ game, weight }) => {
    const box = await getGameDetails(league, game.id).catch(() => undefined);
    if (!box) return { lines: [], benched: [], teamPoints: 0, weight }; // ESPN lost this one
    const side = game.home.team.id === teamId ? game.home : game.away;
    return {
      lines: box.boxScore[teamId] ?? [],
      benched: box.benched?.[teamId] ?? [], // missing in box scores cached before this field existed
      teamPoints: side.score ?? 0,
      weight,
    };
  });
  // Ignore any game ESPN has no box score for (or won't send at all).
  return sample.filter((g) => g.lines.length > 0);
}
