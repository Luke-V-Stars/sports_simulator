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
  // Chance he gets into the game when healthy, from how often he has lately
  // (1 = every game; a deep-bench player might be 0.3).
  rolePct: number;
  // NFL depth chart spot: 1 = starter, 2 = first backup... (if listed).
  depth?: number;
  // Back from a long absence: 1 = first game back, 2 = second... (only while
  // his workload is still eased, see RUST_WORKLOAD). avg is already lowered.
  returning?: number;
  injury?: { status: string; detail?: string };
  gamesPlayed: number; // games in our sample that he played in
  // His per-game averages when he plays. Keys match LEAGUES[league].playerStats
  // plus helpers: passAtt, rushAtt, tgt (NFL).
  avg: Record<string, number>;
  // Points his team loses when he sits out (beyond what backups make up).
  impact: number;
  // How much of him is already in the team's expected points (0-1): the
  // share of the team's rated games he played. Playing adds the rest of his
  // impact; sitting takes this share away.
  ratedShare: number;
  // NFL only: a stand-in "backup QB" used when no quarterback is available.
  replacement?: boolean;
}

// A change to a team's expected points from game conditions (rest, weather).
export interface Adjustment {
  label: string; // "Back-to-back (2nd night)"
  points: number; // added to this team's expected points
}

export interface SideInput {
  team: Team;
  // From team ratings plus `adjustments`, before lineup changes (injuries,
  // players returning), which each simulated game applies itself.
  expectedPoints: number;
  adjustments: Adjustment[];
  avgPoints: number; // average points in the games we sampled players from
  teamAvg: Record<string, number>; // team totals per game (e.g. passing yards)
  allowedAvg: Record<string, number>; // what its defense allows per game
  // Multipliers on this team's totals from the opponent's defense, e.g.
  // { passYds: 1.06 }. A missing key means 1 (no change).
  matchup: Record<string, number>;
  passTdShare: number; // NFL: share of touchdowns that are passing touchdowns
  players: PlayerInput[];
}

export interface MatchupInput {
  league: LeagueId;
  postseason: boolean; // no ties in the playoffs
  home: SideInput;
  away: SideInput;
}
