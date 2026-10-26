import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InjuryBadge } from "@/components/InjuryBadge";
import { Simulator } from "@/components/simulator/Simulator";
import { BlockSkeleton } from "@/components/Skeleton";
import { TeamLogo } from "@/components/TeamLogo";
import { fixed, gameTime, signed } from "@/lib/format";
import { isLeagueId, LEAGUES } from "@/lib/leagues";
import { getMatchup, type MatchupData, type TeamContext } from "@/lib/model/matchup";
import { formatRecord } from "@/lib/model/ratings";
import type { GameSide } from "@/lib/types";

export default function GamePage({ params }: PageProps<"/[league]/game/[id]">) {
  return (
    <Suspense fallback={<BlockSkeleton height={640} label="Loading stats, rosters and injuries" />}>
      <GameContent params={params} />
    </Suspense>
  );
}

async function GameContent({ params }: Pick<PageProps<"/[league]/game/[id]">, "params">) {
  const { league, id } = await params;
  if (!isLeagueId(league) || !/^\d+$/.test(id)) notFound();
  const data = await getMatchup(league, id);
  const { game } = data;
  const final =
    game.state === "post" && game.home.score !== null && game.away.score !== null
      ? { home: game.home.score, away: game.away.score }
      : undefined;

  return (
    <main className="flex flex-col gap-6">
      <MatchupHeader data={data} />
      <Simulator input={data.input} vegas={game.vegas} finalScore={final} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TeamComparison data={data} />
        <InjuryReport data={data} />
      </div>
      <p className="text-xs text-muted">
        Player averages come from each team&apos;s last {data.away.sampleGames} ({game.away.team.abbr}) and{" "}
        {data.home.sampleGames} ({game.home.team.abbr}) games with box scores
        {game.state === "post" ? ", all played before this game" : ""}. Team ratings use every{" "}
        {LEAGUES[league].name} game from this season and last season played before kickoff.
      </p>
    </main>
  );
}

function MatchupHeader({ data }: { data: MatchupData }) {
  const { game } = data;
  const showScore = game.state !== "pre";
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-edge bg-surface p-5">
      <div className="flex flex-wrap justify-between gap-2 text-sm text-ink-2">
        <span>
          {game.state === "pre" ? gameTime(game.date) : game.statusText}
          {game.state === "in" && " · live"}
        </span>
        <span>{[game.venue, game.broadcast].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <HeaderTeam side={game.away} context={data.away} teamCount={data.teamCount} label="Away" color="var(--away)" />
        <div className="text-center">
          {showScore ? (
            <span className="tabular text-3xl font-semibold">
              {game.away.score} – {game.home.score}
            </span>
          ) : (
            <span className="text-xl text-muted">at</span>
          )}
        </div>
        <HeaderTeam
          side={game.home}
          context={data.home}
          teamCount={data.teamCount}
          label={game.neutralSite ? "Neutral site" : "Home"}
          color="var(--home)"
          alignRight
        />
      </div>
    </section>
  );
}

function HeaderTeam({
  side,
  context,
  teamCount,
  label,
  color,
  alignRight = false,
}: {
  side: GameSide;
  context: TeamContext;
  teamCount: number;
  label: string;
  color: string;
  alignRight?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${alignRight ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogo team={side.team} size={56} />
      <div className="min-w-0">
        <div className={`flex items-center gap-1.5 text-xs text-muted ${alignRight ? "justify-end" : ""}`}>
          <span className="size-2 rounded-sm" style={{ background: color }} aria-hidden />
          {label}
        </div>
        <div className="truncate text-lg font-semibold sm:text-2xl">
          <span className="sm:hidden">{side.team.shortName}</span>
          <span className="hidden sm:inline">{side.team.name}</span>
        </div>
        <div className="text-sm text-ink-2">
          {side.record ?? formatRecord(context.stats)} · Power rank #{context.rank} of {teamCount}
        </div>
      </div>
    </div>
  );
}

function TeamComparison({ data }: { data: MatchupData }) {
  const { game, away, home } = data;
  const rows: { label: string; away: string; home: string }[] = [
    { label: "Record", away: formatRecord(away.stats), home: formatRecord(home.stats) },
    { label: "Power rank", away: `#${away.rank}`, home: `#${home.rank}` },
    { label: "Net rating", away: signed(away.rating.net), home: signed(home.rating.net) },
    { label: "Offense rating", away: signed(away.rating.offense), home: signed(home.rating.offense) },
    { label: "Defense rating", away: signed(away.rating.defense), home: signed(home.rating.defense) },
    {
      label: "Points per game",
      away: away.stats ? fixed(away.stats.pointsFor, 1) : "–",
      home: home.stats ? fixed(home.stats.pointsFor, 1) : "–",
    },
    {
      label: "Allowed per game",
      away: away.stats ? fixed(away.stats.pointsAgainst, 1) : "–",
      home: home.stats ? fixed(home.stats.pointsAgainst, 1) : "–",
    },
    {
      label: "Expected points (before injuries)",
      away: fixed(data.input.away.expectedPoints, 1),
      home: fixed(data.input.home.expectedPoints, 1),
    },
    { label: "Last 5 (newest first)", away: (away.stats?.lastFive ?? []).join(" "), home: (home.stats?.lastFive ?? []).join(" ") },
  ];
  return (
    <section className="rounded-xl border border-edge bg-surface p-4">
      <h2 className="mb-3 font-semibold">Team comparison</h2>
      <table className="tabular w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="py-1.5 text-left font-normal">{game.away.team.abbr}</th>
            <th className="py-1.5 text-center font-normal" />
            <th className="py-1.5 text-right font-normal">{game.home.team.abbr}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line last:border-0">
              <td className="py-1.5 font-medium">{r.away}</td>
              <td className="py-1.5 text-center text-xs text-ink-2">{r.label}</td>
              <td className="py-1.5 text-right font-medium">{r.home}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Ratings are points better (+) or worse (–) than an average team.</p>
    </section>
  );
}

function InjuryReport({ data }: { data: MatchupData }) {
  const sides = [
    { team: data.game.away.team, injuries: data.away.injuries },
    { team: data.game.home.team, injuries: data.home.injuries },
  ];
  return (
    <section className="rounded-xl border border-edge bg-surface p-4">
      <h2 className="mb-3 font-semibold">Injury report</h2>
      <div className="flex flex-col gap-4">
        {sides.map(({ team, injuries }) => (
          <div key={team.id}>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <TeamLogo team={team} size={18} /> {team.name}
            </h3>
            {injuries.length === 0 ? (
              <p className="text-sm text-ink-2">No injuries listed.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {injuries.map((i) => (
                  <li key={i.playerId} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.name}</span>
                    <span className="text-xs text-muted">{i.position}</span>
                    <InjuryBadge status={i.status} />
                    {i.detail && <span className="text-xs text-ink-2">{i.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        In each simulated game, &quot;Out&quot; players never play, &quot;Doubtful&quot; play 25% of the time,
        &quot;Questionable&quot; 50%, and &quot;Day-To-Day&quot; 65%.
      </p>
    </section>
  );
}
