import { describe, expect, it } from "vitest";
import { summarizeAccuracy, type GameEvaluation, type ValueCheck } from "./compare";

function value(projected: number, actual: number, low = projected - 10, high = projected + 10): ValueCheck {
  return { projected, low, high, actual, miss: Math.abs(projected - actual), range: actual < low ? "below" : actual > high ? "above" : "inside" };
}

// A finished game: the model gave the home team `homeWin`; the real score was home-away.
function evaluation(homeWin: number, home: number, away: number, vegas?: { margin: number; total: number }): GameEvaluation {
  const winner = home > away ? "home" : home < away ? "away" : "tie";
  const projectedMargin = 3;
  const projectedTotal = 45;
  return {
    id: `${homeWin}-${home}-${away}`,
    date: "2026-10-01T17:00Z",
    homeAbbr: "HOM",
    awayAbbr: "AWY",
    homeWinPct: homeWin,
    awayWinPct: 1 - homeWin,
    check: {
      winner,
      pick: homeWin >= 0.5 ? "home" : "away",
      winnerChance: winner === "home" ? homeWin : 1 - homeWin,
      home: value(24, home),
      away: value(21, away),
      margin: value(projectedMargin, home - away),
      total: value(projectedTotal, home + away),
      vegasMarginMiss: vegas && Math.abs(vegas.margin - (home - away)),
      vegasTotalMiss: vegas && Math.abs(vegas.total - (home + away)),
    },
    vegasFavorite: vegas ? (vegas.margin > 0 ? "home" : "away") : undefined,
    players: { inside: 8, checked: 10 },
  };
}

describe("summarizeAccuracy", () => {
  const evals = [
    evaluation(0.75, 27, 20, { margin: 4, total: 44 }), // favorite won
    evaluation(0.75, 17, 24, { margin: 4, total: 44 }), // upset
    evaluation(0.55, 20, 17), // no Vegas line
    evaluation(0.3, 10, 30, { margin: -6, total: 41 }), // away favorite won
  ];
  const s = summarizeAccuracy(evals);

  it("counts winner picks for the model and for the Vegas favorite", () => {
    expect(s.picks.model).toEqual({ hits: 3, total: 4 });
    expect(s.picks.vegas).toEqual({ hits: 2, total: 3 });
  });

  it("compares margin misses with Vegas only on games that have a line", () => {
    expect(s.margin.vegasGames).toBe(3);
    // Model projected +3 every time; real margins +7, -7, -20 on the Vegas games.
    expect(s.margin.onVegasGames).toBeCloseTo((4 + 10 + 23) / 3);
    expect(s.margin.vegas).toBeCloseTo((3 + 11 + 14) / 3);
  });

  it("scores win chances (Brier) and groups them for calibration", () => {
    expect(s.brier).toBeCloseTo((0.25 ** 2 + 0.75 ** 2 + 0.45 ** 2 + 0.3 ** 2) / 4);
    const seventies = s.calibration.find((b) => b.from === 0.7)!;
    expect(seventies.games).toBe(3); // 75%, 75% and the away team's 70%
    expect(seventies.actual).toBeCloseTo(2 / 3);
  });

  it("adds up range checks", () => {
    expect(s.playersInRange).toEqual({ hits: 32, total: 40 });
    expect(s.scoresInRange.total).toBe(8);
  });

  it("leaves ties out of picks", () => {
    const tie = summarizeAccuracy([evaluation(0.6, 20, 20)]);
    expect(tie.picks.model.total).toBe(0);
    expect(tie.games).toBe(1);
  });
});
