import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GameCard } from "@/components/GameCard";
import { CardSkeleton } from "@/components/Skeleton";
import { getScoreboard, type ScoreboardQuery } from "@/lib/espn";
import { gameDay } from "@/lib/format";
import { isLeagueId, LEAGUES, seasonLabel, type LeagueId } from "@/lib/leagues";
import { getLeagueSnapshot, predictGame } from "@/lib/model/league";
import type { Game, Scoreboard } from "@/lib/types";

export default function LeagueGamesPage({ params, searchParams }: PageProps<"/[league]">) {
  return (
    <Suspense fallback={<CardSkeleton count={6} />}>
      <GamesContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GamesContent({ params, searchParams }: Pick<PageProps<"/[league]">, "params" | "searchParams">) {
  const { league } = await params;
  if (!isLeagueId(league)) notFound();
  const query = parseQuery(league, await searchParams);
  const board = await getScoreboard(league, query);
  const snapshot = await getLeagueSnapshot(league, board.seasonYear);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {LEAGUES[league].name} games · {seasonLabel(league, board.seasonYear)} season
        </h1>
        <p className="text-sm text-ink-2">
          Win chances below are a quick estimate from team ratings. Open a game to run the full simulation, which
          also uses player stats and injuries.
        </p>
      </div>

      {league === "nba" ? <DayPicker board={board} /> : <WeekPicker board={board} />}

      {board.games.length === 0 ? (
        <p className="rounded-xl border border-edge bg-surface p-6 text-ink-2">No games on this date.</p>
      ) : (
        groupByDay(board.games).map(([day, games]) => (
          <section key={day} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-ink-2 uppercase">{day}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((game) => (
                <GameCard key={game.id} game={game} prediction={predictGame(snapshot, game)} />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}

type SearchParams = Awaited<PageProps<"/[league]">["searchParams"]>;

function parseQuery(league: LeagueId, sp: SearchParams): ScoreboardQuery {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  if (league === "nba") {
    const date = first(sp.date);
    return date && /^\d{8}$/.test(date) ? { date } : {};
  }
  const week = Number(first(sp.week));
  const seasonType = Number(first(sp.type)) || 2;
  const seasonYear = Number(first(sp.season)) || undefined;
  return week > 0 ? { week, seasonType, seasonYear } : {};
}

function groupByDay(games: Game[]): [string, Game[]][] {
  const groups = new Map<string, Game[]>();
  for (const g of games) {
    const day = gameDay(g.date);
    groups.set(day, [...(groups.get(day) ?? []), g]);
  }
  return [...groups.entries()];
}

// "2026-10-26" -> "20261027" for +1 day.
function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function DayPicker({ board }: { board: Scoreboard }) {
  const day = board.day ?? board.games[0]?.date.slice(0, 10);
  if (!day) return null;
  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const button = "rounded-md border border-edge bg-surface px-3 py-1.5 text-sm hover:border-axis";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link className={button} href={`/nba?date=${shiftDay(day, -1)}`}>
        ← Previous day
      </Link>
      <span className="px-2 font-semibold">{label}</span>
      <Link className={button} href={`/nba?date=${shiftDay(day, 1)}`}>
        Next day →
      </Link>
      <Link className={`${button} ml-auto`} href="/nba">
        Today
      </Link>
    </div>
  );
}

function WeekPicker({ board }: { board: Scoreboard }) {
  const weeks = board.weeks ?? [];
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div className="flex gap-2 pb-1">
        {weeks.map((w) => {
          const active = w.week === board.week && w.seasonType === board.seasonType;
          return (
            <Link
              key={`${w.seasonType}-${w.week}`}
              href={`/nfl?season=${board.seasonYear}&type=${w.seasonType}&week=${w.week}`}
              className={`rounded-md border px-3 py-1.5 text-sm whitespace-nowrap ${
                active ? "border-ink bg-ink font-semibold text-page" : "border-edge bg-surface hover:border-axis"
              }`}
            >
              {w.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
