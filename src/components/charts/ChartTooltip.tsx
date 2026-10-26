// The little box that appears when you hover a bar or dot.
// The number comes first (bold), the description second.

export function TooltipBox({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-md border border-edge bg-surface px-3 py-2 text-sm shadow-md">
      <div className="font-semibold text-ink">{value}</div>
      <div className="text-ink-2">{label}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

// Round axis numbers: for a max of 3.8 -> [0, 1, 2, 3, 4].
export function niceTicks(max: number, count = 4): number[] {
  const rough = max / count;
  const power = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const ticks = [];
  for (let t = 0; t < max + step; t += step) ticks.push(Number(t.toFixed(4)));
  return ticks;
}

// Shared axis styling: hairline axes, muted labels.
export const axisStyle = {
  stroke: "var(--axis)",
  tick: { fill: "var(--ink-muted)", fontSize: 12 },
  tickLine: false,
} as const;

export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span className="inline-block size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
