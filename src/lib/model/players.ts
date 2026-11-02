// Turns recent box scores into per-player averages the simulator can use.

import type { LeagueId } from "../leagues";
import type { BoxScoreLine, Injury, RosterPlayer, Team } from "../types";
import type { PlayerInput, SideInput } from "../sim/types";

export interface SampleGame {
  lines: BoxScoreLine[]; // this team's player lines from that game
  benched: string[]; // NBA: healthy players who didn't get in
  teamPoints: number;
  weight: number; // this season = 1, last season = less
}

// How likely a player is to play, given his injury status.
export function playChance(status: string): number {
  const s = status.toLowerCase();
  if (s.includes("out") || s.includes("injured reserve") || s.includes("suspen") || s.includes("physically unable")) {
    return 0;
  }
  if (s.includes("doubtful")) return 0.25;
  if (s.includes("questionable")) return 0.5;
  if (s.includes("day-to-day")) return 0.65;
  if (s.includes("probable")) return 0.9;
  return 0.75;
}

export function buildSide(args: {
  league: LeagueId;
  team: Team;
  expectedPoints: number;
  sample: SampleGame[];
  roster: RosterPlayer[];
  depth: Record<string, number>; // NFL depth chart spots (empty for NBA)
  injuries: Injury[];
}): SideInput {
  const { league, team, expectedPoints, sample, roster, depth, injuries } = args;
  const totalWeight = sample.reduce((sum, g) => sum + g.weight, 0) || 1;

  // Add up every stat, per player and for the whole team.
  const teamSums: Record<string, number> = {};
  const players = new Map<
    string,
    { line: BoxScoreLine; weight: number; games: number[]; sums: Record<string, number> }
  >();
  let pointSum = 0;
  sample.forEach((game, g) => {
    pointSum += game.weight * game.teamPoints;
    for (const line of game.lines) {
      let p = players.get(line.playerId);
      if (!p) {
        p = { line, weight: 0, games: [], sums: {} };
        players.set(line.playerId, p);
      }
      p.weight += game.weight;
      p.games.push(g);
      for (const [key, value] of Object.entries(line.stats)) {
        p.sums[key] = (p.sums[key] ?? 0) + game.weight * value;
        teamSums[key] = (teamSums[key] ?? 0) + game.weight * value;
      }
    }
  });
  const teamAvg: Record<string, number> = {};
  for (const [key, sum] of Object.entries(teamSums)) teamAvg[key] = sum / totalWeight;

  const rosterById = new Map(roster.map((r) => [r.id, r]));
  const injuryById = new Map(injuries.map((i) => [i.playerId, i]));

  const inputs: PlayerInput[] = [];
  for (const [id, p] of players) {
    const rosterEntry = rosterById.get(id);
    if (!rosterEntry) continue; // traded or released since
    const avg: Record<string, number> = {};
    for (const [key, sum] of Object.entries(p.sums)) avg[key] = sum / p.weight;
    if (!isRelevant(league, avg)) continue;

    const injury = injuryById.get(id);
    const playProb = injury ? playChance(injury.status) : rosterEntry.unavailable ? 0 : 1;
    const position = rosterEntry.position ?? p.line.position;
    const role = rolePct(league, sample, p.games, id, position, depth[id]);
    inputs.push({
      id,
      name: rosterEntry.name ?? p.line.name,
      position,
      headshot: rosterEntry.headshot ?? p.line.headshot,
      playProb,
      rolePct: role,
      depth: depth[id],
      injury: injury ? { status: injury.status, detail: injury.detail } : undefined,
      gamesPlayed: p.games.length,
      avg,
      impact: playerImpact(league, avg, teamAvg) * role,
    });
  }

  if (league === "nfl") inputs.push(backupQuarterback(team, roster, depth, inputs, injuryById, teamAvg));

  inputs.sort((a, b) => importance(league, b) - importance(league, a));

  const passTd = teamSums.passTd ?? 0;
  const rushTd = teamSums.rushTd ?? 0;
  return {
    team,
    expectedPoints,
    avgPoints: pointSum / totalWeight,
    teamAvg,
    // Pulled toward the league-typical ~60% so a small sample can't say 100%.
    passTdShare: (passTd + 1.2) / (passTd + rushTd + 2),
    players: inputs,
  };
}

