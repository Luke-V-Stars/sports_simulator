// Settings that differ between the NFL and the NBA.

export type LeagueId = "nfl" | "nba";

export const LEAGUE_IDS: LeagueId[] = ["nfl", "nba"];

export interface StatDef {
  key: string;
  label: string; // short column header, e.g. "PTS"
  name: string; // full name, e.g. "Points"
  decimals: number; // how many decimals to show for an average
}

export interface LeagueConfig {
  id: LeagueId;
  name: string;
  // Path ESPN uses in its URLs, e.g. "football/nfl"
  espnPath: string;
  // Calendar months a season covers, in order (NBA runs Oct -> Jun).
  seasonMonths: number[];
  // ESPN names NBA seasons by the year they END (2026-27 is "2027"),
  // and NFL seasons by the year they START (2026-27 is "2026").
  seasonNamedByEndYear: boolean;
  // Average points the home team gains just by playing at home.
  homeAdvantage: number;
  // How many days until an old game counts half as much in the ratings.
  ratingHalfLifeDays: number;
  // Extra discount for games from last season (rosters change).
  previousSeasonWeight: number;
  // How many "imaginary average games" pull every team toward average,
  // so a team's rating doesn't swing wildly after one or two games.
  ratingShrinkGames: number;
  // How many recent games of box scores we use for player averages.
  playerSampleGames: number;
  // Typical size of a game-to-game swing in final margin (points).
  marginSpread: number;
  playerStats: StatDef[];
}

export const LEAGUES: Record<LeagueId, LeagueConfig> = {
  nfl: {
    id: "nfl",
    name: "NFL",
    espnPath: "football/nfl",
    seasonMonths: [9, 10, 11, 12, 1, 2],
    seasonNamedByEndYear: false,
    homeAdvantage: 1.8,
    ratingHalfLifeDays: 100,
    previousSeasonWeight: 0.6,
    ratingShrinkGames: 2,
    playerSampleGames: 8,
    marginSpread: 13.4,
    playerStats: [
      { key: "passYds", label: "PASS YDS", name: "Passing yards", decimals: 0 },
      { key: "passTd", label: "PASS TD", name: "Passing touchdowns", decimals: 1 },
      { key: "int", label: "INT", name: "Interceptions thrown", decimals: 1 },
      { key: "rushYds", label: "RUSH YDS", name: "Rushing yards", decimals: 0 },
      { key: "rushTd", label: "RUSH TD", name: "Rushing touchdowns", decimals: 1 },
      { key: "rec", label: "REC", name: "Receptions", decimals: 1 },
      { key: "recYds", label: "REC YDS", name: "Receiving yards", decimals: 0 },
      { key: "recTd", label: "REC TD", name: "Receiving touchdowns", decimals: 1 },
    ],
  },
  nba: {
    id: "nba",
    name: "NBA",
    espnPath: "basketball/nba",
    seasonMonths: [10, 11, 12, 1, 2, 3, 4, 5, 6],
    seasonNamedByEndYear: true,
    homeAdvantage: 2.4,
    ratingHalfLifeDays: 70,
    previousSeasonWeight: 0.6,
    ratingShrinkGames: 3,
    playerSampleGames: 10,
    marginSpread: 13.4,
    playerStats: [
      { key: "min", label: "MIN", name: "Minutes", decimals: 0 },
      { key: "pts", label: "PTS", name: "Points", decimals: 1 },
      { key: "reb", label: "REB", name: "Rebounds", decimals: 1 },
      { key: "ast", label: "AST", name: "Assists", decimals: 1 },
      { key: "fg3", label: "3PM", name: "Three-pointers made", decimals: 1 },
      { key: "stl", label: "STL", name: "Steals", decimals: 1 },
      { key: "blk", label: "BLK", name: "Blocks", decimals: 1 },
    ],
  },
};

export function isLeagueId(value: string): value is LeagueId {
  return value === "nfl" || value === "nba";
}

// The list of "YYYYMM" months to download for one season, e.g. NBA 2027 ->
// ["202610", "202611", ..., "202706"].
export function seasonMonthKeys(league: LeagueId, seasonYear: number): string[] {
  const config = LEAGUES[league];
  const startYear = config.seasonNamedByEndYear ? seasonYear - 1 : seasonYear;
  const firstMonth = config.seasonMonths[0];
  return config.seasonMonths.map((month) => {
    const year = month >= firstMonth ? startYear : startYear + 1;
    return `${year}${String(month).padStart(2, "0")}`;
  });
}

// "2026" for the NFL, "2026-27" for the NBA.
export function seasonLabel(league: LeagueId, seasonYear: number): string {
  if (!LEAGUES[league].seasonNamedByEndYear) return String(seasonYear);
  return `${seasonYear - 1}-${String(seasonYear).slice(2)}`;
}
