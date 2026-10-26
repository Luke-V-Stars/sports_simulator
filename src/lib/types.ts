// Shapes of the data used across the site. ESPN's raw responses are large
// and messy; lib/espn.ts converts them into these smaller, tidy shapes.

import type { LeagueId } from "./leagues";

export interface Team {
  id: string;
  abbr: string;
  name: string; // "Philadelphia Eagles"
  shortName: string; // "Eagles"
  logo: string;
  color?: string;
}

export interface GameSide {
  team: Team;
  score: number | null; // null before the game starts
  record?: string; // "5-2"
}

export type GameState = "pre" | "in" | "post";

export interface Game {
  id: string;
  league: LeagueId;
  date: string; // ISO date-time of tip-off / kickoff
  seasonYear: number;
  seasonType: number; // 1 preseason, 2 regular season, 3 playoffs, 5 play-in
  neutralSite: boolean;
  state: GameState;
  completed: boolean;
  statusText: string; // "Final", "Q3 4:12", "Mon 7:00 PM EDT"
  home: GameSide;
  away: GameSide;
  venue?: string;
  broadcast?: string;
  // Betting line from ESPN's odds provider, e.g. { favorite: "DAL", line: 4.5 }
  vegas?: VegasLine;
}

export interface VegasLine {
  favoriteAbbr: string;
  spread: number; // points the favorite is expected to win by
  overUnder?: number; // expected combined points
  provider?: string;
}

export interface Scoreboard {
  league: LeagueId;
  seasonYear: number;
  seasonType: number;
  week?: number; // NFL only
  day?: string; // NBA only, "2026-10-26"
  weeks?: WeekOption[]; // NFL only: weeks you can pick from
  games: Game[];
}

export interface WeekOption {
  seasonType: number;
  week: number;
  label: string; // "Week 7", "Wild Card"
}

export interface Injury {
  playerId: string;
  name: string;
  position?: string;
  status: string; // "Out", "Questionable", ...
  detail?: string; // "Hamstring"
}

export interface RosterPlayer {
  id: string;
  name: string;
  position?: string;
  jersey?: string;
  headshot?: string;
  // NFL rosters put injured-reserve players in their own group.
  unavailable?: boolean;
}

// One player's line from one game's box score. Stat keys match
// LEAGUES[league].playerStats, plus a few helpers (passAtt, rushAtt, tgt).
export interface BoxScoreLine {
  playerId: string;
  name: string;
  position?: string;
  headshot?: string;
  stats: Record<string, number>;
}

export interface GameDetails {
  game: Game;
  // Player lines for each team, keyed by team id (empty before the game).
  boxScore: Record<string, BoxScoreLine[]>;
  // Injury report for each team, keyed by team id.
  injuries: Record<string, Injury[]>;
}

// How strong a team is, in points compared with an average team.
export interface TeamRating {
  teamId: string;
  offense: number; // + means scores more than average
  defense: number; // + means allows FEWER points than average
  net: number; // offense + defense: points better than average per game
}

export interface TeamSeasonStats {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
  pointsFor: number; // per game
  pointsAgainst: number; // per game
  lastFive: ("W" | "L" | "T")[]; // most recent first
}
