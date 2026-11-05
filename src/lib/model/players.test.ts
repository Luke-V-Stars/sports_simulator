import { describe, expect, it } from "vitest";
import type { LeagueId } from "../leagues";
import type { BoxScoreLine, Injury, RosterPlayer } from "../types";
import {
  buildSide,
  injuriesAtKickoff,
  playerSwing,
  playChance,
  RUST_WORKLOAD,
  type PlayerHistory,
  type SampleGame,
  type TeamGame,
} from "./players";

// ---------- Helpers to build small, made-up teams ----------

const TEAM = { id: "1", abbr: "TST", name: "Test Team", shortName: "Test", logo: "" };

function line(playerId: string, stats: Record<string, number>, position?: string): BoxScoreLine {
  return { playerId, name: `Player ${playerId}`, position, stats };
}

// Team games, newest first, one week (NFL) or two days (NBA) apart.
function sampleGames(count: number, lines: (g: number) => BoxScoreLine[], benched: (g: number) => string[] = () => []) {
  return Array.from({ length: count }, (_, g): SampleGame => ({
    id: `g${g}`,
    lines: lines(g),
    oppLines: [],
    benched: benched(g),
    teamPoints: 100,
    weight: 1,
  }));
}

function daysAgo(days: number): string {
  return new Date(Date.UTC(2026, 10, 1) - days * 86_400_000).toISOString();
}
const GAME_DATE = daysAgo(0);

function build(
  league: LeagueId,
  args: {
    sample: SampleGame[];
    roster: RosterPlayer[];
    depth?: Record<string, number>;
    injuries?: Injury[];
    history?: Record<string, PlayerHistory>;
    teamGames?: TeamGame[];
  },
) {
  return buildSide({
    league,
    team: TEAM,
    expectedPoints: 100,
    depth: {},
    injuries: [],
    history: {},
    teamGames: [],
    gameDate: GAME_DATE,
    ...args,
  });
}

const roster = (...players: [string, string?][]): RosterPlayer[] =>
  players.map(([id, position]) => ({ id, name: `Player ${id}`, position }));

const player = (side: ReturnType<typeof build>, id: string) => side.players.find((p) => p.id === id);

// ---------- Tests ----------

describe("playChance", () => {
  it("turns injury statuses into a chance of playing", () => {
    expect(playChance("Out")).toBe(0);
    expect(playChance("Injured Reserve")).toBe(0);
    expect(playChance("Doubtful")).toBe(0.25);
    expect(playChance("Questionable")).toBe(0.5);
    expect(playChance("Day-To-Day")).toBe(0.65);
  });
});

describe("NBA bench roles", () => {
  const nba = { min: 20, pts: 10 };

  it("counts games the coach kept him on the bench", () => {
    // Played 7 of 10, coach's decision in the other 3.
    const sample = sampleGames(
      10,
      (g) => (g < 7 ? [line("bench", nba)] : []),
      (g) => (g >= 7 ? ["bench"] : []),
    );
    const side = build("nba", { sample, roster: roster(["bench"]) });
    expect(player(side, "bench")?.rolePct).toBeCloseTo(0.7);
  });

  it("doesn't count games he missed injured", () => {
    // Played 5 of 10; absent (not benched) from the rest.
    const sample = sampleGames(10, (g) => (g < 5 ? [line("star", nba)] : []));
    const side = build("nba", { sample, roster: roster(["star"]) });
    expect(player(side, "star")?.rolePct).toBe(1);
  });
});

describe("NBA deep-bench roles", () => {
  const nba = { min: 8, pts: 3 };

  it("counts games a non-regular was simply absent from", () => {
    // Newest first: played 0, 2, 4 and absent from 1 and 3 since first appearing.
    const sample = sampleGames(10, (g) => ([0, 2, 4].includes(g) ? [line("deep", nba)] : []));
    const side = build("nba", { sample, roster: roster(["deep"]), depth: { deep: 3 } });
    expect(player(side, "deep")?.rolePct).toBeCloseTo(3 / 5);
  });

  it("doesn't count absences against a regular (he was hurt)", () => {
    const sample = sampleGames(10, (g) => ([0, 2, 4].includes(g) ? [line("reg", nba)] : []));
    const side = build("nba", { sample, roster: roster(["reg"]), depth: { reg: 1 } });
    expect(player(side, "reg")?.rolePct).toBe(1);
  });
});

