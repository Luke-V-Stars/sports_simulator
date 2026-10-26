import Link from "next/link";
import { Suspense } from "react";
import { GameCard } from "@/components/GameCard";
import { CardSkeleton } from "@/components/Skeleton";
import { getScoreboard } from "@/lib/espn";
import { LEAGUES, type LeagueId } from "@/lib/leagues";
import { getLeagueSnapshot, predictGame } from "@/lib/model/league";

export default function Home() {
  return (
    <main className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Simulate any NFL or NBA game</h1>
        <p className="max-w-2xl text-ink-2">
          Pick a game, and the simulator plays it thousands of times using each team&apos;s real results, recent
          player stats and the latest injury report. You get each team&apos;s chance to win, the most likely
          scores, and a projected stat line for every player.
        </p>
      </section>
      <div className="grid gap-8 lg:grid-cols-2">
        <LeagueSection league="nfl" title="NFL this week" />
        <LeagueSection league="nba" title="NBA today" />
      </div>
    </main>
  );
}

function LeagueSection({ league, title }: { league: LeagueId; title: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Link href={`/${league}`} className="text-sm text-ink-2 hover:text-ink hover:underline">
          All {LEAGUES[league].name} games →
        </Link>
      </div>
      <Suspense fallback={<CardSkeleton count={2} />}>
        <LeagueGames league={league} />
      </Suspense>
    </section>
  );
}

async function LeagueGames({ league }: { league: LeagueId }) {
  const [board, snapshot] = await Promise.all([getScoreboard(league), getLeagueSnapshot(league)]);
  // Live games first, then upcoming, then finished.
  const order = { in: 0, pre: 1, post: 2 };
  const games = [...board.games].sort((a, b) => order[a.state] - order[b.state]).slice(0, 4);
  if (games.length === 0) {
    return <p className="rounded-xl border border-edge bg-surface p-6 text-ink-2">No games scheduled.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {games.map((game) => (
        <GameCard key={game.id} game={game} prediction={predictGame(snapshot, game)} />
      ))}
    </div>
  );
}
