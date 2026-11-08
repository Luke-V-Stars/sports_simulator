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
//      played, based on each player's recent share and how much his own numbers
//      swing, in whole numbers like a real box score. When someone sits, most of
//      his role goes to players at his position.

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

// Who takes over when a player sits: this share of his role goes to players
// at his position (a backup running back gets the carries), and the rest
// spreads across the whole team.
const SAME_POSITION_SHARE = 0.6;

function positionGroup(position: string | undefined): string | undefined {
  switch (position) {
    case "RB":
    case "FB":
      return "backs";
    case "WR":
    case "TE":
      return "receivers";
    case "PG":
    case "SG":
    case "G":
      return "guards";
    case "SF":
    case "F":
      return "wings";
    case "PF":
    case "C":
      return "bigs";
    default:
      return undefined; // quarterbacks are picked separately
  }
}

// Each active player's usual amount of `key`, plus what he takes over from
// teammates at his position who are sitting.
function roleWeights(players: PlayerInput[], active: boolean[], key: string): Float64Array {
  const base = new Float64Array(players.length);
  for (let i = 0; i < players.length; i++) {
    if (active[i]) base[i] = Math.max(0, players[i].avg[key] ?? 0);
  }
  const weights = Float64Array.from(base);
  for (let j = 0; j < players.length; j++) {
    if (active[j]) continue;
    const vacated = SAME_POSITION_SHARE * Math.max(0, players[j].avg[key] ?? 0) * players[j].sampleShare;
    const group = positionGroup(players[j].position);
    if (vacated <= 0 || !group) continue;
    let groupTotal = 0;
    for (let i = 0; i < players.length; i++) {
      if (positionGroup(players[i].position) === group) groupTotal += base[i];
    }
    if (groupTotal <= 0) continue;
    for (let i = 0; i < players.length; i++) {
      if (positionGroup(players[i].position) === group) weights[i] += (vacated * base[i]) / groupTotal;
    }
  }
  return weights;
}

// The most one player gets in a game, about what the record books allow, so
// a rare extreme random draw can't produce an impossible stat line.
const STAT_CAP: Record<string, number> = {
  min: 48, // plus any overtime
  pts: 70,
  reb: 30,
  ast: 22,
  fg3: 14,
  stl: 9,
  blk: 10,
  passYds: 550,
  rushYds: 280,
  rec: 18,
  recYds: 310,
};

// Splits `total` among active players by role (or by `base`, if given), each multiplied by `factor(i)`
// (today's random hot/cold factor), and limits each to `cap`, with the excess
// going to teammates. Then makes whole numbers: walking through a running total
// keeps each player's average right and the team's sum intact.
function distribute(
  players: PlayerInput[],
  active: boolean[],
  key: string,
  total: number,
  factor: (i: number) => number,
  out: Float64Array,
  statIndex: number,
  statCount: number,
  rng: Rng,
  cap: number = STAT_CAP[key],
  base?: Float64Array,
): void {
  const weights = base ?? roleWeights(players, active, key);
  let sum = 0;
  for (let i = 0; i < players.length; i++) {
    if (weights[i] > 0) weights[i] *= factor(i);
    sum += weights[i];
  }
  if (sum <= 0) return;
  for (let i = 0; i < players.length; i++) weights[i] *= total / sum;
  // Each pass limits at least one more player, so this always finishes.
  for (let pass = 0; pass <= players.length; pass++) {
    let excess = 0;
    let room = 0;
    for (let i = 0; i < players.length; i++) {
      if (weights[i] > cap) {
        excess += weights[i] - cap;
        weights[i] = cap;
      } else if (weights[i] < cap) {
        room += weights[i];
      }
    }
    if (excess <= 0 || room <= 0) break;
    for (let i = 0; i < players.length; i++) {
      if (weights[i] < cap) weights[i] *= 1 + excess / room;
    }
  }
  let running = rng();
  let handedOut = 0;
  for (let i = 0; i < players.length; i++) {
    running += weights[i];
    const upTo = Math.floor(running);
    out[i * statCount + statIndex] = upTo - handedOut;
    handedOut = upTo;
  }
}

// What a stat's swing still needs after an effect that already moved it (a
// player's minutes move his points too). Swings add up like squares.
function remainingSwing(total: number, already: number): number {
  return Math.sqrt(Math.max(0, total * total - already * already));
}

// ---------- NBA ----------

