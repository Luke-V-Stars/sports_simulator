// The season accuracy report: re-predicts this season's finished games, each
// using only what was known before it, and checks the predictions against
// what happened (and against the Vegas line).

import { cacheLife } from "next/cache";
import { mapLimit } from "../espn";
import type { LeagueId } from "../leagues";
import { checkGame, playersInRange, statTables, summarizeAccuracy, type GameEvaluation } from "../sim/compare";
import { runSimulations } from "../sim/summary";
import { getLeagueSnapshot } from "./league";
import { getMatchup } from "./matchup";

// Fewer runs than the game page (10,000): plenty for averages over many games.
const RUNS = 2000;

export const REPORT_SIZES = [25, 50, 100, 200];

export async function getAccuracyReport(league: LeagueId, size: number) {
  const snapshot = await getLeagueSnapshot(league);
  const finished = snapshot.completedGames.filter((g) => g.seasonYear === snapshot.seasonYear).slice(-size).reverse();
  const results = await mapLimit(finished, 4, (g) => evaluateGame(league, g.id).catch(() => undefined));
  const evals = results.filter((e): e is GameEvaluation => e !== undefined);
  return {
    seasonYear: snapshot.seasonYear,
    evals, // newest first
    skipped: finished.length - evals.length, // couldn't be rebuilt (missing ESPN data)
    summary: summarizeAccuracy(evals),
  };
}

// A finished game never changes, so its evaluation is kept for days.
async function evaluateGame(league: LeagueId, eventId: string): Promise<GameEvaluation | undefined> {
  "use cache";
  cacheLife("days");
  const m = await getMatchup(league, eventId);
  if (!m.actual) return undefined;
  const summary = runSimulations(m.input, RUNS, seedFor(eventId));
  const { game, actual } = m;
  const vegas = game.vegas;
  const vegasFavorite =
    vegas && vegas.spread !== 0 ? (vegas.favoriteAbbr === game.home.team.abbr ? "home" : "away") : undefined;
  const players = (["home", "away"] as const).map((side) =>
    playersInRange(statTables(league, summary.players[side]), actual.players?.[side] ?? []),
  );
  return {
    id: game.id,
    date: game.date,
    homeAbbr: game.home.team.abbr,
    awayAbbr: game.away.team.abbr,
    homeWinPct: summary.home.winPct,
    awayWinPct: summary.away.winPct,
    check: checkGame(summary, actual, game.home.team.abbr, vegas),
    vegasFavorite,
    players: {
      inside: players[0].inside + players[1].inside,
      checked: players[0].checked + players[1].checked,
    },
  };
}

// The same game always gets the same random numbers, so the report is stable.
function seedFor(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
