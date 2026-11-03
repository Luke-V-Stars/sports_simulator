import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InjuryBadge } from "@/components/InjuryBadge";
import { Simulator } from "@/components/simulator/Simulator";
import { BlockSkeleton } from "@/components/Skeleton";
import { TeamLogo } from "@/components/TeamLogo";
import { fixed, gameTime, signed } from "@/lib/format";
import { isLeagueId, LEAGUES } from "@/lib/leagues";
import { matchupLabels, WET_MM_PER_HOUR } from "@/lib/model/conditions";
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

  return (
    <main className="flex flex-col gap-6">
      <MatchupHeader data={data} />
      <Simulator input={data.input} vegas={game.vegas} actual={data.actual} />
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
      label: "Expected points (with rest and weather, before lineup changes)",
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
      <GameConditions data={data} />
    </section>
  );
}

// Rest and weather (already in the expected points above) and how each
// defense shifts the other team's stats.
function GameConditions({ data }: { data: MatchupData }) {
  const { game, weather } = data;
  const league = data.input.league;
  const sides = [
    { abbr: game.away.team.abbr, opp: game.home.team.abbr, input: data.input.away },
    { abbr: game.home.team.abbr, opp: game.away.team.abbr, input: data.input.home },
  ].map((s) => ({ ...s, adjustments: s.input.adjustments, matchup: matchupLabels(league, s.input.matchup) }));
  const any = sides.some((s) => s.adjustments.length > 0);
  const anyMatchup = sides.some((s) => s.matchup.length > 0);
  if (!weather && !any && !anyMatchup) return null;
  return (
    <div className="mt-4 border-t border-line pt-3 text-sm">
      <h3 className="mb-1 font-semibold">Game conditions</h3>
      {weather && (
        <p className="text-ink-2">
          Weather during the game: {Math.round(weather.tempF)}°F, wind {Math.round(weather.windMph)} mph
          {weather.precipMm >= WET_MM_PER_HOUR ? ", rain or snow" : weather.precipMm >= 0.2 ? ", light rain or snow" : ""}
          {game.state === "pre" ? " (forecast)" : ""}.
        </p>
      )}
      {any ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {sides.flatMap(({ abbr, adjustments }) =>
            adjustments.map((a) => (
              <li key={`${abbr}-${a.label}`} className="flex justify-between gap-2">
                <span>
                  <span className="font-medium">{abbr}</span> <span className="text-ink-2">{a.label}</span>
                </span>
                <span className="tabular font-medium">{signed(a.points)} pts</span>
              </li>
            )),
          )}
        </ul>
      ) : (
        <p className="text-ink-2">No effect on the expected score.</p>
      )}
      {anyMatchup && (
        <ul className="mt-2 flex flex-col gap-0.5 text-ink-2">
          {sides
            .filter((s) => s.matchup.length > 0)
            .map((s) => (
              <li key={s.abbr}>
                <span className="font-medium text-ink">{s.abbr}</span> against the {s.opp} defense:{" "}
                {s.matchup.join(", ")}
              </li>
            ))}
        </ul>
      )}
    </div>
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
        {data.game.state !== "pre" &&
          " ESPN only keeps each player's latest injury news, so for a game already played this is today's report minus anything updated after kickoff."}
      </p>
    </section>
  );
}
