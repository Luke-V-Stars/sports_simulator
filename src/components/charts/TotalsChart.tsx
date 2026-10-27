"use client";

// How many combined points (both teams added together) the simulations produced.

import { Bar, BarChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { pct } from "@/lib/format";
import { axisStyle, niceTicks, TooltipBox } from "./ChartTooltip";

type Bin = { from: number; to: number; pct: number };

interface Props {
  totals: Bin[];
  vegasTotal?: number;
  actualTotal?: number; // finished games: the real combined points
}

export function TotalsChart({ totals, vegasTotal, actualTotal }: Props) {
  const data = withRoomFor(totals, actualTotal).map((t) => ({
    label: `${t.from}–${t.to}`,
    from: t.from,
    to: t.to,
    pct: t.pct * 100,
  }));
  const binOf = (value?: number) =>
    value === undefined ? undefined : data.find((d) => value >= d.from && value < d.to + 1);
  const vegasBin = vegasTotal ? binOf(vegasTotal) : undefined;
  const actualBin = binOf(actualTotal);
  const yTicks = niceTicks(Math.max(...data.map((d) => d.pct)));
  return (
    <div className="flex flex-col gap-2">
      <BarChart
        responsive
        style={{ width: "100%", height: 240 }}
        data={data}
        barCategoryGap={2}
        // Both labels sit above the chart, one higher than the other, so they never overlap.
        margin={{ top: vegasBin && actualBin ? 36 : 20, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={16} {...axisStyle} />
        <YAxis
          ticks={yTicks}
          domain={[0, yTicks.at(-1)!]}
          tickFormatter={(v: number) => `${v}%`}
          width={40}
          axisLine={false}
          {...axisStyle}
        />
        <Tooltip
          cursor={{ fill: "var(--grid)", opacity: 0.6 }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
            if (!active || !row) return null;
            return <TooltipBox value={pct(row.pct / 100, 1)} label={`${row.label} combined points`} />;
          }}
        />
        <Bar dataKey="pct" fill="var(--neutral-fill)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        {vegasBin && (
          <ReferenceLine
            x={vegasBin.label}
            stroke="var(--ink-2)"
            label={{
              value: `Vegas O/U ${vegasTotal}`,
              position: "top",
              offset: actualBin ? 20 : 5,
              fill: "var(--ink-2)",
              fontSize: 12,
            }}
          />
        )}
        {actualBin && (
          <ReferenceLine
            x={actualBin.label}
            stroke="var(--ink-1)"
            strokeWidth={2}
            label={{ value: `Actual ${actualTotal}`, position: "top", fill: "var(--ink-1)", fontSize: 12 }}
          />
        )}
      </BarChart>
      <details className="px-2 text-sm">
        <summary className="cursor-pointer text-ink-2">Show as table</summary>
        <table className="tabular mt-2 w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-normal">Combined points</th>
              <th className="py-1 text-right font-normal">Share of simulations</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-line">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right">{pct(d.pct / 100, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// If the real total fell outside every simulated bin, add empty bins out to
// it so the "Actual" line still has a place on the chart.
function withRoomFor(totals: Bin[], value?: number): Bin[] {
  if (value === undefined || totals.length === 0) return totals;
  const width = totals[0].to - totals[0].from + 1;
  const target = Math.floor(value / width) * width;
  const bins = [...totals];
  for (let from = bins[0].from - width; from >= target; from -= width) bins.unshift({ from, to: from + width - 1, pct: 0 });
  for (let from = bins.at(-1)!.from + width; from <= target; from += width) bins.push({ from, to: from + width - 1, pct: 0 });
  return bins;
}