describe("playerSwing", () => {
  const games = (...points: number[]) => points.map((pts) => ({ pts }));

  it("makes small roles swing more, relative to their average, than big ones", () => {
    const star = playerSwing("nba", { pts: 28 }, []).pts;
    const bench = playerSwing("nba", { pts: 5 }, []).pts;
    expect(bench).toBeGreaterThan(star);
  });

  it("rises for a streaky player and falls for a steady one with the same average", () => {
    const steady = playerSwing("nba", { pts: 15 }, games(15, 15, 15, 15, 15, 15, 15, 15, 15, 15)).pts;
    const streaky = playerSwing("nba", { pts: 15 }, games(0, 30, 0, 30, 0, 30, 0, 30, 0, 30)).pts;
    const unknown = playerSwing("nba", { pts: 15 }, []).pts;
    expect(steady).toBeLessThan(unknown);
    expect(streaky).toBeGreaterThan(unknown);
  });

  it("ignores his own spread with only a couple of games", () => {
    expect(playerSwing("nba", { pts: 15 }, games(0, 30))).toEqual(playerSwing("nba", { pts: 15 }, []));
  });

  it("stays within limits for a player with almost no production", () => {
    const { blk } = playerSwing("nba", { blk: 0.01 }, []);
    expect(blk).toBeGreaterThan(0);
    expect(blk).toBeLessThanOrEqual(1.5);
  });
});

describe("NFL roles", () => {
  const wr = { rec: 4, recYds: 50, tgt: 6 };

  it("treats depth-chart regulars as every-game players", () => {
    const sample = sampleGames(8, (g) => (g % 2 === 0 ? [line("wr1", wr, "WR")] : []));
    const side = build("nfl", { sample, roster: roster(["wr1", "WR"]), depth: { wr1: 1 } });
    expect(player(side, "wr1")?.rolePct).toBe(1);
  });

  it("gives other players their share of games since they first appeared", () => {
    // Newest first: appeared in games 0 and 2, first appearance game 3 -> 3 of 4.
    const sample = sampleGames(8, (g) => ([0, 2, 3].includes(g) ? [line("wr5", wr, "WR")] : []));
    const side = build("nfl", { sample, roster: roster(["wr5", "WR"]), depth: { wr5: 3 } });
    expect(player(side, "wr5")?.rolePct).toBeCloseTo(0.75);
  });

  it("drops players no longer on the roster", () => {
    const sample = sampleGames(8, () => [line("gone", wr, "WR")]);
    const side = build("nfl", { sample, roster: [] });
    expect(player(side, "gone")).toBeUndefined();
  });

  it("always adds a stand-in backup quarterback", () => {
    const sample = sampleGames(8, () => [line("qb", { passAtt: 30, passYds: 240 }, "QB")]);
    const side = build("nfl", { sample, roster: roster(["qb", "QB"]) });
    expect(side.players.filter((p) => p.replacement)).toHaveLength(1);
  });
});

describe("players returning from a long absence", () => {
  const rb = { rushAtt: 15, rushYds: 70, rec: 2, recYds: 15, tgt: 3 };
  // The team played every week; its newest 8 games are the sample (g0-g7).
  const teamGames = Array.from({ length: 16 }, (_, i) => ({ id: `g${i}`, date: daysAgo(7 + 7 * i), weight: 1 }));
  const playedTeamGames = (...indexes: number[]) =>
    indexes.map((i) => ({ id: teamGames[i].id, date: teamGames[i].date, teamId: TEAM.id }));
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const extra = Array.from({ length: 8 }, () => ({ stats: rb, weight: 1 }));
  const args = { sample: sampleGames(8, () => []), roster: roster(["rb1", "RB"]), depth: { rb1: 1 }, teamGames };

  it("adds a regular with no recent games and eases his first game back", () => {
    // Last played for this team 10 weeks ago.
    const history: Record<string, PlayerHistory> = { rb1: { extra, played: playedTeamGames(...range(10, 15)) } };
    const rb1 = player(build("nfl", { ...args, history }), "rb1");
    expect(rb1?.returning).toBe(1);
    expect(rb1?.rolePct).toBe(1);
    expect(rb1?.avg.rushYds).toBeCloseTo(70 * RUST_WORKLOAD[0]);
    // The team rating mostly reflects games without him.
    expect(rb1?.ratedShare).toBeCloseTo(6 / 16);
  });

  it("eases less in his second game back, then not at all", () => {
    const second = { extra, played: playedTeamGames(0, ...range(10, 15)) };
    const third = { extra, played: playedTeamGames(0, 1, ...range(10, 15)) };
    expect(player(build("nfl", { ...args, history: { rb1: second } }), "rb1")?.returning).toBe(2);
    expect(player(build("nfl", { ...args, history: { rb1: third } }), "rb1")?.returning).toBeUndefined();
  });

  it("doesn't treat the offseason as an absence", () => {
    // Played every team game; the long offseason has no team games in it.
    const history = { rb1: { extra, played: playedTeamGames(...range(0, 15)) } };
    const rb1 = player(build("nfl", { ...args, history }), "rb1");
    expect(rb1?.returning).toBeUndefined();
    expect(rb1?.ratedShare).toBe(1);
  });

  it("doesn't treat a trade as an absence, or as a lift for his new team", () => {
    // Played every week for another team (a day before each of ours).
    const played = teamGames.map((g, i) => ({ id: `other${i}`, date: daysAgo(8 + 7 * i), teamId: "2" }));
    const rb1 = player(build("nfl", { ...args, history: { rb1: { extra, played } } }), "rb1");
    expect(rb1?.returning).toBeUndefined();
    expect(rb1?.avg.rushYds).toBeCloseTo(70);
    // We can't see who he replaced, so he doesn't move the team's score.
    expect(rb1?.ratedShare).toBe(1);
  });

  it("counts only games since he joined the team", () => {
    // Joined 6 weeks ago (other team before that, including a game against
    // us, which shares our game's id), then hurt for 3 weeks.
    const played = [
      ...playedTeamGames(3, 4, 5),
      ...Array.from({ length: 8 }, (_, i) => ({ id: `other${i}`, date: daysAgo(50 + 7 * i), teamId: "2" })),
      { id: teamGames[10].id, date: teamGames[10].date, teamId: "2" },
    ];
    const rb1 = player(build("nfl", { ...args, history: { rb1: { extra, played } } }), "rb1");
    expect(rb1?.ratedShare).toBeCloseTo(3 / 6);
    expect(rb1?.returning).toBe(1);
  });
});

