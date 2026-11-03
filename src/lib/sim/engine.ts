// Plays ONE simulated game. summary.ts calls this thousands of times.
//
// Each simulated game:
//   1. decides who plays: injured players suit up by their injury status (a
//      "questionable" player plays about half the time), bench players get in
//      as often as they have lately, and only one NFL quarterback plays,
//   2. adjusts a team's expected points for who plays: down for an important
//      player who sits, up for one back after the team played without him,
//   3. produces a final score with realistic randomness,
//   4. splits the team's points, yards, rebounds, etc. among the players who
//      played, based on each player's recent share.

import { LEAGUES } from "../leagues";
import { normal, pickWeighted, poisson, wobble, type Rng } from "./random";
import type { MatchupInput, PlayerInput, SideInput } from "./types";

export interface SideResult {
  score: number;
  active: boolean[]; // active[i]: did players[i] play?
  // Player stats, flattened: stats[i * statCount + s] is player i, stat s
  // (stat order matches LEAGUES[league].playerStats).
  stats: Float64Array;
  touchdowns: number; // NFL only
  fieldGoals: number; // NFL only
}

export interface GameResult {
  home: SideResult;
  away: SideResult;
  overtimes: number;
  tie: boolean;
}

export function playGame(input: MatchupInput, rng: Rng): GameResult {
  return input.league === "nba" ? playNba(input, rng) : playNfl(input, rng);
}

// ---------- Shared ----------

function sampleLineup(side: SideInput, rng: Rng): boolean[] {
  return side.players.map((p) => !p.replacement && rng() < p.playProb && rng() < p.rolePct);
}

// Points to add to (or take from) a team's expected score for today's lineup.
// The team ratings already include each player as often as he has played
// (ratedShare), so only the difference counts: a star who always plays
// changes nothing, a star who sits costs his impact, and one back from a long
// injury adds it. A bench player plays about as often as before, so on
// average he changes nothing either.
function lineupAdjustment(side: SideInput, active: boolean[], cap: number): number {
  let points = 0;
  side.players.forEach((p, i) => {
    points += p.impact * ((active[i] ? 1 : 0) - p.ratedShare);
  });
  return Math.max(-cap, Math.min(cap, points));
}

// Splits `total` among active players in proportion to their average for
// `key`, each multiplied by `factor(i)` (today's random hot/cold factor).
function distribute(
  players: PlayerInput[],
  active: boolean[],
  key: string,
  total: number,
  factor: (i: number) => number,
  out: Float64Array,
  statIndex: number,
  statCount: number,
): void {
  const weights = new Float64Array(players.length);
  let sum = 0;
  for (let i = 0; i < players.length; i++) {
    if (!active[i]) continue;
    weights[i] = Math.max(0, players[i].avg[key] ?? 0) * factor(i);
    sum += weights[i];
  }
  if (sum <= 0) return;
  for (let i = 0; i < players.length; i++) {
    if (weights[i] > 0) out[i * statCount + statIndex] = (total * weights[i]) / sum;
  }
}

// ---------- NBA ----------

const NBA_KEYS = LEAGUES.nba.playerStats.map((s) => s.key);
// How much each player's share of a stat swings from game to game.
const NBA_SWING: Record<string, number> = { min: 0, pts: 0.3, reb: 0.3, ast: 0.35, fg3: 0.5, stl: 0.6, blk: 0.6 };

function playNba(input: MatchupInput, rng: Rng): GameResult {
  const homeLineup = sampleLineup(input.home, rng);
  const awayLineup = sampleLineup(input.away, rng);
  const homeExpected = Math.max(80, input.home.expectedPoints + lineupAdjustment(input.home, homeLineup, 12));
  const awayExpected = Math.max(80, input.away.expectedPoints + lineupAdjustment(input.away, awayLineup, 12));

  // A fast-paced game raises both scores together.
  const pace = 1 + 0.035 * normal(rng);
  let home = Math.round(homeExpected * pace + 9.5 * normal(rng));
  let away = Math.round(awayExpected * pace + 9.5 * normal(rng));

  // Tied after 48 minutes: play 5-minute overtimes until someone wins.
  let overtimes = 0;
  while (home === away) {
    overtimes++;
    home += Math.max(0, Math.round((homeExpected * 5) / 48 + 3 * normal(rng)));
    away += Math.max(0, Math.round((awayExpected * 5) / 48 + 3 * normal(rng)));
    if (overtimes >= 4 && home === away) {
      if (rng() < homeExpected / (homeExpected + awayExpected)) home += 2;
      else away += 2;
    }
  }

  return {
    home: nbaBox(input.home, homeLineup, home, homeExpected, overtimes, rng),
    away: nbaBox(input.away, awayLineup, away, awayExpected, overtimes, rng),
    overtimes,
    tie: false,
  };
}

