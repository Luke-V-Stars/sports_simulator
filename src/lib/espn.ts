// Everything that talks to ESPN lives in this file.
//
// ESPN's public JSON endpoints are free and need no API key, but they are
// unofficial and undocumented. Keeping all of them here means that if ESPN
// changes something (or we switch to a paid data provider), this is the only
// file that has to change.
//
// Each exported function starts with "use cache": Next.js remembers the result
// and reuses it until the cacheLife() time runs out, so we don't ask ESPN for
// the same data on every page load.

import { cacheLife } from "next/cache";
import { LEAGUES, type LeagueId } from "./leagues";
import type {
  BoxScoreLine,
  Game,
  GameDetails,
  GameState,
  Injury,
  PlayerGame,
  RosterPlayer,
  Scoreboard,
  Team,
  VegasLine,
  WeekOption,
} from "./types";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
// Per-player pages (game logs) live on a different host.
const WEB_BASE = "https://site.web.api.espn.com/apis/common/v3/sports";

// ---------- Raw ESPN shapes (only the fields we read) ----------

interface RawTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName?: string;
  name?: string;
  color?: string;
  logo?: string;
  logos?: { href: string }[];
}

interface RawCompetitor {
  homeAway: "home" | "away";
  score?: string | { value?: number; displayValue?: string };
  team: RawTeam;
  records?: { type?: string; summary?: string }[];
  record?: { type?: string; summary?: string; displayValue?: string }[];
}

interface RawStatus {
  type: { state: GameState; completed: boolean; shortDetail?: string; detail?: string };
}

interface RawCompetition {
  date: string;
  neutralSite?: boolean;
  competitors: RawCompetitor[];
  status?: RawStatus;
  venue?: { fullName?: string };
  broadcast?: string;
  odds?: RawOdds[];
}

interface RawOdds {
  details?: string;
  overUnder?: number;
  provider?: { name?: string };
}

interface RawEvent {
  id: string;
  date: string;
  season: { year: number; type: number };
  status: RawStatus;
  competitions: RawCompetition[];
}

interface RawScoreboard {
  season?: { year: number; type: number };
  week?: { number: number };
  day?: { date: string };
  leagues?: { calendar?: unknown[]; season?: { year: number; type: number } }[];
  events: RawEvent[];
}

interface RawAthlete {
  id: string;
  displayName: string;
  position?: { abbreviation?: string };
  headshot?: { href?: string };
  jersey?: string;
}

interface RawBoxCategory {
  name?: string;
  keys: string[];
  athletes: { athlete: RawAthlete; stats: string[]; didNotPlay?: boolean; reason?: string }[];
}

interface RawSummary {
  header: {
    id: string;
    season: { year: number; type: number };
    competitions: (RawCompetition & { id: string })[];
  };
  gameInfo?: { venue?: { fullName?: string } };
  pickcenter?: RawOdds[];
  boxscore?: { players?: { team: { id: string }; statistics: RawBoxCategory[] }[] };
  injuries?: {
    team: { id: string };
    injuries: { athlete: RawAthlete; status: string; details?: { type?: string; detail?: string } }[];
  }[];
}

// ---------- Helpers ----------

async function espnJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`ESPN request failed (${res.status}): ${url}`);
  }
  return (await res.json()) as T;
}

function parseTeam(raw: RawTeam): Team {
  return {
    id: raw.id,
    abbr: raw.abbreviation,
    name: raw.displayName,
    shortName: raw.shortDisplayName ?? raw.name ?? raw.displayName,
    logo: raw.logo ?? raw.logos?.[0]?.href ?? "",
    color: raw.color,
  };
}

function parseScore(score: RawCompetitor["score"]): number | null {
  if (score === undefined || score === null) return null;
  const value = typeof score === "string" ? Number(score) : (score.value ?? Number(score.displayValue));
  return Number.isFinite(value) ? value : null;
}

