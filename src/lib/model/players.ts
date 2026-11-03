// Turns recent box scores into per-player averages the simulator can use.

import type { LeagueId } from "../leagues";
import type { BoxScoreLine, Injury, RosterPlayer, Team } from "../types";
import type { Adjustment, PlayerInput, SideInput } from "../sim/types";

export interface SampleGame {
  id: string;
  lines: BoxScoreLine[]; // this team's player lines from that game
  benched: string[]; // NBA: healthy players who didn't get in
  teamPoints: number;
  weight: number; // this season = 1, last season = less
}

// For a regular who missed some of the team's recent games (injured, or just
// traded here): his own games from ESPN's game log.
export interface PlayerHistory {
  extra: { stats: Record<string, number>; weight: number }[]; // added to his averages
  played: { id: string; date: string; teamId: string }[]; // every recent game he played (any team), newest first
}

// One of the team's finished games, weighted the way the team ratings weigh it.
export interface TeamGame {
  id: string;
  date: string;
  weight: number;
}

// A team game a player missed counts toward a "long absence" from this many
// in a row (about 3 weeks either way).
const LONG_ABSENCE: Record<LeagueId, number> = { nfl: 3, nba: 8 };
// Share of his usual workload in his 1st, 2nd... game back from a long
// absence (teams ease players back in). An estimate, not measured.
export const RUST_WORKLOAD = [0.75, 0.9];

// Players who are part of the regular rotation: NFL starters plus the No. 2
// running back; NBA top two at each position.
export function isRegular(league: LeagueId, position: string | undefined, depth: number | undefined): boolean {
  if (depth === undefined) return false;
  if (league === "nba") return depth <= 2;
  return depth === 1 || (position === "RB" && depth === 2);
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
  depth: Record<string, number>; // depth chart spots
  injuries: Injury[];
  history: Record<string, PlayerHistory>;
  teamGames: TeamGame[]; // the team's finished games, newest first
  gameDate: string; // the game being simulated
  adjustments?: Adjustment[]; // rest, weather: added to expectedPoints
}): SideInput {
  const { league, team, sample, roster, depth, injuries, history, teamGames, gameDate, adjustments = [] } = args;
  const expectedPoints = args.expectedPoints + adjustments.reduce((sum, a) => sum + a.points, 0);
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

  // Regulars who missed games: add their own games from elsewhere (only to
  // their averages; the team totals stay this team's real games).
  for (const [id, h] of Object.entries(history)) {
    const r = rosterById.get(id);
    if (!r || h.extra.length === 0) continue;
    let p = players.get(id);
    if (!p) {
      const line = { playerId: id, name: r.name, position: r.position, headshot: r.headshot, stats: {} };
      p = { line, weight: 0, games: [], sums: {} };
      players.set(id, p);
    }
    for (const game of h.extra) {
      p.weight += game.weight;
      for (const [key, value] of Object.entries(game.stats)) {
        p.sums[key] = (p.sums[key] ?? 0) + game.weight * value;
      }
    }
  }

  const inputs: PlayerInput[] = [];
  for (const [id, p] of players) {
    const rosterEntry = rosterById.get(id);
    if (!rosterEntry) continue; // traded or released since
    const avg: Record<string, number> = {};
    for (const [key, sum] of Object.entries(p.sums)) avg[key] = sum / p.weight;
    if (!isRelevant(league, avg)) continue;

    // Back from a long absence: expect a lighter workload at first.
    const back = history[id] && gamesBack(league, history[id].played, teamGames, gameDate);
    const returning = back !== undefined && back < RUST_WORKLOAD.length ? back + 1 : undefined;
    if (returning) {
      for (const key of Object.keys(avg)) avg[key] *= RUST_WORKLOAD[returning - 1];
    }

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
      returning,
      injury: injury ? { status: injury.status, detail: injury.detail } : undefined,
      gamesPlayed: p.games.length + (history[id]?.extra.length ?? 0),
      avg,
      impact: playerImpact(league, avg, teamAvg),
      ratedShare: ratedShare(team.id, sample, p.games, history[id], teamGames),
    });
  }

  if (league === "nfl") {
    // Only one quarterback plays, so his value is the starter's alone: a
    // backup filling in doesn't add points on top.
    const qbs = inputs.filter((p) => p.position === "QB");
    const starter = qbs.sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99) || importance(league, b) - importance(league, a))[0];
    for (const p of qbs) if (p !== starter) p.impact = 0;
    inputs.push(backupQuarterback(team, roster, depth, inputs, injuryById, teamAvg));
  }

  inputs.sort((a, b) => importance(league, b) - importance(league, a));

  const passTd = teamSums.passTd ?? 0;
  const rushTd = teamSums.rushTd ?? 0;
  return {
    team,
    expectedPoints,
    adjustments,
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
//   NFL: box scores don't say why someone is missing, so regulars (see
//        isRegular) and quarterbacks (picked by depth chart in the engine) count as every
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
  if (games.length === 0) return 1; // a regular back from injury or new to the team
  const played = games.reduce((sum, g) => sum + sample[g].weight, 0);
  if (league === "nba") {
    const benched = sample.reduce((sum, g) => sum + (g.benched.includes(id) ? g.weight : 0), 0);
    return played / (played + benched);
  }
  if (isRegular(league, position, depth) || position === "QB") return 1;
  const firstGame = Math.max(...games);
  const possible = sample.slice(0, firstGame + 1).reduce((sum, g) => sum + g.weight, 0);
  return played / possible;
}

