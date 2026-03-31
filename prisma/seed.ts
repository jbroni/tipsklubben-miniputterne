import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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

  console.log("\nDone! Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
