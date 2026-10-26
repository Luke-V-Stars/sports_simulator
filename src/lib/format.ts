// Small helpers for showing numbers and dates.

export function pct(x: number, digits = 0): string {
  if (x > 0 && x < 0.005 && digits === 0) return "<1%";
  if (x < 1 && x > 0.995 && digits === 0) return ">99%";
  return `${(x * 100).toFixed(digits)}%`;
}

export function signed(x: number, digits = 1): string {
  const s = x.toFixed(digits);
  return x > 0 ? `+${s}` : s === (-0).toFixed(digits) ? (0).toFixed(digits) : s;
}

export function fixed(x: number, digits: number): string {
  return x.toFixed(digits);
}

// Point spreads and totals are quoted to the nearest half point.
export function roundHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

// "PHI by 4.5" / "Even"
export function marginText(homeAbbr: string, awayAbbr: string, homeMargin: number): string {
  const m = roundHalf(Math.abs(homeMargin));
  if (m === 0) return "Even";
  return `${homeMargin > 0 ? homeAbbr : awayAbbr} by ${m}`;
}

export function gameTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function gameDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
