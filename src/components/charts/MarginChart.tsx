"use client";

// How often each final margin happened across all the simulations.
// Bars on the left are away-team wins (blue), on the right home-team wins (orange).

import { Bar, BarChart, CartesianGrid, Rectangle, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";
import { pct } from "@/lib/format";
import type { LeagueId } from "@/lib/leagues";
import { axisStyle, LegendSwatch, niceTicks, TooltipBox } from "./ChartTooltip";

interface Props {
  league: LeagueId;
  margins: { margin: number; pct: number }[];
  homeAbbr: string;
  awayAbbr: string;
}

export function MarginChart({ league, margins, homeAbbr, awayAbbr }: Props) {
  const step = league === "nfl" ? 7 : 10;
  const seen = margins.filter((m) => m.pct >= 0.001).map((m) => Math.abs(m.margin));
  const range = Math.ceil(Math.max(step, ...seen) / step) * step;
  const byMargin = new Map(margins.map((m) => [m.margin, m.pct]));
  const data = [];
  for (let m = -range; m <= range; m++) data.push({ margin: m, pct: (byMargin.get(m) ?? 0) * 100 });
  const yTicks = niceTicks(Math.max(...data.map((d) => d.pct)));

  const describe = (m: number) =>
    m === 0 ? "Tie" : m > 0 ? `${homeAbbr} wins by ${m}` : `${awayAbbr} wins by ${-m}`;

  return (
    <div className="flex flex-col gap-2">
      <BarChart
        responsive
        style={{ width: "100%", height: 240 }}
        data={data}
        barCategoryGap={1}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="margin" interval={step - 1} tickFormatter={(m: number) => String(Math.abs(m))} {...axisStyle} />
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
            const row = payload?.[0]?.payload as { margin: number; pct: number } | undefined;
            if (!active || !row) return null;
            return <TooltipBox value={pct(row.pct / 100, 1)} label={describe(row.margin)} sub="of simulations" />;
          }}
        />
        <Bar
          dataKey="pct"
          maxBarSize={24}
          isAnimationActive={false}
          shape={(props: BarShapeProps) => {
            const m = (props.payload as { margin: number }).margin;
            const fill = m > 0 ? "var(--home)" : m < 0 ? "var(--away)" : "var(--neutral-fill)";
            return <Rectangle {...props} fill={fill} radius={[4, 4, 0, 0]} />;
          }}
        />
      </BarChart>
      <div className="flex items-center justify-between px-10 text-xs text-muted">
        <span>← {awayAbbr} wins by</span>
        <span>{homeAbbr} wins by →</span>
      </div>
      <div className="flex gap-4 px-10">
        <LegendSwatch color="var(--away)" label={`${awayAbbr} wins`} />
        <LegendSwatch color="var(--home)" label={`${homeAbbr} wins`} />
      </div>
      <details className="px-2 text-sm">
        <summary className="cursor-pointer text-ink-2">Show as table</summary>
        <div className="mt-2 max-h-60 overflow-y-auto">
          <table className="tabular w-full text-left">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-normal">Result</th>
                <th className="py-1 text-right font-normal">Share of simulations</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((d) => d.pct > 0)
                .map((d) => (
                  <tr key={d.margin} className="border-t border-line">
                    <td className="py-1">{describe(d.margin)}</td>
                    <td className="py-1 text-right">{pct(d.pct / 100, 1)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
