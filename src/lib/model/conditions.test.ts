import { describe, expect, it } from "vitest";
import type { LeagueId } from "../leagues";
import type { Game, Team } from "../types";
import { restAdjustments, weatherAdjustments } from "./conditions";

const team = (id: string): Team => ({ id, abbr: id.toUpperCase(), name: id, shortName: id, logo: "" });

function game(league: LeagueId, home: string, away: string, date: string): Game {
  return {
    id: `${home}-${away}-${date}`,
    league,
    date,
    seasonYear: 2026,
    seasonType: 2,
    neutralSite: false,
    state: "post",
    completed: true,
    statusText: "Final",
    home: { team: team(home), score: 100 },
    away: { team: team(away), score: 90 },
  };
}

const sum = (adjustments: { points: number }[]) => adjustments.reduce((s, a) => s + a.points, 0);

describe("NBA rest", () => {
  it("costs the team on the 2nd night of a back-to-back and helps its opponent", () => {
    const today = game("nba", "bos", "nyk", "2026-11-03T00:00Z");
    const previous = [game("nba", "nyk", "mia", "2026-11-02T00:00Z"), game("nba", "bos", "chi", "2026-10-31T00:00Z")];
    const rest = restAdjustments("nba", today, previous);
    expect(sum(rest.away)).toBe(-1);
    expect(sum(rest.home)).toBe(1);
  });

  it("cancels out when both teams played last night", () => {
    const today = game("nba", "bos", "nyk", "2026-11-03T00:00Z");
    const previous = [game("nba", "nyk", "mia", "2026-11-02T00:00Z"), game("nba", "chi", "bos", "2026-11-02T00:30Z")];
    const rest = restAdjustments("nba", today, previous);
    expect(sum(rest.home)).toBe(0);
    expect(sum(rest.away)).toBe(0);
  });

  it("ignores the offseason", () => {
    const today = game("nba", "bos", "nyk", "2026-10-21T00:00Z");
    const lastSeason = [game("nba", "nyk", "bos", "2026-05-01T00:00Z")];
    expect(restAdjustments("nba", today, lastSeason)).toEqual({ home: [], away: [] });
  });
});

describe("NFL rest", () => {
  it("costs a team on a short week (Sunday to Thursday)", () => {
    const today = game("nfl", "gb", "chi", "2026-11-13T01:15Z");
    const previous = [game("nfl", "chi", "det", "2026-11-08T18:00Z"), game("nfl", "gb", "min", "2026-11-08T18:00Z")];
    const rest = restAdjustments("nfl", today, previous);
    // Both teams on a short week: no edge either way.
    expect(sum(rest.home)).toBe(0);
    expect(rest.home.map((a) => a.label)).toContain("Short week (4 days' rest)");
  });

  it("helps a team coming off a bye", () => {
    const today = game("nfl", "sea", "lv", "2026-11-15T21:05Z");
    const previous = [game("nfl", "sea", "chi", "2026-11-02T01:20Z"), game("nfl", "lv", "den", "2026-11-08T21:05Z")];
    const rest = restAdjustments("nfl", today, previous);
    expect(sum(rest.home)).toBe(0.5);
    expect(sum(rest.away)).toBe(-0.5);
  });
});

describe("weather", () => {
  it("leaves calm, mild games alone", () => {
    expect(weatherAdjustments({ tempF: 60, windMph: 8, precipMm: 0 })).toEqual([]);
    expect(weatherAdjustments(undefined)).toEqual([]);
  });

  it("takes points off for wind, rain or snow, and cold", () => {
    expect(sum(weatherAdjustments({ tempF: 60, windMph: 20, precipMm: 0 }))).toBeCloseTo(-1.5);
    expect(sum(weatherAdjustments({ tempF: 60, windMph: 50, precipMm: 0 }))).toBe(-3); // capped
    expect(sum(weatherAdjustments({ tempF: 15, windMph: 5, precipMm: 2 }))).toBeCloseTo(-1.25);
  });
});
