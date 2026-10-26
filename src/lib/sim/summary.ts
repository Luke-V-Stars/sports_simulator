// Runs the simulation many times and boils the results down to the numbers
// the dashboard shows (win chances, likely scores, player projections).

import { LEAGUES } from "../leagues";
import { playGame, type GameResult, type SideResult } from "./engine";
import { makeRng } from "./random";
import type { MatchupInput, SideInput } from "./types";

export interface StatProjection {
  mean: number;
  low: number; // 10th percentile: a quiet game
  high: number; // 90th percentile: a big game
}

export interface PlayerProjection {
  id: string;
  name: string;
  position?: string;
  headshot?: string;
  injury?: { status: string; detail?: string };
  replacement?: boolean;
  playPct: number; // share of simulations he played in
  stats: Record<string, StatProjection>; // only counts games he played
}

export interface TeamProjection {
  winPct: number;
  mean: number;
  low: number;
  high: number;
}

export interface SimSummary {
  runs: number;
  home: TeamProjection;
  away: TeamProjection;
  tiePct: number;
  overtimePct: number;
  meanMargin: number; // home minus away
  meanTotal: number;
  margins: { margin: number; pct: number }[]; // home minus away
  totals: { from: number; to: number; pct: number }[];
  likelyScores: { home: number; away: number; pct: number }[];
  players: { home: PlayerProjection[]; away: PlayerProjection[] };
}

// Keep at most this many samples per player stat for the low/high range.
const SAMPLE_CAP = 4000;

class PlayerTally {
  played = 0;
  sums: Float64Array;
  samples: number[][];
  constructor(statCount: number) {
    this.sums = new Float64Array(statCount);
    this.samples = Array.from({ length: statCount }, () => []);
  }
}

export function runSimulations(input: MatchupInput, runs: number, seed: number): SimSummary {
  const rng = makeRng(seed);
  const statKeys = LEAGUES[input.league].playerStats.map((s) => s.key);
  const statCount = statKeys.length;
  const homeTally = input.home.players.map(() => new PlayerTally(statCount));
  const awayTally = input.away.players.map(() => new PlayerTally(statCount));
  const homeScores = new Int32Array(runs);
  const awayScores = new Int32Array(runs);
  let homeWins = 0;
  let awayWins = 0;
  let ties = 0;
  let overtimeGames = 0;
  const scoreCounts = new Map<string, number>();

  for (let r = 0; r < runs; r++) {
    const game = playGame(input, rng);
    homeScores[r] = game.home.score;
    awayScores[r] = game.away.score;
    if (game.tie) ties++;
    else if (game.home.score > game.away.score) homeWins++;
    else awayWins++;
    if (game.overtimes > 0) overtimeGames++;
    const key = `${game.home.score}-${game.away.score}`;
    scoreCounts.set(key, (scoreCounts.get(key) ?? 0) + 1);
    tally(homeTally, game.home, statCount);
    tally(awayTally, game.away, statCount);
  }

  const margins = new Map<number, number>();
  const totals: number[] = [];
  let marginSum = 0;
  for (let r = 0; r < runs; r++) {
    const margin = homeScores[r] - awayScores[r];
    margins.set(margin, (margins.get(margin) ?? 0) + 1);
    marginSum += margin;
    totals.push(homeScores[r] + awayScores[r]);
  }

  return {
    runs,
    home: teamProjection(homeScores, homeWins / runs),
    away: teamProjection(awayScores, awayWins / runs),
    tiePct: ties / runs,
    overtimePct: overtimeGames / runs,
    meanMargin: marginSum / runs,
    meanTotal: totals.reduce((a, b) => a + b, 0) / runs,
    margins: [...margins.entries()]
      .filter(([m]) => Math.abs(m) <= 45)
      .map(([margin, count]) => ({ margin, pct: count / runs }))
      .sort((a, b) => a.margin - b.margin),
    totals: binTotals(totals, input.league === "nfl" ? 3 : 5),
    likelyScores: [...scoreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, count]) => {
        const [home, away] = key.split("-").map(Number);
        return { home, away, pct: count / runs };
      }),
    players: {
      home: projections(input.home, homeTally, statKeys, runs),
      away: projections(input.away, awayTally, statKeys, runs),
    },
  };
}

