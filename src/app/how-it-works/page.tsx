import Link from "next/link";

export const metadata = { title: "How it works · Sports Simulator" };

export default function HowItWorks() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 leading-relaxed">
      <h1 className="text-3xl font-semibold tracking-tight">How the simulator works</h1>

      <Step n={1} title="Get the data">
        Every few minutes the site reads ESPN&apos;s free public data feeds: schedules, final scores, live scores, box
        scores, rosters, injury reports and betting lines for every NFL and NBA game. Nothing is typed in by hand.
      </Step>

      <Step n={2} title="Rate every team">
        Each team gets an <strong>offense</strong> rating and a <strong>defense</strong> rating, measured in points
        compared with an average team. If a team scores 30 against a defense that usually allows 20, its offense looks
        good. If it scores 30 against a defense that usually allows 35, not so much. The model repeats that over every
        game, adjusting for opponents, until the ratings settle. Recent games count the most. Early in a season, last
        season&apos;s games still count a little, so a couple of lucky games can&apos;t make a team look elite.
      </Step>

      <Step n={3} title="Work out the expected score">
        For a matchup, a team is expected to score:{" "}
        <em>league average + its offense rating − the opponent&apos;s defense rating</em>, plus a small bonus for the
        home team (about 1.8 points in the NFL and 2.4 in the NBA, split between the teams).
        <p className="mt-2">
          Then game conditions nudge it. <strong>Rest:</strong> an NBA team on the second night of a back-to-back
          loses about 2 points of margin (1 off its own score, 1 added to the opponent&apos;s); an NFL team on a short
          week (5 days or less) loses about 1, and one coming off a bye gains about 1.{" "}
          <strong>Weather</strong> (outdoor NFL stadiums, from the free Open-Meteo service): each mph of wind above
          10 costs each team 0.15 points (up to 3), heavy rain or snow 0.75, and temperatures below 25°F 0.5. These
          are rough estimates, deliberately kept small.
        </p>
      </Step>

      <Step n={4} title="Decide who plays">
        Each simulated game first decides who plays. &quot;Out&quot; players never do; &quot;Questionable&quot; players
        play about half the time. Bench players get in about as often as they have lately: an NBA player the coach
        kept on the bench in 3 of the last 10 games plays in about 70% of simulations. Only one NFL quarterback plays:
        the highest healthy one on ESPN&apos;s depth chart. Regulars who missed recent games (back from injury, or
        just traded) are filled in with their own most recent games, last season&apos;s if needed, and in their
        first two games back they get about 75% and then 90% of their usual workload, since teams ease players
        back in.
        <p className="mt-2">
          Then the expected score is adjusted for who plays. The team ratings already include each player as often
          as he has played, so only changes count: when an important player sits, his team&apos;s expected points
          drop (a starting NFL quarterback is worth about 6 points) and his usual production goes to teammates; when
          one comes back after the team spent weeks without him, they rise. A player who has been out for a month and
          is still out barely moves anything, because the ratings already reflect those games without him.
        </p>
      </Step>

      <Step n={5} title="Play the game, thousands of times">
        <p>
          <strong>NBA:</strong> each team&apos;s score is its expected points plus random variation (a shared
          &quot;pace&quot; factor plus each team&apos;s own hot or cold night). Ties go to 5-minute overtimes.
        </p>
        <p className="mt-2">
          <strong>NFL:</strong> football scores come in chunks, so each team gets about 11 possessions, and each one
          ends in a touchdown, a field goal or nothing, with chances tuned to the expected score. That&apos;s why
          scores like 24–17 show up far more often than 23–18.
        </p>
        <p className="mt-2">
          Then each team&apos;s points, yards, rebounds and assists are split among the players who played, based on
          their share over the last 8 (NFL) or 10 (NBA) games, with some randomness so a role player can have a big
          night.
        </p>
      </Step>

      <Step n={6} title="Summarize">
        After 10,000 games, the share each team won is its win chance. The averages become the projected score and
        player stats, and the spread of results gives the &quot;quiet game to big game&quot; ranges. Press{" "}
        <strong>Run again</strong> and you get a brand new set of 10,000 games, so the numbers move slightly, which is
        a good reminder that this is all about chances, not certainties.
      </Step>

      <section className="rounded-xl border border-edge bg-surface p-4 text-sm text-ink-2">
        <h2 className="mb-1 font-semibold text-ink">What it doesn&apos;t know</h2>
        Travel, altitude, coaching changes, and how much a newly traded player lifts his new team (he gets his share
        of the stats, but the team&apos;s expected points only catch up as he plays). Backups new to a team, and
        rookies with no games yet, are left out. It also uses ESPN&apos;s unofficial feeds, which could change without notice. Treat
        the numbers as an educated estimate, and compare them with the Vegas lines shown on each game.
      </section>

      <Link href="/" className="self-start text-sm font-medium underline">
        Go simulate a game →
      </Link>
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 font-semibold">
        {n}
      </span>
      <div>
        <h2 className="mb-1 text-lg font-semibold">{title}</h2>
        <div className="text-ink-2">{children}</div>
      </div>
    </section>
  );
}
