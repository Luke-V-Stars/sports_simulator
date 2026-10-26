"use client";

// Shows ONE simulated game like a real box score, plus a running tally of
// every single game you've played so far.

import type { LeagueId } from "@/lib/leagues";
import type { BoxLine, SingleGame } from "@/lib/sim/summary";

interface Props {
  league: LeagueId;
  games: SingleGame[]; // newest first
  homeAbbr: string;
  awayAbbr: string;
  onPlay: () => void;
}

export function SingleGamePanel({ league, games, homeAbbr, awayAbbr, onPlay }: Props) {
  const latest = games[0];
  const homeWins = games.filter((g) => !g.tie && g.homeScore > g.awayScore).length;
  const awayWins = games.filter((g) => !g.tie && g.awayScore > g.homeScore).length;
  const ties = games.filter((g) => g.tie).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">Play the game once and see a full box score. Each click is a new game.</p>
        <button
          type="button"
          onClick={onPlay}
          className="rounded-md border border-edge bg-surface-2 px-3 py-1.5 text-sm font-medium hover:border-axis"
        >
          {games.length ? "Play another game" : "Play one game"}
        </button>
      </div>

      {latest && (
        <>
          <div className="flex items-center justify-center gap-6 rounded-lg bg-surface-2 py-4">
            <ScoreBlock abbr={awayAbbr} score={latest.awayScore} won={latest.awayScore > latest.homeScore} color="var(--away)" />
            <span className="text-sm text-muted">
              {latest.tie ? "Final · Tie" : latest.overtimes > 0 ? `Final · ${otLabel(latest.overtimes)}` : "Final"}
            </span>
            <ScoreBlock abbr={homeAbbr} score={latest.homeScore} won={latest.homeScore > latest.awayScore} color="var(--home)" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TeamBox league={league} abbr={awayAbbr} lines={latest.away} scoring={latest.awayScoring} />
            <TeamBox league={league} abbr={homeAbbr} lines={latest.home} scoring={latest.homeScoring} />
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <p className="text-sm">
              <span className="font-semibold">Your games so far: </span>
              {awayAbbr} {awayWins} – {homeAbbr} {homeWins}
              {ties ? ` – ${ties} tie${ties > 1 ? "s" : ""}` : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {games.slice(0, 30).map((g, i) => (
                <span key={games.length - i} className="tabular rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-2">
                  {g.awayScore}–{g.homeScore}
                  {g.overtimes > 0 ? " OT" : ""}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function otLabel(n: number) {
  return n === 1 ? "OT" : `${n}OT`;
}

function ScoreBlock({ abbr, score, won, color }: { abbr: string; score: number; won: boolean; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="flex items-center gap-1.5 text-sm text-ink-2">
        <span className="size-2 rounded-sm" style={{ background: color }} aria-hidden />
        {abbr}
      </span>
      <span className={`tabular text-4xl ${won ? "font-semibold" : "text-ink-2"}`}>{score}</span>
    </div>
  );
}

function TeamBox({
  league,
  abbr,
  lines,
  scoring,
}: {
  league: LeagueId;
  abbr: string;
  lines: BoxLine[];
  scoring?: { touchdowns: number; fieldGoals: number };
}) {
  if (league === "nba") {
    const top = [...lines].sort((a, b) => b.stats.pts - a.stats.pts).slice(0, 8);
    return (
      <div>
        <h4 className="mb-1 text-sm font-semibold">{abbr}</h4>
        <table className="tabular w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-1 text-left font-normal">Player</th>
              <th className="py-1 text-right font-normal">MIN</th>
              <th className="py-1 text-right font-normal">PTS</th>
              <th className="py-1 text-right font-normal">REB</th>
              <th className="py-1 text-right font-normal">AST</th>
              <th className="py-1 text-right font-normal">3PM</th>
            </tr>
          </thead>
          <tbody>
            {top.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="py-1">{l.name}</td>
                <td className="py-1 text-right text-ink-2">{l.stats.min}</td>
                <td className="py-1 text-right font-medium">{l.stats.pts}</td>
                <td className="py-1 text-right">{l.stats.reb}</td>
                <td className="py-1 text-right">{l.stats.ast}</td>
                <td className="py-1 text-right">{l.stats.fg3}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // NFL: a short summary of who did what.
  const passer = lines.filter((l) => l.stats.passYds > 0).sort((a, b) => b.stats.passYds - a.stats.passYds)[0];
  const rushers = lines.filter((l) => l.stats.rushYds > 0).sort((a, b) => b.stats.rushYds - a.stats.rushYds).slice(0, 2);
  const receivers = lines.filter((l) => l.stats.recYds > 0).sort((a, b) => b.stats.recYds - a.stats.recYds).slice(0, 3);
  const td = (n: number) => (n ? `, ${n} TD` : "");
  return (
    <div className="flex flex-col gap-1 text-sm">
      <h4 className="font-semibold">{abbr}</h4>
      {scoring && (
        <p className="text-ink-2">
          {scoring.touchdowns} touchdown{scoring.touchdowns === 1 ? "" : "s"}, {scoring.fieldGoals} field goal
          {scoring.fieldGoals === 1 ? "" : "s"}
        </p>
      )}
      {passer && (
        <p>
          <span className="text-muted">Passing: </span>
          {passer.name} {passer.stats.passYds} yds{td(passer.stats.passTd)}
          {passer.stats.int ? `, ${passer.stats.int} INT` : ""}
        </p>
      )}
      {rushers.length > 0 && (
        <p>
          <span className="text-muted">Rushing: </span>
          {rushers.map((r) => `${r.name} ${r.stats.rushYds} yds${td(r.stats.rushTd)}`).join(" · ")}
        </p>
      )}
      {receivers.length > 0 && (
        <p>
          <span className="text-muted">Receiving: </span>
          {receivers.map((r) => `${r.name} ${r.stats.rec}-${r.stats.recYds}${td(r.stats.recTd)}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
