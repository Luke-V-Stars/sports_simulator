import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RatingsScatter } from "@/components/charts/RatingsScatter";
import { BlockSkeleton } from "@/components/Skeleton";
import { TeamLogo } from "@/components/TeamLogo";
import { fixed, signed } from "@/lib/format";
import { isLeagueId, LEAGUES, seasonLabel, type LeagueId } from "@/lib/leagues";
import { getLeagueSnapshot } from "@/lib/model/league";
import { formatRecord } from "@/lib/model/ratings";

export default function RankingsPage({ params }: PageProps<"/[league]/rankings">) {
  return (
    <Suspense fallback={<BlockSkeleton height={600} label="Rating every team" />}>
      <RankingsContent params={params} />
    </Suspense>
  );
}

async function RankingsContent({ params }: Pick<PageProps<"/[league]/rankings">, "params">) {
  const { league } = await params;
  if (!isLeagueId(league)) notFound();
  return <Rankings league={league} />;
}

async function Rankings({ league }: { league: LeagueId }) {
  const snapshot = await getLeagueSnapshot(league);
  const teamsById = new Map(snapshot.teams.map((t) => [t.id, t]));
  const rows = Object.values(snapshot.ratings.ratings)
    .filter((r) => teamsById.has(r.teamId))
    .sort((a, b) => b.net - a.net)
    .map((rating, i) => ({
      rank: i + 1,
      rating,
      team: teamsById.get(rating.teamId)!,
      stats: snapshot.stats[rating.teamId],
    }));

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {LEAGUES[league].name} power rankings · {seasonLabel(league, snapshot.seasonYear)}
        </h1>
        <p className="max-w-3xl text-sm text-ink-2">
          Ratings are in points compared with an average team, adjusted for strength of schedule. A team with a{" "}
          <strong>+5 net</strong> rating would beat an average team by about 5 points on a neutral field. Recent games
          count most; early in the season, last season&apos;s results still count a little.
        </p>
      </div>

      <section className="rounded-xl border border-edge bg-surface p-4">
        <h2 className="mb-1 font-semibold">Offense vs. defense</h2>
        <p className="mb-2 text-sm text-ink-2">Hover a logo for details. Further up and right is better.</p>
        <RatingsScatter
          teams={rows.map((r) => ({
            abbr: r.team.abbr,
            name: r.team.name,
            logo: r.team.logo,
            offense: r.rating.offense,
            defense: r.rating.defense,
            net: r.rating.net,
          }))}
        />
      </section>

      <section className="overflow-x-auto rounded-xl border border-edge bg-surface">
        <table className="tabular w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-normal">#</th>
              <th className="px-3 py-2 font-normal">Team</th>
              <th className="px-3 py-2 font-normal">Record</th>
              <th className="px-3 py-2 text-right font-normal">Net</th>
              <th className="px-3 py-2 text-right font-normal">Offense</th>
              <th className="px-3 py-2 text-right font-normal">Defense</th>
              <th className="px-3 py-2 text-right font-normal">Points / game</th>
              <th className="px-3 py-2 text-right font-normal">Allowed / game</th>
              <th className="px-3 py-2 font-normal">Last 5</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rank, rating, team, stats }) => (
              <tr key={team.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 text-muted">{rank}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <TeamLogo team={team} size={22} />
                    <span className="font-medium">{team.name}</span>
                  </span>
                </td>
                <td className="px-3 py-2">{formatRecord(stats)}</td>
                <td className="px-3 py-2 text-right font-semibold">{signed(rating.net)}</td>
                <td className="px-3 py-2 text-right">{signed(rating.offense)}</td>
                <td className="px-3 py-2 text-right">{signed(rating.defense)}</td>
                <td className="px-3 py-2 text-right">{stats ? fixed(stats.pointsFor, 1) : "–"}</td>
                <td className="px-3 py-2 text-right">{stats ? fixed(stats.pointsAgainst, 1) : "–"}</td>
                <td className="px-3 py-2">
                  <span className="flex gap-1">
                    {(stats?.lastFive ?? []).map((r, i) => (
                      <span
                        key={i}
                        className={`inline-flex size-5 items-center justify-center rounded text-[10px] font-semibold ${
                          r === "W" ? "bg-surface-2 text-good-text" : "bg-surface-2 text-ink-2"
                        }`}
                      >
                        {r}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