function nbaBox(
  side: SideInput,
  active: boolean[],
  points: number,
  expected: number,
  overtimes: number,
  rng: Rng,
): SideResult {
  const statCount = NBA_KEYS.length;
  const stats = new Float64Array(side.players.length * statCount);
  const extraTime = 1 + (overtimes * 5) / 48;
  // A hot shooting night means more assists and threes too.
  const flow = Math.pow(points / Math.max(1, expected), 0.7);
  // The team's usual totals, nudged by what this opponent allows.
  const usual = (key: string) => (side.teamAvg[key] ?? 0) * (side.matchup[key] ?? 1);
  const totals: Record<string, number> = {
    min: 240 * extraTime,
    pts: points,
    reb: usual("reb") * extraTime * wobble(rng, 0.08),
    ast: usual("ast") * flow * wobble(rng, 0.1),
    fg3: usual("fg3") * flow * wobble(rng, 0.15),
    stl: usual("stl") * extraTime * wobble(rng, 0.2),
    blk: usual("blk") * extraTime * wobble(rng, 0.25),
  };
  // How big each player's role is tonight (foul trouble, hot hand...).
  const role = side.players.map((_, i) => (active[i] ? wobble(rng, 0.12) : 0));
  NBA_KEYS.forEach((key, s) => {
    distribute(side.players, active, key, totals[key], (i) => role[i] * wobble(rng, NBA_SWING[key]), stats, s, statCount);
  });
  return { score: points, active, stats, touchdowns: 0, fieldGoals: 0 };
}

// ---------- NFL ----------

const NFL_KEYS = LEAGUES.nfl.playerStats.map((s) => s.key);
const NFL_INDEX = Object.fromEntries(NFL_KEYS.map((k, i) => [k, i]));
// Average points from one possession in a typical NFL game.
const BASE_TD_RATE = 0.22;
const BASE_FG_RATE = 0.15;
const POINTS_PER_DRIVE = BASE_TD_RATE * 6.98 + BASE_FG_RATE * 3;

function isQuarterback(p: PlayerInput): boolean {
  const attempts = p.avg.passAtt ?? 0;
  return attempts >= 1 && (p.position === "QB" || attempts >= 10);
}

function playNfl(input: MatchupInput, rng: Rng): GameResult {
  const homeLineup = nflLineup(input.home, rng);
  const awayLineup = nflLineup(input.away, rng);
  const homeExpected = Math.max(6, input.home.expectedPoints + lineupAdjustment(input.home, homeLineup, 9));
  const awayExpected = Math.max(6, input.away.expectedPoints + lineupAdjustment(input.away, awayLineup, 9));

  // NFL scoring comes in chunks (touchdowns and field goals), so instead of a
  // bell curve we play out ~11 possessions per team.
  const r = rng();
  const drives = 11 + (r < 0.25 ? -1 : r > 0.75 ? 1 : 0);
  const home = playDrives(rng, homeExpected, drives);
  const away = playDrives(rng, awayExpected, drives);

  let overtimes = 0;
  let tie = false;
  if (home.points === away.points) {
    overtimes = 1;
    if (!input.postseason && rng() < 0.05) {
      tie = true; // regular-season overtime can end tied
    } else {
      const winner = rng() < homeExpected / (homeExpected + awayExpected) ? home : away;
      if (rng() < 0.45) {
        winner.points += 6;
        winner.touchdowns++;
      } else {
        winner.points += 3;
        winner.fieldGoals++;
      }
    }
  }

  return {
    home: nflBox(input.home, homeLineup, home, rng),
    away: nflBox(input.away, awayLineup, away, rng),
    overtimes,
    tie,
  };
}