// "DAL -4.5" -> { favoriteAbbr: "DAL", spread: 4.5 }. "EVEN" -> spread 0.
function parseVegas(odds: RawOdds | undefined): VegasLine | undefined {
  if (!odds?.details) return undefined;
  const match = odds.details.match(/^([A-Z]{2,4})\s+(-?\d+(\.\d+)?)$/);
  if (match) {
    return {
      favoriteAbbr: match[1],
      spread: Math.abs(Number(match[2])),
      overUnder: odds.overUnder,
      provider: odds.provider?.name,
    };
  }
  if (odds.details.toUpperCase() === "EVEN") {
    return { favoriteAbbr: "", spread: 0, overUnder: odds.overUnder, provider: odds.provider?.name };
  }
  return undefined;
}

function parseCompetition(
  league: LeagueId,
  id: string,
  season: { year: number; type: number },
  comp: RawCompetition,
  status: RawStatus,
): Game {
  const side = (homeAway: "home" | "away") => {
    const c = comp.competitors.find((x) => x.homeAway === homeAway)!;
    // ESPN calls this "records" on scoreboards and "record" on game pages,
    // and older games sometimes have a single value instead of a list.
    const raw: unknown = c.records ?? c.record;
    const records = (Array.isArray(raw) ? raw : []) as { type?: string; summary?: string }[];
    const total = records.find((r) => r.type === "total") ?? records[0];
    return {
      team: parseTeam(c.team),
      score: status.type.state === "pre" ? null : parseScore(c.score),
      record: total?.summary,
    };
  };
  return {
    id,
    league,
    date: comp.date,
    seasonYear: season.year,
    seasonType: season.type,
    neutralSite: Boolean(comp.neutralSite),
    state: status.type.state,
    completed: status.type.completed,
    statusText: status.type.shortDetail ?? status.type.detail ?? "",
    home: side("home"),
    away: side("away"),
    venue: comp.venue?.fullName,
    broadcast: comp.broadcast,
    vegas: parseVegas(comp.odds?.[0]),
  };
}

function parseEvent(league: LeagueId, e: RawEvent): Game {
  return parseCompetition(league, e.id, e.season, e.competitions[0], e.status);
}

// Runs `fn` over `items`, at most `limit` at a time (so we don't flood ESPN).
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------- Public functions ----------

export async function getTeams(league: LeagueId): Promise<Team[]> {
  "use cache";
  cacheLife("days");
  const data = await espnJson<{ sports: { leagues: { teams: { team: RawTeam }[] }[] }[] }>(
    `${BASE}/${LEAGUES[league].espnPath}/teams`,
  );
  return data.sports[0].leagues[0].teams.map((t) => parseTeam(t.team));
}

export interface ScoreboardQuery {
  date?: string; // NBA: "20261026"
  seasonYear?: number; // NFL
  seasonType?: number; // NFL
  week?: number; // NFL
}

