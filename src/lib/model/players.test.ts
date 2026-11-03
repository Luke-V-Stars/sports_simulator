import { describe, expect, it } from "vitest";
import type { LeagueId } from "../leagues";
import type { BoxScoreLine, Injury, RosterPlayer } from "../types";
import { buildSide, playChance, RUST_WORKLOAD, type PlayerHistory, type SampleGame } from "./players";

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
    teamDates?: string[];
  },
) {
  return buildSide({
    league,
    team: TEAM,
    expectedPoints: 100,
    depth: {},
    injuries: [],
    history: {},
    teamDates: [],
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
  const weekly = (count: number, startDaysAgo: number) =>
    Array.from({ length: count }, (_, i) => daysAgo(startDaysAgo + 7 * i));
  const teamDates = weekly(16, 7); // the team played every week

  it("adds a regular with no recent games and eases his first game back", () => {
    const sample = sampleGames(8, () => [line("rb2", { rushAtt: 10, rushYds: 40 }, "RB")]);
    const history: Record<string, PlayerHistory> = {
      // Last played 10 weeks ago.
      rb1: { extra: Array.from({ length: 8 }, () => ({ stats: rb, weight: 0.5 })), dates: weekly(8, 70) },
    };
    const side = build("nfl", {
      sample,
      roster: roster(["rb1", "RB"], ["rb2", "RB"]),
      depth: { rb1: 1, rb2: 2 },
      history,
      teamDates,
    });
    const rb1 = player(side, "rb1");
    expect(rb1?.returning).toBe(1);
    expect(rb1?.rolePct).toBe(1);
    expect(rb1?.avg.rushYds).toBeCloseTo(70 * RUST_WORKLOAD[0]);
  });

  it("eases less in his second game back, then not at all", () => {
    const sample = sampleGames(8, () => []);
    const extra = Array.from({ length: 8 }, () => ({ stats: rb, weight: 1 }));
    // Played last week after a long gap...
    const secondGame = { extra, dates: [daysAgo(7), ...weekly(7, 70)] };
    // ...or the last two weeks.
    const thirdGame = { extra, dates: [daysAgo(7), daysAgo(14), ...weekly(6, 70)] };
    const args = { sample, roster: roster(["rb1", "RB"]), depth: { rb1: 1 }, teamDates };
    expect(player(build("nfl", { ...args, history: { rb1: secondGame } }), "rb1")?.returning).toBe(2);
    expect(player(build("nfl", { ...args, history: { rb1: thirdGame } }), "rb1")?.returning).toBeUndefined();
  });

  it("doesn't treat the offseason or a trade as an absence", () => {
    const sample = sampleGames(8, () => []);
    const extra = Array.from({ length: 8 }, () => ({ stats: rb, weight: 1 }));
    // Played every week (for another team, or before a long offseason the
    // team also sat through: no team games fall in between).
    const history = { rb1: { extra, dates: weekly(8, 7) } };
    const side = build("nfl", { sample, roster: roster(["rb1", "RB"]), depth: { rb1: 1 }, history, teamDates });
    expect(player(side, "rb1")?.returning).toBeUndefined();
    expect(player(side, "rb1")?.avg.rushYds).toBeCloseTo(70);
  });
});
