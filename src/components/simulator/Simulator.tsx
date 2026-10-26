"use client";

// The interactive part of the game page. It runs in your browser: the server
// sends the matchup inputs, and this component plays the game thousands of
// times whenever you press "Run again".

import { useCallback, useEffect, useState } from "react";
import { pct, marginText, roundHalf } from "@/lib/format";
import { newSeed } from "@/lib/sim/random";
import { playOneGame, runSimulations, type SimSummary, type SingleGame } from "@/lib/sim/summary";
import type { MatchupInput } from "@/lib/sim/types";
import type { VegasLine } from "@/lib/types";
import { MarginChart } from "../charts/MarginChart";
import { TotalsChart } from "../charts/TotalsChart";
import { WinBar } from "../WinBar";
import { PlayerTables } from "./PlayerTables";
import { SingleGamePanel } from "./SingleGamePanel";

const RUN_OPTIONS = [1_000, 10_000, 50_000];

interface Props {
  input: MatchupInput;
  vegas?: VegasLine;
  finalScore?: { home: number; away: number };
}

export function Simulator({ input, vegas, finalScore }: Props) {
  const [runs, setRuns] = useState(10_000);
  const [summary, setSummary] = useState<SimSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [singleGames, setSingleGames] = useState<SingleGame[]>([]);
  const [playerSide, setPlayerSide] = useState<"away" | "home">("away");

  const simulate = useCallback(
    (count: number) => {
      setRunning(true);
      // Wait a moment so the browser can show "Simulating…" before the
      // heavy number-crunching starts.
      setTimeout(() => {
        const start = performance.now();
        setSummary(runSimulations(input, count, newSeed()));
        setElapsedMs(performance.now() - start);
        setRunning(false);
      }, 20);
    },
    [input],
  );

  // Run once automatically when the page opens.
  useEffect(() => {
    const id = setTimeout(() => simulate(10_000), 0);
    return () => clearTimeout(id);
  }, [simulate]);

  const playOne = () => setSingleGames((prev) => [playOneGame(input, newSeed()), ...prev].slice(0, 100));

  const home = input.home.team;
  const away = input.away.team;

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-edge bg-surface p-4">
        <span className="text-sm text-ink-2">Simulated games:</span>
        <div className="flex overflow-hidden rounded-md border border-edge" role="group" aria-label="Number of simulations">
          {RUN_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRuns(n)}
              aria-pressed={runs === n}
              className={`px-3 py-1.5 text-sm ${runs === n ? "bg-ink font-semibold text-page" : "hover:bg-surface-2"}`}
            >
              {n.toLocaleString()}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => simulate(runs)}
          disabled={running}
          className="rounded-md bg-ink px-4 py-1.5 text-sm font-semibold text-page hover:opacity-90 disabled:opacity-50"
        >
          {running ? "Simulating…" : "Run again"}
        </button>
        <span className="text-xs text-muted" aria-live="polite">
          {summary && !running
            ? `Played ${summary.runs.toLocaleString()} games in ${(elapsedMs / 1000).toFixed(2)} seconds`
            : "Simulating…"}
        </span>
      </div>

      {summary && (
        <div className={`flex flex-col gap-6 transition-opacity ${running ? "opacity-50" : ""}`}>
          {/* Headline: who wins and the projected score */}
          <section className="flex flex-col gap-4 rounded-xl border border-edge bg-surface p-5">
            <h2 className="text-sm font-semibold tracking-wide text-ink-2 uppercase">Chance to win</h2>
            <WinBar awayAbbr={away.abbr} homeAbbr={home.abbr} awayWin={summary.away.winPct} homeWin={summary.home.winPct} large />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile
                label="Projected score"
                value={`${away.abbr} ${Math.round(summary.away.mean)} – ${home.abbr} ${Math.round(summary.home.mean)}`}
                note={`Typical range: ${away.abbr} ${summary.away.low}–${summary.away.high}, ${home.abbr} ${summary.home.low}–${summary.home.high}`}
              />
              <Tile
                label="Model spread"
                value={marginText(home.abbr, away.abbr, summary.meanMargin)}
                note={vegas ? `Vegas: ${vegas.spread === 0 ? "Even" : `${vegas.favoriteAbbr} by ${vegas.spread}`}` : undefined}
              />
              <Tile
                label="Combined points"
                value={String(roundHalf(summary.meanTotal))}
                note={vegas?.overUnder ? `Vegas over/under: ${vegas.overUnder}` : undefined}
              />
              <Tile
                label="Goes to overtime"
                value={pct(summary.overtimePct)}
                note={summary.tiePct > 0 ? `Ends in a tie: ${pct(summary.tiePct, 1)}` : undefined}
              />
            </div>
            {finalScore && (
              <p className="rounded-md bg-surface-2 px-3 py-2 text-sm">
                <span className="font-semibold">Actual final: </span>
                {away.abbr} {finalScore.away} – {home.abbr} {finalScore.home}. Before the game, the model gave{" "}
                {finalScore.home > finalScore.away ? home.abbr : away.abbr} a{" "}
                {pct(finalScore.home > finalScore.away ? summary.home.winPct : summary.away.winPct)} chance to win.
              </p>
            )}
          </section>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-edge bg-surface p-4">
              <h2 className="font-semibold">Margin of victory</h2>
              <p className="mb-3 text-sm text-ink-2">How often each final margin happened.</p>
              <MarginChart league={input.league} margins={summary.margins} homeAbbr={home.abbr} awayAbbr={away.abbr} />
            </section>
            <section className="rounded-xl border border-edge bg-surface p-4">
              <h2 className="font-semibold">Combined points</h2>
              <p className="mb-3 text-sm text-ink-2">Both teams&apos; points added together.</p>
              <TotalsChart totals={summary.totals} vegasTotal={vegas?.overUnder} />
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <section className="rounded-xl border border-edge bg-surface p-4">
              <h2 className="mb-3 font-semibold">Most likely final scores</h2>
              <table className="tabular w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-1.5 text-left font-normal">{away.abbr}</th>
                    <th className="py-1.5 text-left font-normal">{home.abbr}</th>
                    <th className="py-1.5 text-right font-normal">How often</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.likelyScores.map((s) => (
                    <tr key={`${s.home}-${s.away}`} className="border-b border-line last:border-0">
                      <td className={`py-1.5 ${s.away > s.home ? "font-semibold" : ""}`}>{s.away}</td>
                      <td className={`py-1.5 ${s.home > s.away ? "font-semibold" : ""}`}>{s.home}</td>
                      <td className="py-1.5 text-right">{pct(s.pct, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">
                Even the single most likely score happens only a few times in 100, which is why we look at the
                whole spread of results.
              </p>
            </section>
            <section className="rounded-xl border border-edge bg-surface p-4">
              <h2 className="mb-2 font-semibold">Play a single game</h2>
              <SingleGamePanel
                league={input.league}
                games={singleGames}
                homeAbbr={home.abbr}
                awayAbbr={away.abbr}
                onPlay={playOne}
              />
            </section>
          </div>

          {/* Player projections */}
          <section className="rounded-xl border border-edge bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Projected player stats</h2>
              <div className="flex overflow-hidden rounded-md border border-edge" role="tablist">
                {(["away", "home"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    role="tab"
                    aria-selected={playerSide === side}
                    onClick={() => setPlayerSide(side)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${
                      playerSide === side ? "bg-surface-2 font-semibold" : "hover:bg-surface-2"
                    }`}
                  >
                    <span
                      className="size-2 rounded-sm"
                      style={{ background: side === "away" ? "var(--away)" : "var(--home)" }}
                      aria-hidden
                    />
                    {input[side].team.name}
                  </button>
                ))}
              </div>
            </div>
            <PlayerTables league={input.league} players={summary.players[playerSide]} />
          </section>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-surface-2 p-3">
      <span className="text-xs text-ink-2">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}
