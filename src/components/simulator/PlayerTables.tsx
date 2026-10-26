"use client";

// Projected stat lines for every player, from the simulations.

import { pct } from "@/lib/format";
import { LEAGUES, type LeagueId, type StatDef } from "@/lib/leagues";
import type { PlayerProjection } from "@/lib/sim/summary";
import { InjuryBadge } from "../InjuryBadge";

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

export function PlayerTables({ league, players }: { league: LeagueId; players: PlayerProjection[] }) {
  const defs = new Map(LEAGUES[league].playerStats.map((s) => [s.key, s]));
  const groups = league === "nfl" ? NFL_GROUPS : NBA_GROUPS;
  const sittingOut = players.filter((p) => p.playPct === 0);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => {
        const rows = players
          .filter((p) => p.playPct > 0 && group.include(p))
          .sort((a, b) => b.stats[group.keys[0]].mean - a.stats[group.keys[0]].mean)
          .slice(0, group.limit);
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
                {rows.map((p) => (
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
                      <StatCell key={key} def={defs.get(key)!} stat={p.stats[key]} />
                    ))}
                  </tr>
                ))}
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
      <p className="text-xs text-muted">
        Big number = average when he plays. Small numbers = a quiet game to a big game (10th to 90th percentile).
      </p>
    </div>
  );
}

function StatCell({ def, stat }: { def: StatDef; stat: { mean: number; low: number; high: number } }) {
  return (
    <td className="px-2 py-1.5 text-right">
      <div className="font-medium">{stat.mean.toFixed(def.decimals)}</div>
      <div className="text-[11px] text-muted">
        {stat.low.toFixed(0)}–{stat.high.toFixed(0)}
      </div>
    </td>
  );
}