function tally(tallies: PlayerTally[], side: SideResult, statCount: number) {
  for (let i = 0; i < tallies.length; i++) {
    if (!side.active[i]) continue;
    const t = tallies[i];
    t.played++;
    for (let s = 0; s < statCount; s++) {
      const value = side.stats[i * statCount + s];
      t.sums[s] += value;
      if (t.samples[s].length < SAMPLE_CAP) t.samples[s].push(value);
    }
  }
}

function percentile(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function teamProjection(scores: Int32Array, winPct: number): TeamProjection {
  const sorted = Int32Array.from(scores).sort();
  return {
    winPct,
    mean: scores.reduce((a, b) => a + b, 0) / scores.length,
    low: percentile(sorted, 0.1),
    high: percentile(sorted, 0.9),
  };
}

function binTotals(totals: number[], width: number) {
  const counts = new Map<number, number>();
  for (const t of totals) {
    const bin = Math.floor(t / width) * width;
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([from, count]) => ({ from, to: from + width - 1, pct: count / totals.length }))
    .filter((b) => b.pct >= 0.001);
}

function projections(side: SideInput, tallies: PlayerTally[], statKeys: string[], runs: number): PlayerProjection[] {
  return side.players
    .map((p, i) => {
      const t = tallies[i];
      const stats: Record<string, StatProjection> = {};
      statKeys.forEach((key, s) => {
        const sorted = Float64Array.from(t.samples[s]).sort();
        stats[key] = {
          mean: t.played ? t.sums[s] / t.played : 0,
          low: percentile(sorted, 0.1),
          high: percentile(sorted, 0.9),
        };
      });
      return {
        id: p.id,
        name: p.name,
        position: p.position,
        headshot: p.headshot,
        injury: p.injury,
        replacement: p.replacement,
        playPct: t.played / runs,
        stats,
      };
    })
    // The stand-in backup QB only matters if he actually had to play.
    .filter((p) => !p.replacement || p.playPct > 0);
}

// ---------- A single game, for the "play one game" box score ----------

export interface SingleGame {
  homeScore: number;
  awayScore: number;
  overtimes: number;
  tie: boolean;
  home: BoxLine[];
  away: BoxLine[];
  homeScoring?: { touchdowns: number; fieldGoals: number };
  awayScoring?: { touchdowns: number; fieldGoals: number };
}

export interface BoxLine {
  id: string;
  name: string;
  position?: string;
  stats: Record<string, number>;
}

// Rounds to whole numbers while keeping the total the same, so players'
// points still add up to the team's score.
function roundKeepingTotal(values: number[]): number[] {
  const target = Math.round(values.reduce((a, b) => a + b, 0));
  const rounded = values.map(Math.floor);
  let missing = target - rounded.reduce((a, b) => a + b, 0);
  const byRemainder = values.map((v, i) => ({ i, rest: v - Math.floor(v) })).sort((a, b) => b.rest - a.rest);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    rounded[i]++;
    missing--;
  }
  return rounded;
}

export function playOneGame(input: MatchupInput, seed: number): SingleGame {
  const game: GameResult = playGame(input, makeRng(seed));
  const statKeys = LEAGUES[input.league].playerStats.map((s) => s.key);
  const lines = (side: SideInput, result: SideResult): BoxLine[] => {
    const playing = side.players.map((p, i) => ({ p, i })).filter(({ i }) => result.active[i]);
    const columns = statKeys.map((_, s) =>
      roundKeepingTotal(playing.map(({ i }) => result.stats[i * statKeys.length + s])),
    );
    return playing.map(({ p }, row) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      stats: Object.fromEntries(statKeys.map((key, s) => [key, columns[s][row]])),
    }));
  };
  const nfl = input.league === "nfl";
  return {
    homeScore: game.home.score,
    awayScore: game.away.score,
    overtimes: game.overtimes,
    tie: game.tie,
    home: lines(input.home, game.home),
    away: lines(input.away, game.away),
    homeScoring: nfl ? { touchdowns: game.home.touchdowns, fieldGoals: game.home.fieldGoals } : undefined,
    awayScoring: nfl ? { touchdowns: game.away.touchdowns, fieldGoals: game.away.fieldGoals } : undefined,
  };
}
