// Checks a finished game's projections against what really happened.

import { roundHalf } from "../format";
import { LEAGUES, type LeagueId } from "../leagues";
import type { ActualResult, BoxScoreLine, VegasLine } from "../types";
import type { PlayerProjection, SimSummary } from "./summary";

// Where a real number landed compared with the model's typical range
// (10th to 90th percentile of the simulations).
export type RangeCheck = "below" | "inside" | "above";

export function checkRange(value: number, low: number, high: number): RangeCheck {
  if (value < low) return "below";
  if (value > high) return "above";
  return "inside";
}

export interface ValueCheck {
  projected: number; // rounded the same way the page shows it
  low: number;
  high: number;
  actual: number;
  miss: number; // how far the projection was from what happened
  range: RangeCheck;
}

export interface GameCheck {
  winner: "home" | "away" | "tie";
  pick: "home" | "away"; // the side the model gave the better chance
  winnerChance: number; // the chance the model gave what really happened
  home: ValueCheck;
  away: ValueCheck;
  margin: ValueCheck; // home minus away
  total: ValueCheck;
  // How far off the betting line was, to compare with the model's miss.
  vegasMarginMiss?: number;
  vegasTotalMiss?: number;
}

export function checkGame(summary: SimSummary, actual: ActualResult, homeAbbr: string, vegas?: VegasLine): GameCheck {
  const actualMargin = actual.home - actual.away;
  const actualTotal = actual.home + actual.away;
  const winner = actualMargin > 0 ? "home" : actualMargin < 0 ? "away" : "tie";
  const vegasMargin = vegas && (vegas.favoriteAbbr === homeAbbr ? vegas.spread : -vegas.spread);
  return {
    winner,
    pick: summary.home.winPct >= summary.away.winPct ? "home" : "away",
    winnerChance: winner === "tie" ? summary.tiePct : summary[winner].winPct,
    home: valueCheck(Math.round(summary.home.mean), summary.home, actual.home),
    away: valueCheck(Math.round(summary.away.mean), summary.away, actual.away),
    margin: valueCheck(roundHalf(summary.meanMargin), summary.marginRange, actualMargin),
    total: valueCheck(roundHalf(summary.meanTotal), summary.totalRange, actualTotal),
    vegasMarginMiss: vegasMargin === undefined ? undefined : Math.abs(vegasMargin - actualMargin),
    vegasTotalMiss: vegas?.overUnder === undefined ? undefined : Math.abs(vegas.overUnder - actualTotal),
  };
}

function valueCheck(projected: number, range: { low: number; high: number }, actual: number): ValueCheck {
  return {
    projected,
    low: range.low,
    high: range.high,
    actual,
    miss: Math.abs(projected - actual),
    range: checkRange(actual, range.low, range.high),
  };
}

// ---------- Player stat tables ----------

export interface StatGroup {
  title: string;
  keys: string[];
  include: (p: PlayerProjection) => boolean;
  limit: number;
}

// NFL players are split into passing / rushing / receiving tables.
const STAT_GROUPS: Record<LeagueId, StatGroup[]> = {
  nfl: [
    { title: "Passing", keys: ["passYds", "passTd", "int"], include: (p) => p.stats.passYds.mean >= 20, limit: 2 },
    { title: "Rushing", keys: ["rushYds", "rushTd", "rushLng"], include: (p) => p.stats.rushYds.mean >= 3, limit: 5 },
    {
      title: "Receiving",
      keys: ["rec", "recYds", "recTd", "recLng"],
      include: (p) => p.stats.rec.mean >= 0.5,
      limit: 7,
    },
  ],
  nba: [
    {
      title: "Players",
      keys: LEAGUES.nba.playerStats.map((s) => s.key),
      include: (p) => p.playPct > 0,
      limit: 13,
    },
  ],
};

// The rows each table shows: players expected to play, biggest first.
export function statTables(league: LeagueId, players: PlayerProjection[]) {
  return STAT_GROUPS[league].map((group) => ({
    group,
    rows: players
      .filter((p) => p.playPct > 0 && group.include(p))
      .sort((a, b) => b.stats[group.keys[0]].mean - a.stats[group.keys[0]].mean)
      .slice(0, group.limit),
  }));
}

// How one stat did across the players checked.
export interface StatTally {
  checked: number;
  inside: number;
  below: number;
  above: number;
  missSum: number; // total distance from the projection; missSum / checked = typical miss
}

export interface RangeSummary {
  inside: number; // the headline: leaves out rare stats (see StatDef.rare)
  checked: number;
  byStat: Record<string, StatTally>; // every stat
}

const RARE_STATS = new Set(
  Object.values(LEAGUES).flatMap((league) => league.playerStats.filter((s) => s.rare).map((s) => s.key)),
);

