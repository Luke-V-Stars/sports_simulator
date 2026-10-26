// A small label for a player's injury status. The colored dot is always paired
// with the written status, so color is never the only clue.

export function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("out") || s.includes("injured reserve") || s.includes("suspen")) return "var(--critical)";
  if (s.includes("doubtful")) return "var(--serious)";
  return "var(--warning)";
}

export function InjuryBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
      <span className="size-1.5 rounded-full" style={{ background: statusColor(status) }} aria-hidden />
      {status}
    </span>
  );
}