describe("how much of a player is in the team rating", () => {
  const wr = { rec: 4, recYds: 50, tgt: 6 };
  const teamGames = Array.from({ length: 16 }, (_, i) => ({ id: `g${i}`, date: daysAgo(7 + 7 * i), weight: 1 }));

  it("is everything for a player who always plays", () => {
    const sample = sampleGames(8, () => [line("wr1", wr, "WR")]);
    const side = build("nfl", { sample, roster: roster(["wr1", "WR"]), depth: { wr1: 1 }, teamGames });
    expect(player(side, "wr1")?.ratedShare).toBe(1);
  });

  it("assumes older games went like recent ones when we have no game log", () => {
    const sample = sampleGames(8, (g) => (g % 2 ? [line("wr1", wr, "WR")] : []));
    const side = build("nfl", { sample, roster: roster(["wr1", "WR"]), depth: { wr1: 1 }, teamGames });
    expect(player(side, "wr1")?.ratedShare).toBeCloseTo(0.5);
  });

  it("doesn't count sample games from before a player first showed up", () => {
    // Newest 3 games only (arrived recently): fully part of the team since.
    const sample = sampleGames(8, (g) => (g < 3 ? [line("wr9", wr, "WR")] : []));
    const side = build("nfl", { sample, roster: roster(["wr9", "WR"]), depth: { wr9: 3 }, teamGames });
    expect(player(side, "wr9")?.ratedShare).toBe(1);
  });

  it("gives backup quarterbacks no value of their own", () => {
    const sample = sampleGames(8, (g) => [
      line("qb1", { passAtt: 34, passYds: 250 }, "QB"),
      ...(g === 0 ? [line("qb2", { passAtt: 8, passYds: 60 }, "QB")] : []),
    ]);
    const side = build("nfl", { sample, roster: roster(["qb1", "QB"], ["qb2", "QB"]), depth: { qb1: 1, qb2: 2 } });
    expect(player(side, "qb1")?.impact).toBeGreaterThan(5);
    expect(player(side, "qb2")?.impact).toBe(0);
  });
});

describe("injuriesAtKickoff", () => {
  const kickoff = "2026-10-01T17:00Z";
  const before = "2026-09-28T12:00Z";
  const after = "2026-10-20T12:00Z";
  const rosterPlayer = (id: string, injury?: { status: string; date?: string }, unavailable = false): RosterPlayer => ({
    id,
    name: `Player ${id}`,
    position: "WR",
    unavailable,
    injury,
  });

  it("uses the full roster, not just the game page's five", () => {
    const roster = ["a", "b", "c", "d", "e", "f"].map((id) => rosterPlayer(id, { status: "Out", date: before }));
    const reported: Injury[] = ["a", "b", "c", "d", "e"].map((id) => ({
      playerId: id,
      name: `Player ${id}`,
      status: "Out",
      detail: "Ankle",
      date: before,
    }));
    const { injuries } = injuriesAtKickoff(roster, reported, kickoff);
    expect(injuries.map((i) => i.playerId).sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(injuries.find((i) => i.playerId === "a")?.detail).toBe("Ankle"); // details kept
  });

  it("leaves out injury news from after kickoff", () => {
    const roster = [rosterPlayer("old", { status: "Out", date: before }), rosterPlayer("new", { status: "Out", date: after })];
    const { injuries } = injuriesAtKickoff(roster, [], kickoff);
    expect(injuries.map((i) => i.playerId)).toEqual(["old"]);
  });

  it("counts a player put on injured reserve after kickoff as available", () => {
    const roster = [
      rosterPlayer("earlyIR", { status: "Injured Reserve", date: before }, true),
      rosterPlayer("lateIR", { status: "Injured Reserve", date: after }, true),
    ];
    const result = injuriesAtKickoff(roster, [], kickoff);
    expect(result.roster.find((r) => r.id === "earlyIR")?.unavailable).toBe(true);
    expect(result.roster.find((r) => r.id === "lateIR")?.unavailable).toBe(false);
  });

  it("keeps everything for an upcoming game", () => {
    const roster = [rosterPlayer("a", { status: "Questionable", date: before })];
    expect(injuriesAtKickoff(roster, [], "2026-12-01T18:00Z").injuries).toHaveLength(1);
  });
});