// How many of the shown stats landed inside the projected range, for players
// who are in the real box score.
export function playersInRange(tables: ReturnType<typeof statTables>, actual: BoxScoreLine[]): RangeSummary {
  const byId = new Map(actual.map((line) => [line.playerId, line]));
  const result: RangeSummary = { inside: 0, checked: 0, byStat: {} };
  for (const { group, rows } of tables) {
    for (const p of rows) {
      const line = byId.get(p.id);
      if (!line) continue;
      for (const key of group.keys) {
        const real = line.stats[key] ?? 0;
        const range = checkRange(real, p.stats[key].low, p.stats[key].high);
        const tally = (result.byStat[key] ??= { checked: 0, inside: 0, below: 0, above: 0, missSum: 0 });
        tally.checked++;
        tally[range]++;
        tally.missSum += Math.abs(real - p.stats[key].mean);
        if (RARE_STATS.has(key)) continue;
        result.checked++;
        if (range === "inside") result.inside++;
      }
    }
  }
  return result;
}

// Adds range summaries together (both teams, or a whole season of games).
export function combineRanges(summaries: RangeSummary[]): RangeSummary {
  const total: RangeSummary = { inside: 0, checked: 0, byStat: {} };
  for (const s of summaries) {
    total.inside += s.inside;
    total.checked += s.checked;
    for (const [key, t] of Object.entries(s.byStat)) {
      const sum = (total.byStat[key] ??= { checked: 0, inside: 0, below: 0, above: 0, missSum: 0 });
      sum.checked += t.checked;
      sum.inside += t.inside;
      sum.below += t.below;
      sum.above += t.above;
      sum.missSum += t.missSum;
    }
  }
  return total;
}

// ---------- Season accuracy report ----------

// One finished game, re-predicted using only what was known before it.
export interface GameEvaluation {
  id: string;
  date: string;
  homeAbbr: string;
  awayAbbr: string;
  homeWinPct: number;
  awayWinPct: number;
  check: GameCheck;
  vegasFavorite?: "home" | "away"; // undefined if no line or a pick'em
  players: RangeSummary;
}

export interface Tally {
  hits: number;
  total: number;
}

export interface CalibrationBin {
  from: number; // favorite's chance, e.g. 0.6
  to: number;
  games: number;
  predicted: number; // average chance the model gave the favorite
  actual: number; // share of those games the favorite won
}

export interface AccuracySummary {
  games: number;
  picks: { model: Tally; vegas: Tally }; // winner picked right (ties left out)
  // Average points off. "onVegasGames" uses only games with a line, so it
  // can be compared with Vegas fairly.
  margin: { model: number; onVegasGames: number; vegas: number; vegasGames: number };
  total: { model: number; onVegasGames: number; vegas: number; vegasGames: number };
  brier: number; // average (chance - result)^2; always saying 50% scores 0.25
  calibration: CalibrationBin[];
  scoresInRange: Tally; // team scores inside the 10th-90th percentile range
  playersInRange: Tally; // leaves out rare stats (see StatDef.rare)
  statsByKey: Record<string, StatTally>; // every stat
}

const BINS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];

export function summarizeAccuracy(evals: GameEvaluation[]): AccuracySummary {
  const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const decided = evals.filter((e) => e.check.winner !== "tie");
  const withSpread = evals.filter((e) => e.check.vegasMarginMiss !== undefined);
  const withTotal = evals.filter((e) => e.check.vegasTotalMiss !== undefined);
  const withFavorite = decided.filter((e) => e.vegasFavorite);
  const players = combineRanges(evals.map((e) => e.players));

  const calibration = BINS.slice(0, -1).map((from, i) => {
    const inBin = decided.filter((e) => {
      const favorite = Math.max(e.homeWinPct, e.awayWinPct);
      return favorite >= from && favorite < BINS[i + 1];
    });
    return {
      from,
      to: Math.min(1, BINS[i + 1]),
      games: inBin.length,
      predicted: average(inBin.map((e) => Math.max(e.homeWinPct, e.awayWinPct))),
      actual: average(inBin.map((e) => (e.check.winner === e.check.pick ? 1 : 0))),
    };
  });

  return {
    games: evals.length,
    picks: {
      model: { hits: decided.filter((e) => e.check.winner === e.check.pick).length, total: decided.length },
      vegas: { hits: withFavorite.filter((e) => e.check.winner === e.vegasFavorite).length, total: withFavorite.length },
    },
    margin: {
      model: average(evals.map((e) => e.check.margin.miss)),
      onVegasGames: average(withSpread.map((e) => e.check.margin.miss)),
      vegas: average(withSpread.map((e) => e.check.vegasMarginMiss!)),
      vegasGames: withSpread.length,
    },
    total: {
      model: average(evals.map((e) => e.check.total.miss)),
      onVegasGames: average(withTotal.map((e) => e.check.total.miss)),
      vegas: average(withTotal.map((e) => e.check.vegasTotalMiss!)),
      vegasGames: withTotal.length,
    },
    brier: average(decided.map((e) => (e.homeWinPct - (e.check.winner === "home" ? 1 : 0)) ** 2)),
    calibration,
    scoresInRange: {
      hits: evals.reduce((n, e) => n + (e.check.home.range === "inside" ? 1 : 0) + (e.check.away.range === "inside" ? 1 : 0), 0),
      total: evals.length * 2,
    },
    playersInRange: { hits: players.inside, total: players.checked },
    statsByKey: players.byStat,
  };
}
