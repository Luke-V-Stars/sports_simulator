# sports_simulator

A website that takes real stats and uses them to predict game outcomes, player stats and more, for the
**NFL** and **NBA**. Any game can be re-simulated as many times as you like.

- **Live data, free:** schedules, scores, box scores, rosters, depth charts, injuries and betting lines come
  from ESPN's public data feeds, and weather for outdoor NFL games from Open-Meteo (no accounts or API keys
  needed for either).
- **Simulation:** each game is played 1,000–50,000 times. You get each team's win chance, projected score,
  margin and combined points charts, the most likely final scores, and a projected stat line (with a
  low–high range) for every player.
- **Play one game:** see a single simulated box score, then play it again and again.
- **Power rankings:** every team rated on offense and defense, adjusted for the opponents it has played.
- **Accuracy report:** re-predicts this season's finished games using only what was known beforehand, and
  scores the predictions against the real results and the Vegas lines.

## Running it on your computer

You need [Node.js](https://nodejs.org) (version 20 or newer) installed.

```bash
cd sports_simulator
npm install      # first time only: downloads the libraries the project uses
npm run dev      # starts the website
```

Then open <http://localhost:3000> in your browser. Leave the terminal window open while you use the site;
press `Ctrl + C` in it to stop the website.

Other commands:

| Command         | What it does                                                        |
| --------------- | ------------------------------------------------------------------- |
| `npm run dev`   | Runs the site in development mode (reloads when you edit code).     |
| `npm run build` | Checks the whole project and makes an optimized version.            |
| `npm run start` | Runs the optimized version (after `npm run build`).                 |
| `npm run lint`  | Looks for common mistakes in the code.                              |
| `npm test`      | Runs the automated tests (checks the model's rules still hold).     |

## How the prediction works (short version)

1. **Team ratings:** every final score from this season and last season is used to give each team an
   offense and defense rating in "points compared with an average team", adjusted for opponents. Recent games
   count more.
2. **Expected score:** league average + your offense − their defense, plus a small home bonus, then nudged
   for rest (NBA back-to-backs, NFL short weeks and byes) and weather (wind, rain or snow, cold).
3. **Who plays:** in each simulated game, "Out" players sit and "Questionable" players play about half the
   time. Bench players get in about as often as they have lately, and only one NFL quarterback plays (the
   highest healthy one on the depth chart). Regulars back from injury are filled in with their own recent
   games and get a lighter workload for their first two games back.
4. **Lineup changes:** the team ratings already include each player as often as he has played, so only the
   difference counts: a star who sits lowers the expected score, one back after weeks out raises it.
5. **Play it out:** NBA scores get bell-curve randomness. NFL games are played as ~11 possessions per team
   that end in touchdowns, field goals or nothing. Team totals (leaning toward what the opponent's defense
   usually allows) are then split among the players who played, in whole numbers, based on their recent share
   and how much their own numbers swing. A sitting player's role goes mostly to players at his position.
6. **Repeat** thousands of times and count the results.

The site's own **How it works** page explains this in more detail.

## Where things are

```
src/
  app/                      Pages (each folder is a URL)
    page.tsx                  /                   home page
    [league]/page.tsx         /nfl, /nba          games by week (NFL) or day (NBA)
    [league]/rankings/        /nfl/rankings       power rankings
    [league]/accuracy/        /nfl/accuracy       season accuracy report
    [league]/game/[id]/       /nfl/game/12345     one game + the simulator
    how-it-works/             /how-it-works
  components/               Reusable pieces of the pages
    simulator/Simulator.tsx   the interactive simulator dashboard
    charts/                   charts (built with the Recharts library)
  lib/
    espn.ts                 ALL communication with ESPN lives here
    weather.ts              weather at outdoor NFL stadiums (Open-Meteo)
    leagues.ts              NFL vs NBA settings (home advantage, stats shown...)
    model/ratings.ts        team offense/defense ratings
    model/players.ts        player averages, roles, returning players
    model/conditions.ts     rest, weather and opponent-matchup adjustments
    model/matchup.ts        gathers everything for one game
    model/accuracy.ts       re-predicts finished games for the accuracy report
    sim/engine.ts           plays ONE simulated game
    sim/summary.ts          plays many games and summarizes them
    sim/compare.ts          checks predictions against real results
  **/*.test.ts              automated tests (run with `npm test`)
```

Good first things to tweak: the numbers in `src/lib/leagues.ts` (e.g. `homeAdvantage`), the injury
play chances in `playChance()` and the returning-player workload `RUST_WORKLOAD` in
`src/lib/model/players.ts`, or the rest and weather sizes at the top of `src/lib/model/conditions.ts`.
After a change, run `npm test`, then check the **Accuracy** page (100+ games) to see whether it helped. Check
both the range score and the typical miss: widening ranges raises the first without improving the second.

## Good to know

- ESPN's feeds are unofficial and could change without warning. If pages start showing errors,
  `src/lib/espn.ts` is the only file that should need fixing.
- Weather uses a small table of outdoor stadium locations in `src/lib/weather.ts`. A new stadium (say, a new
  international game) just gets no weather until it's added there.
- Injuries come from each team's roster (ESPN's game pages list only 5 per team). ESPN keeps only each
  player's latest injury news, so for a game already played the site uses today's report minus anything
  updated after kickoff; injuries that healed since then can't be seen.
- The accuracy report's first load can take a minute or two while it downloads box scores; after that it's
  quick.
- Data is reused for a short time instead of being downloaded on every click: live scoreboards for 30
  seconds, recent games for a few minutes, finished seasons for a day.
- Predictions are for fun, not betting advice.
