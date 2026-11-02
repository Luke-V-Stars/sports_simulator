"use client";

// Projected stat lines for every player, from the simulations. For finished
// games, each projection also shows what the player really did.

import { pct } from "@/lib/format";
import { LEAGUES, type LeagueId, type StatDef } from "@/lib/leagues";
import { checkRange } from "@/lib/sim/compare";
import type { PlayerProjection } from "@/lib/sim/summary";
import type { BoxScoreLine } from "@/lib/types";
import { InjuryBadge } from "../InjuryBadge";
import { RangeMark } from "./ResultCheck";

interface Group {
  title: string;
  keys: string[];
  include: (p: PlayerProjection) => boolean;
  limit: number;
}

// NFL players are split into passing / rushing / receiving tables.
const NFL_GROUPS: Group[] = [
  { title: "Passing", keys: ["passYds", "passTd", "int"], include: (p) => p.stats.passYds.mean >= 20, limit: 2 },
  { title: "Rushing", keys: ["rushYds", "rushTd"], include: (p) => p.stats.rushYds.mean >= 3, limit: 5 },
  { title: "Receiving", keys: ["rec", "recYds", "recTd"], include: (p) => p.stats.rec.mean >= 0.5, limit: 7 },
];

const NBA_GROUPS: Group[] = [
  {
    title: "Players",
    keys: LEAGUES.nba.playerStats.map((s) => s.key),
    include: (p) => p.playPct > 0,
    limit: 13,
  },
];

interface Props {
  league: LeagueId;
  players: PlayerProjection[];
  actual?: BoxScoreLine[]; // finished games: this team's real box score
}

export function PlayerTables({ league, players, actual }: Props) {
  const defs = new Map(LEAGUES[league].playerStats.map((s) => [s.key, s]));
  const groups = league === "nfl" ? NFL_GROUPS : NBA_GROUPS;
  // Healthy backups who never got in (e.g. the No. 2 QB) aren't listed.
  const sittingOut = players.filter((p) => p.out);
  const tables = groups.map((group) => ({
    group,
    rows: players
      .filter((p) => p.playPct > 0 && group.include(p))
      .sort((a, b) => b.stats[group.keys[0]].mean - a.stats[group.keys[0]].mean)
      .slice(0, group.limit),
  }));

  const actualById = actual && new Map(actual.map((line) => [line.playerId, line]));
  // NBA box scores list everyone who played; NFL ones only list players with stats.
  const missingLabel = league === "nba" ? "DNP" : "–";

  // How many of the shown stats landed inside the projected range.
  let inside = 0;
  let checked = 0;
  for (const { group, rows } of tables) {
    for (const p of rows) {
      const line = actualById?.get(p.id);
      if (!line) continue;
      for (const key of group.keys) {
        checked++;
        if (checkRange(line.stats[key] ?? 0, p.stats[key].low, p.stats[key].high) === "inside") inside++;
      }
    }
  }

  // Players who really played but weren't in the projection (or were expected to sit).
  const projected = new Set(players.filter((p) => p.playPct > 0).map((p) => p.id));
  const surprises = (actual ?? [])
    .filter((line) => !projected.has(line.playerId))
    .map((line) => ({ name: line.name, note: surpriseNote(league, line) }))
    .filter((s) => s.note);

  return (
    <div className="flex flex-col gap-5">
      {tables.map(({ group, rows }) => {
        if (rows.length === 0) return null;
        return (
          <div key={group.title} className="overflow-x-auto">
            {groups.length > 1 && <h4 className="mb-1 text-sm font-semibold">{group.title}</h4>}
            <table className="tabular w-full min-w-[520px] text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-1.5 pr-2 text-left font-normal">Player</th>
                  <th className="px-2 py-1.5 text-right font-normal" title="Share of simulations he played in">
                    Plays
                  </th>
                  {group.keys.map((key) => (
                    <th key={key} className="px-2 py-1.5 text-right font-normal" title={defs.get(key)?.name}>
                      {defs.get(key)?.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const line = actualById?.get(p.id);
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="py-1.5 pr-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-muted">{p.position}</span>
                          {p.injury && <InjuryBadge status={p.injury.status} />}
                          {p.replacement && <span className="text-xs text-muted">(fills in if the starter sits)</span>}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right text-ink-2">{pct(p.playPct)}</td>
                      {group.keys.map((key) => (
                        <StatCell
                          key={key}
                          def={defs.get(key)!}
                          stat={p.stats[key]}
                          actual={actualById ? (line ? (line.stats[key] ?? 0) : null) : undefined}
                          missingLabel={missingLabel}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {sittingOut.length > 0 && (
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">Not expected to play: </span>
          {sittingOut.map((p) => `${p.name} (${p.injury?.status ?? "inactive"})`).join(", ")}
        </p>
      )}
      {surprises.length > 0 && (
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">Played, but not in the projection: </span>
          {surprises.map((s) => `${s.name} (${s.note})`).join(", ")}
        </p>
      )}
      {actualById && checked > 0 && (
        <p className="text-sm">
          <span className="font-semibold">{inside} of {checked} </span>
          real stats ({pct(inside / checked)}) landed inside the projected range. If the ranges are about right, that
          should happen roughly 8 times in 10.
        </p>
      )}
      <p className="text-xs text-muted">
        Big number = average when he plays. Small numbers = a quiet game to a big game (10th to 90th percentile).
        {actualById && (
          <>
            {" "}
            Bottom number = what really happened: <RangeMark range="inside" /> inside the range,{" "}
            <RangeMark range="above" /> above it, <RangeMark range="below" /> below it.{" "}
            {league === "nba" ? "DNP = did not play." : "– = no stats in the real box score."}
          </>
        )}
      </p>
    </div>
  );
}

// actual: undefined = nothing to compare yet; null = he isn't in the real box score.
function StatCell({
  def,
  stat,
  actual,
  missingLabel,
}: {
  def: StatDef;
  stat: { mean: number; low: number; high: number };
  actual?: number | null;
  missingLabel: string;
}) {
  return (
    <td className="px-2 py-1.5 text-right">
      <div className="font-medium">{stat.mean.toFixed(def.decimals)}</div>
      <div className="text-[11px] text-muted">
        {stat.low.toFixed(0)}–{stat.high.toFixed(0)}
      </div>
      {actual === null && <div className="text-[11px] text-muted">{missingLabel}</div>}
      {actual !== null && actual !== undefined && (
        <div className="text-[11px] font-semibold">
          <RangeMark range={checkRange(actual, stat.low, stat.high)} /> {actual}
        </div>
      )}
    </td>
  );
}

// "24 PTS" / "61 yds", or nothing if he barely played.
function surpriseNote(league: LeagueId, line: BoxScoreLine): string | undefined {
  if (league === "nba") return (line.stats.min ?? 0) >= 10 ? `${line.stats.pts ?? 0} PTS` : undefined;
  const yards = (line.stats.passYds ?? 0) + (line.stats.rushYds ?? 0) + (line.stats.recYds ?? 0);
  return yards >= 20 ? `${yards} yds` : undefined;
}
