import { PrismaClient, Pick } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

// Deterministic pseudo-random number generator (mulberry32)
// so seed script produces the same predictions every run
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);

type MatchWithOdds = {
  id: string;
  matchNumber: number;
  oddsHome: Decimal;
  oddsDraw: Decimal;
  oddsAway: Decimal;
};

// ── Personality: pick functions ──────────────────────────────────────

// Mads – always bets the favorite, except ~3 random deviations
function madsPicks(matches: MatchWithOdds[]): Pick[] {
  const deviateAt = new Set([3, 8, 11]); // match numbers where Mads goes rogue
  return matches.map((m) => {
    const h = m.oddsHome.toNumber(), d = m.oddsDraw.toNumber(), a = m.oddsAway.toNumber();
    const fav = h <= d && h <= a ? "HOME" : a <= d ? "AWAY" : "DRAW";
    if (deviateAt.has(m.matchNumber)) {
      // pick second-most-likely instead
      const sorted: Pick[] = [
        { k: "HOME" as Pick, v: h }, { k: "DRAW" as Pick, v: d }, { k: "AWAY" as Pick, v: a },
      ].sort((a, b) => a.v - b.v).map((x) => x.k);
      return sorted[1];
    }
    return fav;
  });
}

// Søren – pattern bettor, repeating blocks: 1,1,1,X,X,X,2,2,2,1,1,1,X
function sørenPicks(matches: MatchWithOdds[]): Pick[] {
  const pattern: Pick[] = [
    "HOME","HOME","HOME",
    "DRAW","DRAW","DRAW",
    "AWAY","AWAY","AWAY",
    "HOME","HOME","HOME",
    "DRAW",
  ];
  return matches.map((_, i) => pattern[i]);
}

// Steffen – the analyst; hand-picked based on actual match knowledge
function steffenPicks(matches: MatchWithOdds[]): Pick[] {
  //  1 FCM vs Sønderjyske       → HOME (FCM dominant at home)
  //  2 Horsens vs Lyngby        → AWAY (Lyngby slight favorite, Steffen agrees)
  //  3 Chelsea vs Port Vale     → HOME (obvious cup mismatch)
  //  4 Mallorca vs Real Madrid  → AWAY (Real too strong)
  //  5 Sassuolo vs Cagliari     → HOME (Sassuolo promoted, hungry at home)
  //  6 Bremen vs Leipzig        → DRAW (Bremen solid at home, Leipzig inconsistent)
  //  7 Freiburg vs Bayern       → AWAY (Bayern quality wins out)
  //  8 HSV vs Augsburg          → HOME (HSV strong at Volksparkstadion)
  //  9 Hoffenheim vs Mainz      → HOME (Hoffenheim home form)
  // 10 Gaziantep vs Alanyaspor  → DRAW (Turkish league chaos, cagey match)
  // 11 PSV vs Utrecht           → HOME (PSV too strong)
  // 12 Nacional vs Estrela      → HOME (Nacional home advantage)
  // 13 Strasbourg vs Nice       → HOME (Strasbourg's Meinau fortress)
  const picks: Pick[] = [
    "HOME","AWAY","HOME","AWAY","HOME",
    "DRAW","AWAY","HOME","HOME","DRAW",
    "HOME","HOME","HOME",
  ];
  return matches.map((_, i) => picks[i]);
}