// Games for one day (NBA) or one week (NFL). With no query, ESPN picks
// "today" / "this week".
export async function getScoreboard(league: LeagueId, query: ScoreboardQuery = {}): Promise<Scoreboard> {
  "use cache";
  cacheLife("live");
  const params = new URLSearchParams();
  if (query.date) params.set("dates", query.date);
  if (query.week) {
    if (query.seasonYear) params.set("dates", String(query.seasonYear));
    params.set("seasontype", String(query.seasonType ?? 2));
    params.set("week", String(query.week));
  }
  const data = await espnJson<RawScoreboard>(
    `${BASE}/${LEAGUES[league].espnPath}/scoreboard?${params.toString()}`,
  );
  // When you ask for a specific date, ESPN leaves out "season" and "day".
  const season = data.season ?? data.leagues?.[0]?.season ?? data.events[0]?.season ?? { year: 0, type: 2 };
  const day = data.day?.date ?? (query.date ? `${query.date.slice(0, 4)}-${query.date.slice(4, 6)}-${query.date.slice(6)}` : undefined);
  return {
    league,
    seasonYear: season.year,
    seasonType: season.type,
    week: data.week?.number,
    day,
    weeks: league === "nfl" ? parseWeeks(data) : undefined,
    games: data.events.map((e) => parseEvent(league, e)).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function parseWeeks(data: RawScoreboard): WeekOption[] {
  const calendar = (data.leagues?.[0]?.calendar ?? []) as {
    value?: string;
    entries?: { value: string; label: string }[];
  }[];
  const weeks: WeekOption[] = [];
  for (const part of calendar) {
    const seasonType = Number(part.value);
    if (seasonType !== 2 && seasonType !== 3) continue; // skip preseason / offseason
    for (const entry of part.entries ?? []) {
      // ESPN lists the Pro Bowl as a postseason "week"; it isn't a real game.
      if (/pro bowl/i.test(entry.label)) continue;
      weeks.push({ seasonType, week: Number(entry.value), label: entry.label });
    }
  }
  return weeks;
}

// The season ESPN currently considers "current", e.g. { year: 2027, type: 2 }.
export async function getCurrentSeason(league: LeagueId): Promise<{ year: number; type: number }> {
  "use cache";
  cacheLife("hours");
  const data = await espnJson<RawScoreboard>(`${BASE}/${LEAGUES[league].espnPath}/scoreboard`);
  const season = data.season ?? data.leagues?.[0]?.season ?? data.events[0]?.season;
  if (!season) throw new Error(`ESPN didn't say which ${LEAGUES[league].name} season is current.`);
  return { year: season.year, type: season.type };
}

// Every game in one calendar month ("202610" = October 2026).
export async function getMonthGames(league: LeagueId, month: string): Promise<Game[]> {
  "use cache";
  const data = await espnJson<RawScoreboard>(
    `${BASE}/${LEAGUES[league].espnPath}/scoreboard?dates=${month}&limit=1000`,
  );
  const games = data.events.map((e) => parseEvent(league, e));
  // Finished months never change, so keep them longer.
  const anyDone = games.some((g) => g.completed);
  const allDone = games.length > 0 && games.every((g) => g.completed);
  if (allDone) cacheLife("days");
  else if (anyDone) cacheLife("minutes");
  else cacheLife("hours");
  return games;
}

// Full box score + injury report for one game.
export async function getGameDetails(league: LeagueId, eventId: string): Promise<GameDetails> {
  "use cache";
  const data = await espnJson<RawSummary>(`${BASE}/${LEAGUES[league].espnPath}/summary?event=${eventId}`);
  const comp = data.header.competitions[0];
  const game = parseCompetition(league, data.header.id, data.header.season, comp, comp.status!);
  game.venue = data.gameInfo?.venue?.fullName ?? game.venue;
  game.vegas = parseVegas(data.pickcenter?.[0]) ?? game.vegas;

  const boxScore: Record<string, BoxScoreLine[]> = {};
  const benched: Record<string, string[]> = {};
  for (const teamBox of data.boxscore?.players ?? []) {
    boxScore[teamBox.team.id] =
      league === "nba" ? parseNbaBox(teamBox.statistics) : parseNflBox(teamBox.statistics);
    benched[teamBox.team.id] = league === "nba" ? coachBenched(teamBox.statistics) : [];
  }

  const injuries: Record<string, Injury[]> = {};
  for (const teamInj of data.injuries ?? []) {
    injuries[teamInj.team.id] = teamInj.injuries.map((i) => ({
      playerId: i.athlete.id,
      name: i.athlete.displayName,
      position: i.athlete.position?.abbreviation,
      status: i.status,
      detail: injuryDetail(i.details?.type, i.details?.detail),
    }));
  }

  // A finished game's box score never changes.
  if (game.completed) cacheLife("max");
  else cacheLife("minutes");
  return { game, boxScore, benched, injuries };
}

// "Hamstring" + "Strain" -> "Hamstring – Strain"; drops "Not Specified" and repeats.
function injuryDetail(type?: string, detail?: string): string | undefined {
  const parts = [type, detail].filter((p): p is string => !!p && p !== "Not Specified");
  return [...new Set(parts)].join(" – ") || undefined;
}

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value.split(/[-/]/)[0]); // "3-5" -> 3 (made threes)
  return Number.isFinite(n) ? n : 0;
}