// Exactly one quarterback plays: the highest one on the depth chart who's
// healthy. The stand-in (a quarterback with no recent stats, always healthy)
// plays if none is, or if he's listed higher, like a rookie's first start.
function nflLineup(side: SideInput, rng: Rng): boolean[] {
  const active = sampleLineup(side, rng);
  const players = side.players;
  const available = players.map((_, i) => i).filter((i) => active[i] && isQuarterback(players[i]));
  let qb = players.findIndex((p) => p.replacement);
  const standInDepth = qb >= 0 ? (players[qb].depth ?? 99) : 99;
  const top = Math.min(99, ...available.map((i) => players[i].depth ?? 99));
  if (available.length > 0 && top <= standInDepth) {
    const best = available.filter((i) => (players[i].depth ?? 99) === top);
    // Not on the depth chart: favor whoever usually throws the most.
    qb = best[pickWeighted(rng, best.map((i) => (players[i].avg.passAtt ?? 1) ** 2))];
  }
  for (const i of available) active[i] = false;
  if (qb >= 0) active[qb] = true;
  return active;
}

interface DriveResult {
  points: number;
  touchdowns: number;
  fieldGoals: number;
}

function playDrives(rng: Rng, expected: number, drives: number): DriveResult {
  // Scale touchdown and field-goal chances so the average matches `expected`.
  const strength = expected / (drives * POINTS_PER_DRIVE);
  const tdChance = Math.min(0.6, BASE_TD_RATE * strength);
  const fgChance = Math.min(0.3, BASE_FG_RATE * strength);
  const result: DriveResult = { points: 0, touchdowns: 0, fieldGoals: 0 };
  for (let d = 0; d < drives; d++) {
    const roll = rng();
    if (roll < tdChance) {
      result.touchdowns++;
      const extra = rng();
      result.points += extra < 0.94 ? 7 : extra < 0.98 ? 6 : 8; // PAT, missed PAT, 2-pt try
    } else if (roll < tdChance + fgChance) {
      result.fieldGoals++;
      result.points += 3;
    }
  }
  return result;
}

function nflBox(side: SideInput, active: boolean[], drive: DriveResult, rng: Rng): SideResult {
  const statCount = NFL_KEYS.length;
  const stats = new Float64Array(side.players.length * statCount);
  const players = side.players;
  const set = (i: number, key: string, value: number) => (stats[i * statCount + NFL_INDEX[key]] = value);
  const add = (i: number, key: string) => (stats[i * statCount + NFL_INDEX[key]] += 1);
  // The team's usual totals, nudged by what this opponent allows.
  const usual = (key: string, fallback = 0) => (side.teamAvg[key] ?? fallback) * (side.matchup[key] ?? 1);

  // Scoring more than usual usually means more yards too.
  const flow = Math.sqrt((drive.points + 7) / (side.avgPoints + 7));
  const passYards = usual("passYds") * flow * wobble(rng, 0.18);
  const rushYards = usual("rushYds") * flow * wobble(rng, 0.25);
  const receptions = usual("rec") * Math.sqrt(flow) * wobble(rng, 0.12);

  // nflLineup left exactly one quarterback active.
  const qb = players.findIndex((p, i) => active[i] && isQuarterback(p));
  if (qb >= 0) {
    set(qb, "passYds", passYards);
    set(qb, "int", poisson(rng, usual("int", 0.8) * wobble(rng, 0.3)));
  }

  // Receivers: each gets a "target share" for the day.
  const targetShare = players.map((_, i) => (active[i] ? wobble(rng, 0.45) : 0));
  distribute(players, active, "recYds", passYards, (i) => targetShare[i], stats, NFL_INDEX.recYds, statCount);
  distribute(players, active, "rec", receptions, (i) => targetShare[i], stats, NFL_INDEX.rec, statCount);
  distribute(players, active, "rushYds", rushYards, () => wobble(rng, 0.4), stats, NFL_INDEX.rushYds, statCount);

  // Hand out each touchdown: a pass (QB + a receiver) or a run.
  for (let t = 0; t < drive.touchdowns; t++) {
    if (qb >= 0 && rng() < side.passTdShare) {
      add(qb, "passTd");
      const receiver = pickWeighted(
        rng,
        players.map((p, i) => (active[i] ? ((p.avg.recTd ?? 0) + (p.avg.recYds ?? 0) / 150) * targetShare[i] : 0)),
      );
      if (receiver >= 0) add(receiver, "recTd");
    } else {
      const runner = pickWeighted(
        rng,
        players.map((p, i) => (active[i] ? (p.avg.rushTd ?? 0) + Math.max(0, p.avg.rushYds ?? 0) / 100 : 0)),
      );
      if (runner >= 0) add(runner, "rushTd");
    }
  }

  return { score: drive.points, active, stats, touchdowns: drive.touchdowns, fieldGoals: drive.fieldGoals };
}