// Michael – value hunter; picks the outcome whose implied probability
// is furthest below what he considers "fair". We simulate "odds movement"
// by nudging each outcome's implied prob randomly, then picking the one
// where current odds overestimate the price the most (best value).
function michaelPicks(matches: MatchWithOdds[]): Pick[] {
  // Simulated "true probability shift" per match (positive = became more likely)
  // These represent Michael seeing news/lineups/form that the market hasn't priced in yet
  const shifts: { h: number; d: number; a: number }[] = [
    { h:  0.05, d: -0.02, a: -0.03 }, //  1 FCM even stronger than odds say
    { h: -0.04, d:  0.06, a: -0.02 }, //  2 draw more likely after injury news
    { h:  0.02, d: -0.01, a: -0.01 }, //  3 Chelsea even more dominant
    { h: -0.03, d: -0.02, a:  0.05 }, //  4 Real Madrid resting less players than expected
    { h:  0.03, d:  0.04, a: -0.07 }, //  5 Sassuolo form underestimated
    { h: -0.02, d: -0.03, a:  0.05 }, //  6 Leipzig key player returns from injury
    { h:  0.06, d: -0.02, a: -0.04 }, //  7 Bayern rotation, Freiburg undervalued
    { h: -0.05, d:  0.07, a: -0.02 }, //  8 tight HSV-Augsburg → value on draw
    { h:  0.04, d: -0.02, a: -0.02 }, //  9 Hoffenheim even better at home
    { h: -0.03, d: -0.02, a:  0.05 }, // 10 Alanyaspor form uptick
    { h:  0.03, d: -0.01, a: -0.02 }, // 11 PSV dominant
    { h: -0.04, d:  0.05, a: -0.01 }, // 12 tight game, draw value
    { h: -0.02, d: -0.03, a:  0.05 }, // 13 Nice better away than odds suggest
  ];

  return matches.map((m, i) => {
    const h = m.oddsHome.toNumber(), d = m.oddsDraw.toNumber(), a = m.oddsAway.toNumber();
    // implied probabilities from odds
    const pH = 1 / h, pD = 1 / d, pA = 1 / a;
    // Michael's estimated "true" probs (shifted)
    const s = shifts[i];
    const tH = pH + s.h, tD = pD + s.d, tA = pA + s.a;
    // value = true prob − implied prob (bigger = better deal)
    const vH = tH - pH, vD = tD - pD, vA = tA - pA;
    if (vH >= vD && vH >= vA) return "HOME";
    if (vA >= vD) return "AWAY";
    return "DRAW";
  });
}

// Bjarke – pure RNG
function bjarkePicks(matches: MatchWithOdds[]): Pick[] {
  return matches.map(() => {
    const r = rng();
    if (r < 0.34) return "HOME";
    if (r < 0.67) return "DRAW";
    return "AWAY";
  });
}

