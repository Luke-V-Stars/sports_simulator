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
      </Step>

      <Step n={4} title="Account for injuries">
        Each simulated game first decides who plays. &quot;Out&quot; players never do; &quot;Questionable&quot; players
        play about half the time. When an important player sits, his team&apos;s expected points drop (a starting NFL
        quarterback is worth about 6 points) and his usual production is handed to teammates who did play.
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
        Weather, rest days and travel, coaching changes, and players who just joined a team (they have no box scores
        with their new team yet). It also uses ESPN&apos;s unofficial feeds, which could change without notice. Treat
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
