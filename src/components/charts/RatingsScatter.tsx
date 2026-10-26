"use client";

// Every team placed by offense (left-right) and defense (up-down).
// Top-right = good at both. Each dot is the team's logo.

import { CartesianGrid, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, type ScatterShapeProps } from "recharts";
import { signed } from "@/lib/format";
import { axisStyle, TooltipBox } from "./ChartTooltip";

export interface ScatterTeam {
  abbr: string;
  name: string;
  logo: string;
  offense: number;
  defense: number;
  net: number;
}

export function RatingsScatter({ teams }: { teams: ScatterTeam[] }) {
  // Same scale on both axes, centered on 0 (average), with round tick steps.
  const biggest = Math.max(3, ...teams.flatMap((t) => [Math.abs(t.offense), Math.abs(t.defense)])) + 0.5;
  const step = biggest > 8 ? 3 : 2;
  const extent = Math.ceil(biggest / step) * step;
  const ticks: number[] = [];
  for (let t = -extent; t <= extent; t += step) ticks.push(t);
  return (
    <div className="relative">
      <ScatterChart responsive style={{ width: "100%", height: 420 }} margin={{ top: 16, right: 16, bottom: 24, left: 0 }}>
        <CartesianGrid stroke="var(--grid)" />
        <XAxis
          type="number"
          dataKey="offense"
          domain={[-extent, extent]}
          ticks={ticks}
          tickFormatter={(v: number) => signed(v, 0)}
          label={{ value: "Offense (points vs. average)", position: "insideBottom", offset: -16, fill: "var(--ink-2)", fontSize: 12 }}
          {...axisStyle}
        />
        <YAxis
          type="number"
          dataKey="defense"
          domain={[-extent, extent]}
          ticks={ticks}
          tickFormatter={(v: number) => signed(v, 0)}
          width={48}
          label={{ value: "Defense", angle: -90, position: "insideLeft", offset: 12, fill: "var(--ink-2)", fontSize: 12 }}
          {...axisStyle}
        />
        <ReferenceLine x={0} stroke="var(--axis)" />
        <ReferenceLine y={0} stroke="var(--axis)" />
        <Tooltip
          cursor={false}
          content={({ active, payload }) => {
            const team = payload?.[0]?.payload as ScatterTeam | undefined;
            if (!active || !team) return null;
            return (
              <TooltipBox
                value={`${signed(team.net)} net`}
                label={team.name}
                sub={`Offense ${signed(team.offense)} · Defense ${signed(team.defense)}`}
              />
            );
          }}
        />
        <Scatter
          data={teams}
          isAnimationActive={false}
          shape={(props: ScatterShapeProps) => {
            const { cx = 0, cy = 0 } = props;
            const team = props.payload as ScatterTeam;
            return (
              <g>
                {/* Invisible bigger circle so the logo is easy to hover. */}
                <circle cx={cx} cy={cy} r={16} fill="transparent" />
                <image href={team.logo} x={cx - 13} y={cy - 13} width={26} height={26} />
              </g>
            );
          }}
        />
      </ScatterChart>
      <span className="pointer-events-none absolute top-5 right-6 text-xs text-muted">Good offense · good defense</span>
      <span className="pointer-events-none absolute bottom-14 left-14 text-xs text-muted">Struggling on both ends</span>
    </div>
  );
}
