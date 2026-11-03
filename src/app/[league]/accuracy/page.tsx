import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { BlockSkeleton } from "@/components/Skeleton";
import { RangeMark } from "@/components/simulator/ResultCheck";
import { fixed, gameDay, marginText, pct } from "@/lib/format";
import { isLeagueId, LEAGUES, seasonLabel, type LeagueId } from "@/lib/leagues";
import { getAccuracyReport, REPORT_SIZES } from "@/lib/model/accuracy";
import type { AccuracySummary, GameEvaluation, Tally } from "@/lib/sim/compare";

export default function AccuracyPage({ params, searchParams }: PageProps<"/[league]/accuracy">) {
  return (
    <Suspense
      fallback={
        <BlockSkeleton
          height={640}
          label="Re-predicting finished games. The first time can take a minute or two while box scores load."
        />
      }
    >
      <AccuracyContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function AccuracyContent({
  params,
  searchParams,
}: Pick<PageProps<"/[league]/accuracy">, "params" | "searchParams">) {
  const { league } = await params;
  if (!isLeagueId(league)) notFound();
  const sp = await searchParams;
  const asked = Number(Array.isArray(sp.games) ? sp.games[0] : sp.games);
  const size = REPORT_SIZES.includes(asked) ? asked : 50;
  const report = await getAccuracyReport(league, size);
  const { summary, evals } = report;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          How accurate is it? · {LEAGUES[league].name} {seasonLabel(league, report.seasonYear)}
        </h1>
        <p className="max-w-3xl text-sm text-ink-2">
          Every finished game below was predicted again using only what was known before it (ratings, player stats
          and injury reports from before kickoff), then checked against the real result and the Vegas line. This is
          how to tell whether a change to the model actually helps.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-2">Most recent</span>
        {REPORT_SIZES.map((n) => (
          <Link
            key={n}
            href={`/${league}/accuracy?games=${n}`}
            className={`rounded-md px-2.5 py-1 ${n === size ? "bg-surface-2 font-semibold" : "text-ink-2 hover:text-ink"}`}
          >
            {n}
          </Link>
        ))}
        <span className="text-ink-2">games</span>
      </div>

      {summary.games === 0 ? (
        <p className="rounded-xl border border-edge bg-surface p-6 text-ink-2">No finished games this season yet.</p>
      ) : (
        <>
          <Tiles summary={summary} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Calibration summary={summary} />
            <Explainer />
          </div>
          <GamesTable league={league} evals={evals} />
          <p className="text-xs text-muted">
            {summary.games} games{report.skipped > 0 ? ` (${report.skipped} skipped: ESPN data missing)` : ""}. Each
            game runs 2,000 simulations. Rosters and depth charts are today&apos;s, so players who changed teams since
            a game are left out of it, which makes older games look a little worse than the model really was.
          </p>
        </>
      )}
    </main>
  );
}

function Tiles({ summary }: { summary: AccuracySummary }) {
  const { picks, margin, total } = summary;
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Tile
        title="Winners picked"
        value={share(picks.model)}
        detail={
          <>
            {picks.model.hits} of {picks.model.total}.{" "}
            {picks.vegas.total > 0 && (
              <>
                The Vegas favorite: {share(picks.vegas)} ({picks.vegas.hits} of {picks.vegas.total}).
              </>
            )}
          </>
        }
      />
      <Tile
        title="Margin, average miss"
        value={`${fixed(margin.model, 1)} points`}
        detail={
          margin.vegasGames > 0 ? (
            <>
              On the {margin.vegasGames} games with a line: model {fixed(margin.onVegasGames, 1)}, Vegas{" "}
              {fixed(margin.vegas, 1)}. {closer(margin.onVegasGames, margin.vegas)}
            </>
          ) : (
            "No Vegas lines to compare."
          )
        }
      />
      <Tile
        title="Combined points, average miss"
        value={`${fixed(total.model, 1)} points`}
        detail={
          total.vegasGames > 0 ? (
            <>
              On the {total.vegasGames} games with an over/under: model {fixed(total.onVegasGames, 1)}, Vegas{" "}
              {fixed(total.vegas, 1)}. {closer(total.onVegasGames, total.vegas)}
            </>
          ) : (
            "No Vegas lines to compare."
          )
        }
      />
      <Tile
        title="Team scores inside the typical range"
        value={share(summary.scoresInRange)}
        detail="The typical range is the middle 80% of simulations, so about 80% is the target. Much lower means the model is overconfident; much higher, too cautious."
      />
      <Tile
        title="Player stats inside the typical range"
        value={share(summary.playersInRange)}
        detail={`${summary.playersInRange.hits.toLocaleString()} of ${summary.playersInRange.total.toLocaleString()} stats, for players shown on game pages who really played. Target about 80%.`}
      />
      <Tile
        title="Win chance score (Brier)"
        value={fixed(summary.brier, 3)}
        detail="Average of (chance given − what happened)². Lower is better: always saying 50% scores 0.250, a perfect crystal ball 0."
      />
    </section>
  );
}

