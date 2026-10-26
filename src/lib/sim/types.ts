// The inputs the simulator needs. The server builds these from ESPN data and
// sends them to the browser, which runs the simulations.

import type { LeagueId } from "../leagues";
import type { Team } from "../types";

export interface PlayerInput {
  id: string;
  name: string;
  position?: string;
  headshot?: string;
  // Chance the player suits up (from the injury report): 1 = healthy, 0 = out.
  playProb: number;
  injury?: { status: string; detail?: string };
  gamesPlayed: number; // games in our sample that he played in
  // His per-game averages when he plays. Keys match LEAGUES[league].playerStats
  // plus helpers: passAtt, rushAtt, tgt (NFL).
  avg: Record<string, number>;
  // Points his team loses when he sits out.
  impact: number;
  // NFL only: a stand-in "backup QB" used when no quarterback is available.
  replacement?: boolean;
}

export interface SideInput {
  team: Team;
  expectedPoints: number; // from team ratings, before injuries
  avgPoints: number; // average points in the games we sampled players from
  teamAvg: Record<string, number>; // team totals per game (e.g. passing yards)
  passTdShare: number; // NFL: share of touchdowns that are passing touchdowns
  players: PlayerInput[];
}

export interface MatchupInput {
  league: LeagueId;
  postseason: boolean; // no ties in the playoffs
  home: SideInput;
  away: SideInput;
}
