import { describe, expect, it } from "vitest";
import { LEAGUES, type LeagueId } from "../leagues";
import { playGame } from "./engine";
import { makeRng } from "./random";
import type { MatchupInput, PlayerInput, SideInput } from "./types";

// ---------- Helpers to build small, made-up matchups ----------

function p(id: string, overrides: Partial<PlayerInput> = {}): PlayerInput {
  return { id, name: id, playProb: 1, rolePct: 1, gamesPlayed: 8, avg: {}, swing: {}, impact: 0, ratedShare: 1, sampleShare: 1, ...overrides };
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

  it("starts a stand-in listed above the others (a rookie's first start)", () => {
    const rookie = { ...standIn, depth: 1 };
    const { rate, qbsPerGame } = playRate(matchup("nfl", [qb("vet", 2), rookie, rb, wr]));
    expect(rate("standin")).toBe(1);
    expect(rate("vet")).toBe(0);
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

describe("player stat lines", () => {
  const nbaPlayer = (id: string, position: string, min: number, pts: number, extra: Partial<PlayerInput> = {}) =>
    p(id, { position, avg: { min, pts, reb: 4, ast: 3, fg3: 1, stl: 1, blk: 0.5 }, ...extra });
  const team = () => [
    nbaPlayer("pg", "PG", 34, 22),
    nbaPlayer("sg", "SG", 30, 15),
    nbaPlayer("sf", "SF", 32, 14),
    nbaPlayer("pf", "PF", 30, 12),
    nbaPlayer("c", "C", 28, 12),
    nbaPlayer("g2", "SG", 20, 8),
    nbaPlayer("f2", "SF", 18, 6),
    nbaPlayer("c2", "C", 16, 5),
  ];
  const playMany = (players: PlayerInput[], runs = 3000) => {
    const input = matchup("nba", players);
    const rng = makeRng(11);
    return Array.from({ length: runs }, () => playGame(input, rng));
  };

  it("are whole numbers, and points add up to the team's score", () => {
    for (const game of playMany(team(), 500)) {
      expect(game.home.stats.every(Number.isInteger)).toBe(true);
      let points = 0;
      for (let i = 0; i < game.home.active.length; i++) points += game.home.stats[i * 7 + 1];
      expect(points).toBe(game.home.score);
    }
  });

  it("swing more for a player with a bigger measured swing", () => {
    const players = team();
    players[5] = { ...players[5], swing: { pts: 1 } };
    players[6] = { ...players[6], swing: { pts: 0.1 }, avg: { ...players[6].avg, pts: 8 } };
    const spread = (i: number) => {
      const values = playMany(players).map((g) => g.home.stats[i * 7 + 1]);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    };
    expect(spread(5)).toBeGreaterThan(spread(6) * 1.3);
  });

  it("never go past a realistic limit, even with huge swings", () => {
    const wild = team().map((pl) => ({ ...pl, swing: { min: 1.5, pts: 1.5 } }));
    for (const game of playMany(wild, 2000)) {
      const extraTime = 1 + (game.overtimes * 5) / 48;
      for (let i = 0; i < wild.length; i++) {
        expect(game.home.stats[i * 7]).toBeLessThanOrEqual(Math.ceil(48 * extraTime));
        expect(game.home.stats[i * 7 + 1]).toBeLessThanOrEqual(71);
      }
    }
  });

  const avgStat = (players: PlayerInput[], i: number, s: number) => {
    const games = playMany(players);
    return games.reduce((sum, g) => sum + g.home.stats[i * 7 + s], 0) / games.length;
  };

  it("give a sitting player's minutes mostly to his position", () => {
    const players = team();
    const starterOut = players.map((pl) => (pl.id === "c" ? { ...pl, playProb: 0 } : pl));
    const backupGain = avgStat(starterOut, 7, 0) / avgStat(players, 7, 0); // the backup center
    const guardGain = avgStat(starterOut, 5, 0) / avgStat(players, 5, 0); // a backup guard
    expect(backupGain).toBeGreaterThan(guardGain * 1.2);
  });

  it("don't shift anything for a player who's been out for weeks", () => {
    // The others' averages already include what they took over.
    const players = team();
    const longOut = players.map((pl) => (pl.id === "c" ? { ...pl, playProb: 0, sampleShare: 0 } : pl));
    const recentOut = players.map((pl) => (pl.id === "c" ? { ...pl, playProb: 0, sampleShare: 1 } : pl));
    expect(avgStat(recentOut, 7, 0)).toBeGreaterThan(avgStat(longOut, 7, 0) * 1.1);
  });
});

describe("NFL stat lines", () => {
  const nflTeam = [
    qb("qb1", 1),
    standIn,
    p("rb1", { position: "RB", avg: { rushAtt: 16, rushYds: 70, rushTd: 0.5, rec: 2, recYds: 15 } }),
    p("rb2", { position: "RB", avg: { rushAtt: 8, rushYds: 35, rushTd: 0.2, rec: 1, recYds: 8 } }),
    p("wr1", { position: "WR", avg: { rec: 6, recYds: 80, recTd: 0.5 } }),
    p("wr2", { position: "WR", avg: { rec: 4, recYds: 50, recTd: 0.3 } }),
    p("te1", { position: "TE", avg: { rec: 4, recYds: 40, recTd: 0.3 } }),
  ];
  const keys = LEAGUES.nfl.playerStats.map((s) => s.key);
  const stat = (side: { stats: Float64Array }, i: number, key: string) => side.stats[i * keys.length + keys.indexOf(key)];

  it("never have receiving yards without a catch, or a longest play bigger than the total", () => {
    const input = matchup("nfl", nflTeam);
    const rng = makeRng(21);
    for (let r = 0; r < 2000; r++) {
      const { home } = playGame(input, rng);
      nflTeam.forEach((_, i) => {
        const v = (key: string) => stat(home, i, key);
        if (v("recYds") !== 0) expect(v("rec")).toBeGreaterThan(0);
        expect(v("recLng")).toBeLessThanOrEqual(Math.max(0, v("recYds")));
        expect(v("rushLng")).toBeLessThanOrEqual(Math.max(0, v("rushYds")));
        // The longest of several plays is at least their average.
        if (v("rec") > 0 && v("recYds") > 0) expect(v("recLng")).toBeGreaterThanOrEqual(Math.floor(v("recYds") / v("rec")));
      });
    }
  });

  it("gives a longest run that's a sizable share of a runner's yards", () => {
    const input = matchup("nfl", nflTeam);
    const rng = makeRng(22);
    let longest = 0;
    let yards = 0;
    for (let r = 0; r < 2000; r++) {
      const { home } = playGame(input, rng);
      longest += stat(home, 2, "rushLng");
      yards += stat(home, 2, "rushYds");
    }
    // Real lead backs: the longest run is typically 15-30% of the day's yards.
    expect(longest / yards).toBeGreaterThan(0.15);
    expect(longest / yards).toBeLessThan(0.4);
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