function parseNbaBox(categories: RawBoxCategory[]): BoxScoreLine[] {
  const cat = categories[0];
  if (!cat) return [];
  const col = (key: string) => cat.keys.indexOf(key);
  const columns = {
    min: col("minutes"),
    pts: col("points"),
    reb: col("rebounds"),
    ast: col("assists"),
    fg3: col("threePointFieldGoalsMade-threePointFieldGoalsAttempted"),
    stl: col("steals"),
    blk: col("blocks"),
  };
  const lines: BoxScoreLine[] = [];
  for (const a of cat.athletes) {
    if (a.didNotPlay || !a.stats?.length) continue;
    const stats: Record<string, number> = {};
    for (const [key, index] of Object.entries(columns)) {
      stats[key] = index >= 0 ? toNumber(a.stats[index]) : 0;
    }
    if (stats.min <= 0) continue;
    lines.push({
      playerId: a.athlete.id,
      name: a.athlete.displayName,
      position: a.athlete.position?.abbreviation,
      headshot: a.athlete.headshot?.href,
      stats,
    });
  }
  return lines;
}

// NBA box scores list healthy players who sat as "DNP - Coach's Decision".
// Injured players are either missing or have the injury as the reason.
function coachBenched(categories: RawBoxCategory[]): string[] {
  return (categories[0]?.athletes ?? [])
    .filter((a) => a.didNotPlay && /coach/i.test(a.reason ?? ""))
    .map((a) => a.athlete.id);
}

// NFL box scores are split into categories (passing, rushing, receiving...).
// We merge the ones we use into one line per player.
function parseNflBox(categories: RawBoxCategory[]): BoxScoreLine[] {
  const wanted: Record<string, Record<string, string>> = {
    passing: {
      passAtt: "completions/passingAttempts",
      passYds: "passingYards",
      passTd: "passingTouchdowns",
      int: "interceptions",
    },
    rushing: { rushAtt: "rushingAttempts", rushYds: "rushingYards", rushTd: "rushingTouchdowns" },
    receiving: {
      rec: "receptions",
      recYds: "receivingYards",
      recTd: "receivingTouchdowns",
      tgt: "receivingTargets",
    },
  };
  const byPlayer = new Map<string, BoxScoreLine>();
  for (const cat of categories) {
    const fields = cat.name ? wanted[cat.name] : undefined;
    if (!fields) continue;
    for (const a of cat.athletes) {
      let line = byPlayer.get(a.athlete.id);
      if (!line) {
        line = {
          playerId: a.athlete.id,
          name: a.athlete.displayName,
          position: a.athlete.position?.abbreviation,
          headshot: a.athlete.headshot?.href,
          stats: {},
        };
        byPlayer.set(a.athlete.id, line);
      }
      for (const [key, espnKey] of Object.entries(fields)) {
        const index = cat.keys.indexOf(espnKey);
        if (index < 0) continue;
        const raw = a.stats[index];
        // "24/31" completions/attempts -> we want the attempts (31)
        line.stats[key] = key === "passAtt" ? Number(raw?.split("/")[1] ?? 0) || 0 : toNumber(raw);
      }
    }
  }
  return [...byPlayer.values()];
}

export async function getRoster(league: LeagueId, teamId: string): Promise<RosterPlayer[]> {
  "use cache";
  cacheLife("hours");
  const data = await espnJson<{ athletes: (RawAthlete | { position: string; items: RawAthlete[] })[] }>(
    `${BASE}/${LEAGUES[league].espnPath}/teams/${teamId}/roster`,
  );
  const players: RosterPlayer[] = [];
  const add = (a: RawAthlete, unavailable: boolean) =>
    players.push({
      id: a.id,
      name: a.displayName,
      position: a.position?.abbreviation,
      jersey: a.jersey,
      headshot: a.headshot?.href,
      unavailable,
    });
  for (const entry of data.athletes) {
    if ("items" in entry) {
      // NFL: grouped as offense / defense / specialTeam / injuredReserveOrOut / practiceSquad ...
      if (entry.position === "practiceSquad") continue;
      const unavailable = entry.position === "injuredReserveOrOut" || entry.position === "suspended";
      for (const a of entry.items) add(a, unavailable);
    } else {
      add(entry, false); // NBA: one flat list
    }
  }
  return players;
}

