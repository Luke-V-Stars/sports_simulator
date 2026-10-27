"use client";

// For a finished game: the model's pre-game projection next to what really
// happened, so you can see how close it came.

import type { ReactNode } from "react";
import { marginText, pct } from "@/lib/format";
import type { GameCheck, RangeCheck, ValueCheck } from "@/lib/sim/compare";
import type { Team, VegasLine } from "@/lib/types";

interface Props {
  check: GameCheck;
  home: Team;
  away: Team;
  vegas?: VegasLine;
}

export function ResultCheck({ check, home, away, vegas }: Props) {
  const abbr = (side: "home" | "away") => (side === "home" ? home.abbr : away.abbr);
  const margin = (m: number) => marginText(home.abbr, away.abbr, m);
  const winnerScore = Math.max(check.home.actual, check.away.actual);
  const loserScore = Math.min(check.home.actual, check.away.actual);
  const score = `${winnerScore}–${loserScore}`;

  const rows: { label: string; value: ValueCheck; show: (n: number) => string; range: string }[] = [
    { label: `${away.abbr} points`, value: check.away, show: String, range: `${check.away.low}–${check.away.high}` },
    { label: `${home.abbr} points`, value: check.home, show: String, range: `${check.home.low}–${check.home.high}` },
    {
      label: "Margin",
      value: check.margin,
      show: margin,
      range: `${margin(check.margin.low)} to ${margin(check.margin.high)}`,
    },
    {
      label: "Combined points",
      value: check.total,
      show: String,
      range: `${check.total.low}–${check.total.high}`,
    },
  ];
  const inside = rows.filter((r) => r.value.range === "inside").length;

  let verdict: ReactNode;
  let badge: ReactNode;
  if (check.winner === "tie") {
    verdict = `The game ended in a ${score} tie, which came up in ${pct(check.winnerChance, 1)} of simulations.`;
    badge = <span className="text-ink-2">Tie</span>;
  } else if (check.winner === check.pick) {
    verdict = `The model picked ${abbr(check.pick)} to win (${pct(check.winnerChance)} chance), and ${abbr(check.winner)} won ${score}.`;
    badge = <span className="text-good-text">✓ Correct pick</span>;
  } else {
    verdict = `The model leaned ${abbr(check.pick)}, but ${abbr(check.winner)} won ${score}. It gave ${abbr(check.winner)} a ${pct(check.winnerChance)} chance, so it expected a win like this about ${timesInTen(check.winnerChance)}.`;
    badge = <span className="text-ink-2">✗ Missed pick</span>;
  }

  const vegasSpread = vegas && (vegas.spread === 0 ? "Even" : `${vegas.favoriteAbbr} by ${vegas.spread}`);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-edge bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-ink-2 uppercase">Projection vs. final result</h2>
        <span className="rounded-md bg-surface-2 px-2.5 py-1 text-sm font-semibold">{badge}</span>
      </div>
      <p>{verdict}</p>

      <div className="overflow-x-auto">
        <table className="tabular w-full min-w-[520px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-1.5 pr-2 text-left font-normal" />
              <th className="px-2 py-1.5 text-right font-normal">Projected</th>
              <th className="px-2 py-1.5 text-right font-normal" title="Middle 80% of simulations">
                Typical range
              </th>
              <th className="px-2 py-1.5 text-right font-normal">Actual</th>
              <th className="py-1.5 pl-2 text-right font-normal">Off by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-2 text-ink-2">{r.label}</td>
                <td className="px-2 py-1.5 text-right">{r.show(r.value.projected)}</td>
                <td className="px-2 py-1.5 text-right text-ink-2">{r.range}</td>
                <td className="px-2 py-1.5 text-right font-semibold">
                  {r.show(r.value.actual)} <RangeMark range={r.value.range} />
                </td>
                <td className="py-1.5 pl-2 text-right">{r.value.miss}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {vegas && (check.vegasMarginMiss !== undefined || check.vegasTotalMiss !== undefined) && (
        <ul className="flex flex-col gap-1 text-sm text-ink-2">
          {check.vegasMarginMiss !== undefined && (
            <li>
              <span className="font-medium text-ink">Margin vs. Vegas ({vegasSpread}): </span>
              the model was off by {check.margin.miss}, Vegas by {check.vegasMarginMiss}.{" "}
              {closer(check.margin.miss, check.vegasMarginMiss)}
            </li>
          )}
          {check.vegasTotalMiss !== undefined && (
            <li>
              <span className="font-medium text-ink">Combined points vs. Vegas (over/under {vegas.overUnder}): </span>
              the model was off by {check.total.miss}, Vegas by {check.vegasTotalMiss}.{" "}
              {closer(check.total.miss, check.vegasTotalMiss)}
            </li>
          )}
        </ul>
      )}

      <p className="text-xs text-muted">
        {inside} of {rows.length} results landed inside the typical range (<RangeMark range="inside" /> inside,{" "}
        <RangeMark range="above" /> above, <RangeMark range="below" /> below). The projection only uses games played
        before this one, so it&apos;s a fair test. Rosters are today&apos;s, so players who have changed teams since
        are left out.
      </p>
    </section>
  );
}

const MARKS: Record<RangeCheck, { symbol: string; text: string; className: string }> = {
  inside: { symbol: "✓", text: "inside the typical range", className: "text-good-text" },
  above: { symbol: "↑", text: "above the typical range", className: "text-ink" },
  below: { symbol: "↓", text: "below the typical range", className: "text-ink" },
};

// ✓ / ↑ / ↓ next to a real number, compared with the projected range.
export function RangeMark({ range }: { range: RangeCheck }) {
  const mark = MARKS[range];
  return (
    <span className={`font-semibold ${mark.className}`} title={`Actual result: ${mark.text}`}>
      <span aria-hidden>{mark.symbol}</span>
      <span className="sr-only">{mark.text}</span>
    </span>
  );
}

function closer(model: number, vegas: number): string {
  if (model < vegas) return "The model was closer.";
  if (model > vegas) return "Vegas was closer.";
  return "They were equally close.";
}

// 0.32 -> "3 times in 10"
function timesInTen(chance: number): string {
  const n = Math.round(chance * 10);
  return n === 0 ? "less than 1 time in 10" : `${n} time${n === 1 ? "" : "s"} in 10`;
}
