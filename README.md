# sports_simulator

A website that takes real stats and uses them to predict game outcomes, player stats and more, for the
**NFL** and **NBA**. Any game can be re-simulated as many times as you like.

- **Live data, free:** schedules, scores, box scores, rosters, injuries and betting lines come from ESPN's
  public data feeds (no account or API key needed).
- **Simulation:** each game is played 1,000–50,000 times. You get each team's win chance, projected score,
  margin and combined points charts, the most likely final scores, and a projected stat line (with a
  low–high range) for every player.
- **Play one game:** see a single simulated box score, then play it again and again.
- **Power rankings:** every team rated on offense and defense, adjusted for the opponents it has played.

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

## How the prediction works (short version)

1. **Team ratings:** every final score from this season and last season is used to give each team an
   offense and defense rating in "points compared with an average team", adjusted for opponents. Recent games
   count more.
2. **Expected score:** league average + your offense − their defense, plus a small home bonus.
3. **Injuries:** in each simulated game, "Out" players sit and "Questionable" players play about half the
   time. Missing key players lowers the team's expected points.
4. **Play it out:** NBA scores get bell-curve randomness. NFL games are played as ~11 possessions per team
   that end in touchdowns, field goals or nothing. Team totals are then split among the players who played,
   based on their recent share.
5. **Repeat** thousands of times and count the results.

The site's own **How it works** page explains this in more detail.

## Where things are

```
src/
  app/                      Pages (each folder is a URL)
    page.tsx                  /                   home page
    [league]/page.tsx         /nfl, /nba          games by week (NFL) or day (NBA)
    [league]/rankings/        /nfl/rankings       power rankings
    [league]/game/[id]/       /nfl/game/12345     one game + the simulator
    how-it-works/             /how-it-works
  components/               Reusable pieces of the pages
    simulator/Simulator.tsx   the interactive simulator dashboard
    charts/                   charts (built with the Recharts library)
  lib/
    espn.ts                 ALL communication with ESPN lives here
    leagues.ts              NFL vs NBA settings (home advantage, stats shown...)
    model/ratings.ts        team offense/defense ratings
    model/players.ts        player averages from recent box scores
    model/matchup.ts        gathers everything for one game
    sim/engine.ts           plays ONE simulated game
    sim/summary.ts          plays many games and summarizes them
```

Good first things to tweak: the numbers in `src/lib/leagues.ts` (e.g. `homeAdvantage`), or the injury
play chances in `playChance()` in `src/lib/model/players.ts`.

## Good to know

- ESPN's feeds are unofficial and could change without warning. If pages start showing errors,
  `src/lib/espn.ts` is the only file that should need fixing.
- Data is reused for a short time instead of being downloaded on every click: live scoreboards for 30
  seconds, recent games for a few minutes, finished seasons for a day.
- Predictions are for fun, not betting advice.