// The depth-chart spots we read: NFL offense ("wr1", "wr2"... are separate
// spots) and the five NBA positions.
const DEPTH_POSITIONS: Record<LeagueId, RegExp> = {
  nfl: /^(qb|rb|wr\d*|te)$/,
  nba: /^(pg|sg|sf|pf|c)$/,
};

// Depth chart: each player's best spot (1 = starter, 2 = first backup...),
// keyed by player id.
export async function getDepthChart(league: LeagueId, teamId: string): Promise<Record<string, number>> {
  "use cache";
  cacheLife("hours");
  const data = await espnJson<{ depthchart?: { positions: Record<string, { athletes: { id: string }[] }> }[] }>(
    `${BASE}/${LEAGUES[league].espnPath}/teams/${teamId}/depthcharts`,
  );
  const depth: Record<string, number> = {};
  for (const chart of data.depthchart ?? []) {
    for (const [position, { athletes }] of Object.entries(chart.positions)) {
      if (!DEPTH_POSITIONS[league].test(position)) continue;
      athletes.forEach((a, i) => {
        depth[a.id] = Math.min(depth[a.id] ?? i + 1, i + 1);
      });
    }
  }
  return depth;
}

// Game-log column names -> our stat keys (see BoxScoreLine).
const GAME_LOG_KEYS: Record<LeagueId, Record<string, string>> = {
  nfl: {
    passingAttempts: "passAtt",
    passingYards: "passYds",
    passingTouchdowns: "passTd",
    interceptions: "int",
    rushingAttempts: "rushAtt",
    rushingYards: "rushYds",
    rushingTouchdowns: "rushTd",
    receptions: "rec",
    receivingYards: "recYds",
    receivingTouchdowns: "recTd",
    receivingTargets: "tgt",
  },
  nba: {
    minutes: "min",
    points: "pts",
    totalRebounds: "reb",
    assists: "ast",
    "threePointFieldGoalsMade-threePointFieldGoalsAttempted": "fg3",
    steals: "stl",
    blocks: "blk",
  },
};

interface RawGameLog {
  names?: string[];
  events?: Record<string, { gameDate?: string }>;
  seasonTypes?: { displayName?: string; categories?: { events?: { eventId: string; stats: string[] }[] }[] }[];
}

// One player's games in one season (any team he played for), newest first.
// Preseason games are left out.
export async function getPlayerGameLog(league: LeagueId, athleteId: string, season: number): Promise<PlayerGame[]> {
  "use cache";
  cacheLife("hours");
  const data = await espnJson<RawGameLog>(
    `${WEB_BASE}/${LEAGUES[league].espnPath}/athletes/${athleteId}/gamelog?season=${season}`,
  );
  const names = data.names ?? [];
  const keys = GAME_LOG_KEYS[league];
  const games: PlayerGame[] = [];
  for (const type of data.seasonTypes ?? []) {
    if (/preseason/i.test(type.displayName ?? "")) continue;
    for (const category of type.categories ?? []) {
      for (const e of category.events ?? []) {
        const date = data.events?.[e.eventId]?.gameDate;
        if (!date) continue;
        const stats: Record<string, number> = {};
        names.forEach((name, i) => {
          if (keys[name]) stats[keys[name]] = toNumber(e.stats[i]);
        });
        games.push({ id: e.eventId, date, stats });
      }
    }
  }
  return games.sort((a, b) => b.date.localeCompare(a.date));
}
