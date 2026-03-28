const BASE_URL = "https://api.football-data.org/v4";

const LEAGUE_CODES: Record<string, string> = {
  "Premier League": "PL",
  "Bundesliga": "BL1",
  "Serie A": "SA",
  "La Liga": "PD",
  // Danish Superliga not available on free tier
};

interface ApiMatch {
  id: number;
  homeTeam: { name: string };
  awayTeam: { name: string };
  utcDate: string;
  competition: { name: string };
  score?: {
    fullTime: { home: number | null; away: number | null };
  };
}

export interface FixtureResult {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
}

export interface MatchResult {
  externalId: string;
  result: "1" | "X" | "2";
}

async function apiFetch(path: string) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error("FOOTBALL_DATA_API_KEY not set");

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-Auth-Token": apiKey },
    next: { revalidate: 300 }, // cache 5 min
  });

  if (!res.ok) {
    throw new Error(`Football API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetch upcoming fixtures for a given league and matchday/date range.
 */
export async function fetchFixtures(
  league: string,
  dateFrom: string,
  dateTo: string
): Promise<FixtureResult[]> {
  const code = LEAGUE_CODES[league];
  if (!code) throw new Error(`Unknown league: ${league}`);

  const data = await apiFetch(
    `/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED,TIMED`
  );

  return (data.matches as ApiMatch[]).map((m) => ({
    externalId: String(m.id),
    homeTeam: m.homeTeam.name,
    awayTeam: m.awayTeam.name,
    league: m.competition.name,
    kickoff: m.utcDate,
  }));
}

/**
 * Fetch results for matches by their external IDs.
 */
export async function fetchResults(
  externalIds: string[]
): Promise<MatchResult[]> {
  const results: MatchResult[] = [];

  for (const id of externalIds) {
    const data = await apiFetch(`/matches/${id}`);
    const match = data as ApiMatch;
    const home = match.score?.fullTime?.home;
    const away = match.score?.fullTime?.away;

    if (home === null || away === null || home === undefined || away === undefined) {
      continue; // match not finished
    }

    let result: "1" | "X" | "2";
    if (home > away) result = "1";
    else if (home === away) result = "X";
    else result = "2";

    results.push({ externalId: id, result });
  }

  return results;
}

/**
 * Get available leagues for the football API.
 */
export function getAvailableLeagues(): string[] {
  return Object.keys(LEAGUE_CODES);
}
