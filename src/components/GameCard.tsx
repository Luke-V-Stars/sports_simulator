import Link from "next/link";
import { gameTime, marginText } from "@/lib/format";
import type { Game, GameSide } from "@/lib/types";
import { TeamLogo } from "./TeamLogo";
import { WinBar } from "./WinBar";

export interface QuickPrediction {
  homeWin: number;
  homePoints: number;
  awayPoints: number;
}

export function GameCard({ game, prediction }: { game: Game; prediction?: QuickPrediction }) {
  const showScores = game.state !== "pre";
  return (
    <Link
      href={`/${game.league}/game/${game.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-edge bg-surface p-4 transition hover:border-axis hover:shadow-sm"
    >
      <div className="flex items-center justify-between text-xs text-muted">
        <span className={game.state === "in" ? "flex items-center gap-1.5 font-semibold text-ink" : undefined}>
          {game.state === "in" && <span className="size-2 rounded-full bg-critical" aria-hidden />}
          {game.state === "in" && "LIVE · "}
          {game.state === "pre" ? gameTime(game.date) : game.statusText}
        </span>
        {game.broadcast && <span>{game.broadcast}</span>}
      </div>

      <div className="flex flex-col gap-2">
        <TeamRow side={game.away} showScore={showScores} winner={isWinner(game, "away")} />
        <TeamRow side={game.home} showScore={showScores} winner={isWinner(game, "home")} home />
      </div>

      {prediction && game.state !== "post" && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <WinBar
            awayAbbr={game.away.team.abbr}
            homeAbbr={game.home.team.abbr}
            awayWin={1 - prediction.homeWin}
            homeWin={prediction.homeWin}
          />
          <div className="flex flex-wrap justify-between gap-x-3 text-xs text-ink-2">
            <span>
              Model: {marginText(game.home.team.abbr, game.away.team.abbr, prediction.homePoints - prediction.awayPoints)}
            </span>
            {game.vegas && (
              <span>
                Vegas: {game.vegas.spread === 0 ? "Even" : `${game.vegas.favoriteAbbr} -${game.vegas.spread}`}
                {game.vegas.overUnder ? ` · O/U ${game.vegas.overUnder}` : ""}
              </span>
            )}
          </div>
        </div>
      )}

      <span className="text-right text-sm font-medium text-ink-2 group-hover:text-ink group-hover:underline">
        {game.state === "post" ? "See how the model did →" : "Simulate this game →"}
      </span>
    </Link>
  );
}

function isWinner(game: Game, side: "home" | "away"): boolean {
  if (game.state !== "post") return false;
  const mine = game[side].score ?? 0;
  const theirs = game[side === "home" ? "away" : "home"].score ?? 0;
  return mine > theirs;
}

function TeamRow({
  side,
  showScore,
  winner,
  home = false,
}: {
  side: GameSide;
  showScore: boolean;
  winner: boolean;
  home?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <TeamLogo team={side.team} size={28} />
      <div className="min-w-0 flex-1">
        <div className={`truncate ${winner ? "font-semibold" : ""}`}>
          {side.team.name}
          {home && <span className="ml-1 text-xs text-muted">(home)</span>}
        </div>
        {side.record && <div className="text-xs text-muted">{side.record}</div>}
      </div>
      {showScore && <div className={`tabular text-xl ${winner ? "font-semibold" : "text-ink-2"}`}>{side.score}</div>}
    </div>
  );
}
