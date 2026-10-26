import { pct } from "@/lib/format";

// A bar split into the away team's chance (blue, left) and the home team's
// chance (orange, right). Team names and numbers are written beside it so the
// colors are never the only clue.
export function WinBar({
  awayAbbr,
  homeAbbr,
  awayWin,
  homeWin,
  large = false,
}: {
  awayAbbr: string;
  homeAbbr: string;
  awayWin: number;
  homeWin: number;
  large?: boolean;
}) {
  const total = awayWin + homeWin || 1;
  const awayShare = (awayWin / total) * 100;
  return (
    <div className="w-full">
      <div className={`flex items-baseline justify-between ${large ? "text-2xl font-semibold" : "text-sm"}`}>
        <span>
          <span className="text-ink-2">{awayAbbr}</span> <span className="font-semibold">{pct(awayWin)}</span>
        </span>
        <span>
          <span className="font-semibold">{pct(homeWin)}</span> <span className="text-ink-2">{homeAbbr}</span>
        </span>
      </div>
      <div
        className={`mt-1 flex w-full gap-[2px] ${large ? "h-3" : "h-2"}`}
        role="img"
        aria-label={`${awayAbbr} ${pct(awayWin)} chance to win, ${homeAbbr} ${pct(homeWin)}`}
      >
        <div className="rounded-l bg-away" style={{ width: `${awayShare}%` }} />
        <div className="flex-1 rounded-r bg-home" />
      </div>
    </div>
  );
}