// Test users – fake authIds so they won't collide with real Supabase users
const testUsers = [
  { id: "00000000-0000-0000-0001-000000000001", authId: "test-auth-mads",    email: "mads@test.local",    displayName: "Mads" },
  { id: "00000000-0000-0000-0001-000000000002", authId: "test-auth-michael", email: "michael@test.local", displayName: "Michael" },
  { id: "00000000-0000-0000-0001-000000000003", authId: "test-auth-soeren",  email: "soeren@test.local",  displayName: "Søren" },
  { id: "00000000-0000-0000-0001-000000000004", authId: "test-auth-steffen", email: "steffen@test.local", displayName: "Steffen" },
  { id: "00000000-0000-0000-0001-000000000005", authId: "test-auth-bjarke",  email: "bjarke@test.local",  displayName: "Bjarke" },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Seed script cannot run in production. Set NODE_ENV=development to proceed.");
    process.exit(1);
  }

  // Create (or find) the active season
  const season = await prisma.season.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Forår 2026",
      startDate: new Date("2026-03-28"),
      numRounds: 12,
      isActive: true,
    },
  });

  console.log(`Season: ${season.name} (${season.id})`);

  // Coupon 1017141 – Lørdagstips, lør 14:55
  const deadline = new Date("2026-04-04T12:55:00Z"); // 14:55 CET

  const round = await prisma.round.upsert({
    where: {
      seasonId_roundNumber: {
        seasonId: season.id,
        roundNumber: 1,
      },
    },
    update: { deadline },
    create: {
      seasonId: season.id,
      roundNumber: 1,
      deadline,
      status: "open",
    },
  });

  console.log(`Round: #${round.roundNumber} (${round.id})`);

  // 13 matches from https://danskespil.dk/tips/kupon/1017141/tf13/lrdagstips
  const matches = [
    { n: 1,  home: "FC Midtjylland",       away: "Sønderjyske",         league: "Superligaen",   h: 1.44, d: 5.00, a: 6.00 },
    { n: 2,  home: "Horsens",              away: "Lyngby",              league: "Superligaen",   h: 3.40, d: 3.40, a: 2.05 },
    { n: 3,  home: "Chelsea",              away: "Port Vale",           league: "FA Cup",        h: 1.06, d: 11.00, a: 18.00 },
    { n: 4,  home: "Mallorca",             away: "Real Madrid",         league: "La Liga",       h: 5.50, d: 4.25, a: 1.56 },
    { n: 5,  home: "Sassuolo",             away: "Cagliari",            league: "Serie A",       h: 2.01, d: 3.20, a: 4.00 },
    { n: 6,  home: "Werder Bremen",        away: "RB Leipzig",          league: "Bundesliga",    h: 3.25, d: 3.85, a: 2.07 },
    { n: 7,  home: "Freiburg",             away: "Bayern München",      league: "Bundesliga",    h: 6.50, d: 5.50, a: 1.41 },
    { n: 8,  home: "Hamburger SV",         away: "Augsburg",            league: "2. Bundesliga", h: 2.26, d: 3.45, a: 3.15 },
    { n: 9,  home: "Hoffenheim",           away: "Mainz",              league: "Bundesliga",    h: 1.76, d: 4.00, a: 4.25 },
    { n: 10, home: "Gaziantepspor",        away: "Alanyaspor",          league: "Süper Lig",     h: 2.75, d: 3.30, a: 2.46 },
    { n: 11, home: "PSV Eindhoven",        away: "Utrecht",             league: "Eredivisie",    h: 1.49, d: 4.50, a: 5.25 },
    { n: 12, home: "Nacional De Madeira",   away: "Estrela",             league: "Primeira Liga", h: 1.98, d: 3.40, a: 3.50 },
    { n: 13, home: "Strasbourg",           away: "Nice",                league: "Ligue 1",       h: 1.84, d: 3.75, a: 4.25 },
  ];

  // All matches kick off at 14:55 CET on the same Saturday
  const kickoff = new Date("2026-04-04T12:55:00Z");

  for (const m of matches) {
    const match = await prisma.match.upsert({
      where: {
        roundId_matchNumber: {
          roundId: round.id,
          matchNumber: m.n,
        },
      },
      update: {
        homeTeam: m.home,
        awayTeam: m.away,
        league: m.league,
        kickoff,
        oddsHome: m.h,
        oddsDraw: m.d,
        oddsAway: m.a,
      },
      create: {
        roundId: round.id,
        matchNumber: m.n,
        homeTeam: m.home,
        awayTeam: m.away,
        league: m.league,
        kickoff,
        oddsHome: m.h,
        oddsDraw: m.d,
        oddsAway: m.a,
      },
    });
    console.log(`  Match ${m.n}: ${m.home} vs ${m.away} (${match.id})`);
  }

  // --- Clean up old test users (from previous seed versions) ---
  await prisma.user.deleteMany({
    where: { authId: { startsWith: "test-auth-" } },
  });

  // --- Test users ---
  console.log("\nCreating test users...");
  const createdUsers = [];
  for (const u of testUsers) {
    const user = await prisma.user.upsert({
      where: { authId: u.authId },
      update: { email: u.email, displayName: u.displayName },
      create: u,
    });
    createdUsers.push(user);
    console.log(`  User: ${user.displayName} (${user.id})`);
  }

  // --- Predictions for each test user (personality-driven) ---
  console.log("\nCreating predictions...");
  const roundMatches = await prisma.match.findMany({
    where: { roundId: round.id },
    orderBy: { matchNumber: "asc" },
  });

  const picksByUser: Record<string, (m: MatchWithOdds[]) => Pick[]> = {
    "Mads":    madsPicks,
    "Michael": michaelPicks,
    "Søren":   sørenPicks,
    "Steffen": steffenPicks,
    "Bjarke":  bjarkePicks,
  };

  for (const user of createdUsers) {
    const pickFn = picksByUser[user.displayName];
    const picks = pickFn(roundMatches);
    for (let i = 0; i < roundMatches.length; i++) {
      await prisma.prediction.upsert({
        where: { userId_matchId: { userId: user.id, matchId: roundMatches[i].id } },
        update: { pick: picks[i] },
        create: {
          roundId: round.id,
          userId: user.id,
          matchId: roundMatches[i].id,
          pick: picks[i],
        },
      });
    }
    console.log(`  ${user.displayName}: ${picks.map(p => p === "HOME" ? "1" : p === "DRAW" ? "X" : "2").join(",")}`);
  }

  console.log("\nDone! Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