function Tile({ title, value, detail }: { title: string; value: string; detail: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-edge bg-surface p-4">
      <h2 className="text-sm text-ink-2">{title}</h2>
      <div className="tabular text-2xl font-semibold">{value}</div>
      <p className="text-xs text-ink-2">{detail}</p>
    </div>
  );
}

function Calibration({ summary }: { summary: AccuracySummary }) {
  return (
    <section className="rounded-xl border border-edge bg-surface p-4">
      <h2 className="mb-1 font-semibold">Do the win chances mean what they say?</h2>
      <p className="mb-3 text-sm text-ink-2">
        When the model gives a team about 70%, that team should win about 7 times in 10. Groups with only a few games
        bounce around a lot.
      </p>
      <table className="tabular w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="py-1.5 text-left font-normal">Favorite&apos;s chance</th>
            <th className="py-1.5 text-right font-normal">Games</th>
            <th className="py-1.5 text-right font-normal">Model said</th>
            <th className="py-1.5 text-right font-normal">Favorite won</th>
          </tr>
        </thead>
        <tbody>
          {summary.calibration.map((bin) => (
            <tr key={bin.from} className="border-b border-line last:border-0">
              <td className="py-1.5">
                {pct(bin.from)}–{pct(bin.to)}
              </td>
              <td className="py-1.5 text-right">{bin.games}</td>
              <td className="py-1.5 text-right">{bin.games ? pct(bin.predicted) : "–"}</td>
              <td className="py-1.5 text-right font-medium">{bin.games ? pct(bin.actual) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Explainer() {
  return (
    <section className="rounded-xl border border-edge bg-surface p-4 text-sm text-ink-2">
      <h2 className="mb-1 font-semibold text-ink">Reading this page</h2>
      <ul className="flex list-disc flex-col gap-1.5 pl-4">
        <li>
          <span className="text-ink">Vegas is a tough benchmark.</span> Betting lines use far more information than
          this model (and millions of dollars of bets). Getting close to Vegas is a good result.
        </li>
        <li>
          <span className="text-ink">Upsets are expected.</span> A 65% favorite should lose about a third of the
          time, so picking winners right 100% of the time isn&apos;t the goal; honest chances are.
        </li>
        <li>
          <span className="text-ink">Small samples are noisy.</span> With 25 games, a couple of upsets swing the
          numbers. Compare changes using 100+ games where possible.
        </li>
      </ul>
    </section>
  );
}

function GamesTable({ league, evals }: { league: LeagueId; evals: GameEvaluation[] }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-edge bg-surface">
      <table className="tabular w-full min-w-[760px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-line">
            <th className="px-3 py-2 font-normal">Date</th>
            <th className="px-3 py-2 font-normal">Game</th>
            <th className="px-3 py-2 font-normal">Model pick</th>
            <th className="px-3 py-2 font-normal">Result</th>
            <th className="px-3 py-2 text-right font-normal">Projected margin</th>
            <th className="px-3 py-2 text-right font-normal">Real margin</th>
            <th className="px-3 py-2 text-right font-normal">Model off by</th>
            <th className="px-3 py-2 text-right font-normal">Vegas off by</th>
            <th className="px-3 py-2 text-right font-normal">Player stats in range</th>
          </tr>
        </thead>
        <tbody>
          {evals.map((e) => {
            const { check } = e;
            const pickAbbr = check.pick === "home" ? e.homeAbbr : e.awayAbbr;
            const pickChance = check.pick === "home" ? e.homeWinPct : e.awayWinPct;
            const result = (
              <>
                {e.awayAbbr} {check.away.actual} – {check.home.actual} {e.homeAbbr}
              </>
            );
            return (
              <tr key={e.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 whitespace-nowrap text-ink-2">{gameDay(e.date)}</td>
                <td className="px-3 py-2">
                  <Link href={`/${league}/game/${e.id}`} className="font-medium underline-offset-2 hover:underline">
                    {e.awayAbbr} @ {e.homeAbbr}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {pickAbbr} {pct(pickChance)}{" "}
                  {check.winner === "tie" ? (
                    <span className="text-ink-2">(tie)</span>
                  ) : check.winner === check.pick ? (
                    <span className="text-good-text">✓</span>
                  ) : (
                    <span className="text-ink-2">✗</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{result}</td>
                <td className="px-3 py-2 text-right">{marginText(e.homeAbbr, e.awayAbbr, check.margin.projected)}</td>
                <td className="px-3 py-2 text-right">
                  {marginText(e.homeAbbr, e.awayAbbr, check.margin.actual)} <RangeMark range={check.margin.range} />
                </td>
                <td className="px-3 py-2 text-right">{fixed(check.margin.miss, 1)}</td>
                <td className="px-3 py-2 text-right text-ink-2">
                  {check.vegasMarginMiss === undefined ? "–" : fixed(check.vegasMarginMiss, 1)}
                </td>
                <td className="px-3 py-2 text-right text-ink-2">
                  {e.players.checked ? `${e.players.inside} of ${e.players.checked}` : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function share(t: Tally): string {
  return t.total ? pct(t.hits / t.total) : "–";
}

function closer(model: number, vegas: number): string {
  if (Math.abs(model - vegas) < 0.05) return "About even.";
  return model < vegas ? "The model was closer." : "Vegas was closer.";
}