const NBA_KEYS = LEAGUES.nba.playerStats.map((s) => s.key);
// How much a player's stat swings from game to game, if we have no figure of
// his own (see PlayerInput.swing).
const NBA_SWING: Record<string, number> = { min: 0.25, pts: 0.45, reb: 0.55, ast: 0.65, fg3: 0.9, stl: 1, blk: 1.2 };

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
  // How big each player's role is tonight (foul trouble, hot hand...): his
  // minutes, which move all his other stats too.
  const swing = (i: number, key: string) => side.players[i].swing[key] ?? NBA_SWING[key];
  const role = side.players.map((_, i) => (active[i] ? wobble(rng, swing(i, "min")) : 0));
  NBA_KEYS.forEach((key, s) => {
    const factor = (i: number) =>
      key === "min" ? role[i] : role[i] * wobble(rng, remainingSwing(swing(i, key), swing(i, "min")));
    const cap = key === "min" ? STAT_CAP.min * extraTime : STAT_CAP[key];
    distribute(side.players, active, key, totals[key], factor, stats, s, statCount, rng, cap);
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
// How much a player's stat swings from game to game, if we have no figure of
// his own (see PlayerInput.swing), and how much of a quarterback's swing comes
// from his team simply scoring more or less.
const NFL_SWING: Record<string, number> = { passYds: 0.3, rushYds: 0.8, rec: 0.6, recYds: 0.7 };
const SCORING_SWING = 0.17;
// How lopsided a player's carries and catches are: each play's share of his
// yards is drawn as (random)^shape, so a higher shape means a few big plays
// and many short ones. Runs are lopsided, catches more even. First fitted to
// 400 real games' longest plays (given each player's real carries, catches and
// yards), then nudged so the ranges cover about 80% of this season's games.
const RUN_SHAPE = 1.3;
const CATCH_SHAPE = 0.7;
const CARRIES_SWING = 0.35; // carries for the same yards vary from game to game
// For a player whose own figure we don't know.
const YARDS_PER_CARRY = 4.3;
const YARDS_PER_CATCH = 10.5;

// The longest of `plays` plays that together gained `yards`.
function longestPlay(rng: Rng, plays: number, yards: number, shape: number): number {
  let sum = 0;
  let longest = 0;
  for (let k = 0; k < plays; k++) {
    const size = Math.pow(-Math.log(1 - rng()), shape);
    sum += size;
    if (size > longest) longest = size;
  }
  return sum > 0 ? Math.round((yards * longest) / sum) : Math.round(yards / plays);
}

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
  const swing = (i: number, key: string) => players[i].swing[key] ?? NFL_SWING[key];

  // nflLineup left exactly one quarterback active.
  const qb = players.findIndex((p, i) => active[i] && isQuarterback(p));
  const passSwing = remainingSwing(qb >= 0 ? swing(qb, "passYds") : NFL_SWING.passYds, SCORING_SWING);
  const passYards = Math.round(Math.min(STAT_CAP.passYds, usual("passYds") * flow * wobble(rng, passSwing)));
  const rushYards = Math.round(usual("rushYds") * flow * wobble(rng, 0.25));
  const receptions = usual("rec") * Math.sqrt(flow) * wobble(rng, 0.12);
  if (qb >= 0) {
    set(qb, "passYds", passYards);
    set(qb, "int", poisson(rng, usual("int", 0.8) * wobble(rng, 0.3)));
  }

  // Receivers: each gets a "target share" for the day, which sets his
  // catches. The passing yards then go out per catch, by each player's usual
  // yards per catch with a swing of their own (so no yards without a catch).
  const targetShare = players.map((_, i) => (active[i] ? wobble(rng, swing(i, "rec")) : 0));
  distribute(players, active, "rec", receptions, (i) => targetShare[i], stats, NFL_INDEX.rec, statCount, rng);
  const catchYards = players.map((p, i) => {
    const catches = stats[i * statCount + NFL_INDEX.rec];
    const { rec = 0, recYds = 0 } = p.avg;
    const perCatch = rec > 0 && recYds > 0 ? Math.min(25, Math.max(3, recYds / rec)) : YARDS_PER_CATCH;
    return catches * perCatch;
  });
  const yardsFactor = (i: number) => wobble(rng, remainingSwing(swing(i, "recYds"), swing(i, "rec")));
  distribute(players, active, "recYds", passYards, yardsFactor, stats, NFL_INDEX.recYds, statCount, rng, undefined, Float64Array.from(catchYards));
  const rushFactor = (i: number) => wobble(rng, swing(i, "rushYds"));
  distribute(players, active, "rushYds", rushYards, rushFactor, stats, NFL_INDEX.rushYds, statCount, rng);

  // Longest run and catch: split each player's yards into his carries (from
  // his usual yards per carry) and catches, and keep the biggest play.
  for (let i = 0; i < players.length; i++) {
    if (!active[i]) continue;
    const at = (key: string) => stats[i * statCount + NFL_INDEX[key]];
    const runYards = at("rushYds");
    if (runYards > 0) {
      const { rushYds = 0, rushAtt = 0 } = players[i].avg;
      const perCarry = rushAtt > 0 && rushYds > 0 ? Math.min(10, Math.max(2, rushYds / rushAtt)) : YARDS_PER_CARRY;
      const carries = Math.max(1, Math.round((runYards / perCarry) * wobble(rng, CARRIES_SWING)));
      set(i, "rushLng", longestPlay(rng, carries, runYards, RUN_SHAPE));
    }
    if (at("rec") > 0 && at("recYds") > 0) set(i, "recLng", longestPlay(rng, at("rec"), at("recYds"), CATCH_SHAPE));
  }

  // Hand out each touchdown: a pass (QB + a receiver) or a run.
  for (let t = 0; t < drive.touchdowns; t++) {
    if (qb >= 0 && rng() < side.passTdShare) {
      add(qb, "passTd");
      const receiver = pickWeighted(
        rng,
        players.map((p, i) =>
          active[i] ? (p.avg.recTd ?? 0) * targetShare[i] + stats[i * statCount + NFL_INDEX.recYds] / 150 : 0,
        ),
      );
      if (receiver >= 0) add(receiver, "recTd");
    } else {
      const runner = pickWeighted(
        rng,
        players.map((p, i) => (active[i] ? (p.avg.rushTd ?? 0) + stats[i * statCount + NFL_INDEX.rushYds] / 100 : 0)),
      );
      if (runner >= 0) add(runner, "rushTd");
    }
  }

  return { score: drive.points, active, stats, touchdowns: drive.touchdowns, fieldGoals: drive.fieldGoals };
}