// How often a healthy player gets into the game. His averages only count the
// games he played, so without this a backup who had one big game would be
// treated like an every-game player.
//   NBA: games played vs. games the coach kept him on the bench. Games he
//        missed injured don't count against him.
//   NFL: box scores don't say why someone is missing, so depth-chart starters
//        (and quarterbacks, picked by depth chart in the engine) count as every
//        game. Everyone else: share of games since his first one in the sample,
//        so a player who just arrived isn't marked down for games before that.
function rolePct(
  league: LeagueId,
  sample: SampleGame[],
  games: number[], // indexes into sample (newest first) where he played
  id: string,
  position: string | undefined,
  depth: number | undefined,
): number {
  const played = games.reduce((sum, g) => sum + sample[g].weight, 0);
  if (league === "nba") {
    const benched = sample.reduce((sum, g) => sum + (g.benched.includes(id) ? g.weight : 0), 0);
    return played / (played + benched);
  }
  if (depth === 1 || position === "QB") return 1;
  const firstGame = Math.max(...games);
  const possible = sample.slice(0, firstGame + 1).reduce((sum, g) => sum + g.weight, 0);
  return played / possible;
}

// Skip players who barely see the field.
function isRelevant(league: LeagueId, avg: Record<string, number>): boolean {
  if (league === "nba") return (avg.min ?? 0) >= 4;
  return (avg.passAtt ?? 0) >= 1 || (avg.rushAtt ?? 0) >= 0.5 || (avg.tgt ?? 0) >= 0.5 || (avg.rec ?? 0) >= 0.3;
}

// Rough points a team loses when this player sits (backups fill most of it).
function playerImpact(league: LeagueId, avg: Record<string, number>, teamAvg: Record<string, number>): number {
  if (league === "nba") return 0.2 * (avg.pts ?? 0);
  const passShare = (avg.passYds ?? 0) / Math.max(1, teamAvg.passYds ?? 0);
  const scrimmage = (avg.rushYds ?? 0) + (avg.recYds ?? 0);
  const teamScrimmage = Math.max(1, (teamAvg.rushYds ?? 0) + (teamAvg.recYds ?? 0));
  return 6 * passShare + 4 * Math.max(0, scrimmage) / teamScrimmage;
}

function importance(league: LeagueId, p: PlayerInput): number {
  if (p.replacement) return -1;
  if (league === "nba") return p.avg.min ?? 0;
  // Quarterbacks first, then by yards from scrimmage.
  return (p.avg.passAtt ?? 0) * 100 + (p.avg.rushYds ?? 0) + (p.avg.recYds ?? 0);
}

// The simulator needs someone to throw passes if the starting QB is out.
function backupQuarterback(
  team: Team,
  roster: RosterPlayer[],
  depth: Record<string, number>,
  players: PlayerInput[],
  injuries: Map<string, Injury>,
  teamAvg: Record<string, number>,
): PlayerInput {
  const known = new Set(players.map((p) => p.id));
  const backup = roster
    .filter((r) => {
      const injury = injuries.get(r.id);
      const healthy = !r.unavailable && (!injury || playChance(injury.status) > 0);
      return r.position === "QB" && !known.has(r.id) && healthy;
    })
    .sort((a, b) => (depth[a.id] ?? 99) - (depth[b.id] ?? 99))[0];
  return {
    id: backup?.id ?? `${team.id}-backup-qb`,
    name: backup?.name ?? "Backup QB",
    position: "QB",
    headshot: backup?.headshot,
    playProb: 1,
    rolePct: 1,
    depth: backup && depth[backup.id],
    gamesPlayed: 0,
    avg: { passAtt: 30, int: teamAvg.int ?? 0.8, rushYds: 5 },
    impact: 0,
    replacement: true,
  };
}
