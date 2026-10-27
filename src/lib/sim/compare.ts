// Checks a finished game's projections against what really happened.

import { roundHalf } from "../format";
import type { ActualResult, VegasLine } from "../types";
import type { SimSummary } from "./summary";

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
