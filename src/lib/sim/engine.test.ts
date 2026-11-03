import { describe, expect, it } from "vitest";
import type { LeagueId } from "../leagues";
import { playGame } from "./engine";
import { makeRng } from "./random";
import type { MatchupInput, PlayerInput, SideInput } from "./types";

// ---------- Helpers to build small, made-up matchups ----------

function p(id: string, overrides: Partial<PlayerInput> = {}): PlayerInput {
  return { id, name: id, playProb: 1, rolePct: 1, gamesPlayed: 8, avg: {}, impact: 0, ratedShare: 1, ...overrides };
}

const qb = (id: string, depth: number, extra: Partial<PlayerInput> = {}) =>
  p(id, { position: "QB", depth, avg: { passAtt: 32, passYds: 230 }, impact: 5, ...extra });
const standIn = p("standin", { position: "QB", replacement: true, avg: { passAtt: 30 } });
const rb = p("rb", { position: "RB", avg: { rushYds: 70, rushTd: 0.5 } });
const wr = p("wr", { position: "WR", avg: { rec: 5, recYds: 70, recTd: 0.4 } });

function side(players: PlayerInput[], expectedPoints = 22): SideInput {
  return {
    team: { id: players[0]?.id ?? "t", abbr: "T", name: "T", shortName: "T", logo: "" },
    expectedPoints,
    adjustments: [],
    avgPoints: expectedPoints,
    teamAvg: { passYds: 230, rushYds: 110, rec: 21, int: 0.8, reb: 44, ast: 25, fg3: 13, stl: 8, blk: 5 },
    allowedAvg: {},
    matchup: {},
    passTdShare: 0.6,
    players,
  };
}

function matchup(league: LeagueId, home: PlayerInput[], away: PlayerInput[] = home): MatchupInput {
  const points = league === "nba" ? 112 : 22;
  return { league, postseason: false, home: side(home, points), away: side(away, points) };
}

// Plays `runs` games and counts how often each home player played.
function playRate(input: MatchupInput, runs = 4000) {
  const rng = makeRng(7);
  const counts = new Map<string, number>();
  const qbsPerGame = new Set<number>();
  for (let r = 0; r < runs; r++) {
    const game = playGame(input, rng);
    let qbs = 0;
    input.home.players.forEach((pl, i) => {
      if (!game.home.active[i]) return;
      counts.set(pl.id, (counts.get(pl.id) ?? 0) + 1);
      if (pl.position === "QB") qbs++;
    });
    qbsPerGame.add(qbs);
  }
  return { rate: (id: string) => (counts.get(id) ?? 0) / runs, qbsPerGame };
}

// ---------- Tests ----------

describe("NFL quarterbacks", () => {
  it("plays exactly one, the top healthy one on the depth chart", () => {
    const { rate, qbsPerGame } = playRate(matchup("nfl", [qb("qb1", 1), qb("qb2", 2), standIn, rb, wr]));
    expect([...qbsPerGame]).toEqual([1]);
    expect(rate("qb1")).toBe(1);
    expect(rate("qb2")).toBe(0);
  });

  it("starts the backup when the starter is out", () => {
    const { rate } = playRate(matchup("nfl", [qb("qb1", 1, { playProb: 0 }), qb("qb2", 2), standIn, rb, wr]));
    expect(rate("qb2")).toBe(1);
  });

  it("uses the stand-in when no quarterback is available", () => {
    const { rate, qbsPerGame } = playRate(matchup("nfl", [qb("qb1", 1, { playProb: 0 }), standIn, rb, wr]));
    expect(rate("standin")).toBe(1);
    expect([...qbsPerGame]).toEqual([1]);
  });

  it("splits a questionable starter's games with the backup", () => {
    const { rate } = playRate(matchup("nfl", [qb("qb1", 1, { playProb: 0.5 }), qb("qb2", 2), standIn, rb, wr]));
    expect(rate("qb1")).toBeCloseTo(0.5, 1);
    expect(rate("qb2")).toBeCloseTo(0.5, 1);
  });
});

describe("who plays", () => {
  it("bench players get in about as often as their role", () => {
    const bench = p("bench", { rolePct: 0.3, avg: { min: 8, pts: 3 } });
    const starters = ["a", "b", "c", "d", "e"].map((id) => p(id, { avg: { min: 34, pts: 18 } }));
    const { rate } = playRate(matchup("nba", [...starters, bench]));
    expect(rate("bench")).toBeCloseTo(0.3, 1);
    expect(rate("a")).toBe(1);
  });

});

describe("expected points follow the lineup", () => {
  const avgScore = (extra: PlayerInput) => {
    const starters = ["a", "b", "c", "d"].map((id) => p(id, { avg: { min: 34, pts: 18 } }));
    const input = matchup("nba", [...starters, extra]);
    const rng = makeRng(3);
    let total = 0;
    for (let r = 0; r < 4000; r++) total += playGame(input, rng).home.score;
    return total / 4000;
  };
  const star = (overrides: Partial<PlayerInput>) => p("star", { avg: { min: 36, pts: 30 }, impact: 6, ...overrides });
  const baseline = avgScore(star({ impact: 0 }));

  it("a star who always plays changes nothing; sitting him costs his impact", () => {
    expect(avgScore(star({}))).toBeCloseTo(baseline, 0);
    expect(baseline - avgScore(star({ playProb: 0 }))).toBeCloseTo(6, 0);
  });

  it("a star out for weeks and still out costs little (the rating already lacks him)", () => {
    expect(baseline - avgScore(star({ playProb: 0, ratedShare: 0.1 }))).toBeCloseTo(0.6, 0);
  });

  it("a star back from a long absence lifts the team", () => {
    expect(avgScore(star({ ratedShare: 0.25 })) - baseline).toBeCloseTo(4.5, 0);
  });

  it("a bench player who plays as often as before changes nothing on average", () => {
    const bench = p("bench", { avg: { min: 10, pts: 4 }, impact: 2, rolePct: 0.3, ratedShare: 0.3 });
    expect(avgScore(bench)).toBeCloseTo(baseline, 0);
  });
});