// How many games he has played since his last long absence (0 = this is his
// first game back), or undefined if he hasn't had one lately. An absence is
// counted in the team's games, so the offseason doesn't count, and a player
// traded here (still playing for his old team) isn't treated as absent.
function gamesBack(
  league: LeagueId,
  played: PlayerHistory["played"],
  teamGames: TeamGame[],
  gameDate: string,
): number | undefined {
  // played[k - 1] is newer than played[k]; check the stretch between them.
  // (Dates are compared as times: ESPN writes them in different formats.)
  const team = teamGames.map((g) => Date.parse(g.date));
  for (let k = 0; k < Math.min(RUST_WORKLOAD.length, played.length); k++) {
    const newer = Date.parse(k === 0 ? gameDate : played[k - 1].date);
    const older = Date.parse(played[k].date);
    const missed = team.filter((d) => d < newer && d > older).length;
    if (missed >= LONG_ABSENCE[league]) return k;
  }
  return undefined;
}

// How much of this player is already in the team's expected points: the share
// of the team's rated games he played, weighted like the ratings. A starter
// who has played every game is fully "in" (1); one back from a two-month
// injury is mostly not, so his return lifts the team.
//
// Only games since his first one with this team count. A player who just
// arrived doesn't lift the team: we can't see who he replaced (players who
// left aren't on the roster any more), and the rating catches up as he plays.
function ratedShare(
  teamId: string,
  sample: SampleGame[],
  games: number[], // indexes into sample (newest first) where he played
  history: PlayerHistory | undefined,
  teamGames: TeamGame[], // newest first
): number {
  // Games he played for this team. (Both teams share a game's id, so his
  // games against us for another team must not count.)
  const forUs = history?.played.filter((g) => g.teamId === teamId).map((g) => g.id) ?? [];
  const playedIds = new Set([...games.map((g) => sample[g].id), ...forUs]);
  // Without his game log we only know the sample since he first appeared in
  // it; assume earlier games went the same way.
  const known = new Set(sample.slice(0, Math.max(-1, ...games) + 1).map((g) => g.id));
  const knownTotal = sample.filter((g) => known.has(g.id)).reduce((sum, g) => sum + g.weight, 0);
  const usual = knownTotal ? games.reduce((sum, g) => sum + sample[g].weight, 0) / knownTotal : 1;

  const first = teamGames.findLastIndex((g) => playedIds.has(g.id)); // his oldest game with us
  const counted = history ? teamGames.slice(0, first + 1) : teamGames;
  let played = 0;
  let total = 0;
  for (const g of counted) {
    const share = history || known.has(g.id) ? (playedIds.has(g.id) ? 1 : 0) : usual;
    played += g.weight * share;
    total += g.weight;
  }
  return total ? played / total : 1;
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
    ratedShare: 0,
    depth: backup && depth[backup.id],
    gamesPlayed: 0,
    avg: { passAtt: 30, int: teamAvg.int ?? 0.8, rushYds: 5 },
    impact: 0,
    replacement: true,
  };
}
