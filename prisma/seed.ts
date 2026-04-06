import { PrismaClient, Pick, RoundStatus } from "@prisma/client";
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

type MatchWithOdds = {
  id: string;
  matchNumber: number;
  oddsHome: Decimal;
  oddsDraw: Decimal;
  oddsAway: Decimal;
};

type MatchDef = {
  n: number;
  home: string;
  away: string;
  league: string;
  h: number;
  d: number;
  a: number;
  result?: Pick;
};

type RoundDef = {
  roundNumber: number;
  deadlineUTC: string;
  status: RoundStatus;
  matches: MatchDef[];
  steffenPicks: Pick[];
  michaelShifts: { h: number; d: number; a: number }[];
  madsDeviateAt: Set<number>;
  bjarkeRngSeed: number;
};

// ── Personality: pick functions ──────────────────────────────────────

// Mads – always bets the favorite, except a few deviations per round
function madsPicks(matches: MatchWithOdds[], deviateAt: Set<number>): Pick[] {
  return matches.map((m) => {
    const h = m.oddsHome.toNumber(), d = m.oddsDraw.toNumber(), a = m.oddsAway.toNumber();
    const fav = h <= d && h <= a ? "HOME" : a <= d ? "AWAY" : "DRAW";
    if (deviateAt.has(m.matchNumber)) {
      // pick second-most-likely instead
      const sorted: Pick[] = [
        { k: "HOME" as Pick, v: h }, { k: "DRAW" as Pick, v: d }, { k: "AWAY" as Pick, v: a },
      ].sort((x, y) => x.v - y.v).map((x) => x.k);
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

// Michael – value hunter; picks the outcome whose implied probability
// is furthest below what he considers "fair". We simulate "odds movement"
// by nudging each outcome's implied prob, then picking the one with most value.
function michaelPicks(matches: MatchWithOdds[], shifts: { h: number; d: number; a: number }[]): Pick[] {
  return matches.map((m, i) => {
    const h = m.oddsHome.toNumber(), d = m.oddsDraw.toNumber(), a = m.oddsAway.toNumber();
    // implied probabilities from odds
    const pH = 1 / h, pD = 1 / d, pA = 1 / a;
    // Michael's estimated "true" probs (shifted by news/form)
    const s = shifts[i];
    const tH = pH + s.h, tD = pD + s.d, tA = pA + s.a;
    // value = true prob − implied prob (bigger = better deal)
    const vH = tH - pH, vD = tD - pD, vA = tA - pA;
    if (vH >= vD && vH >= vA) return "HOME";
    if (vA >= vD) return "AWAY";
    return "DRAW";
  });
}

// Bjarke – pure RNG with per-round seed for determinism
function bjarkePicks(matches: MatchWithOdds[], rng: () => number): Pick[] {
  return matches.map(() => {
    const r = rng();
    if (r < 0.34) return "HOME";
    if (r < 0.67) return "DRAW";
    return "AWAY";
  });
}

// ── Round data ────────────────────────────────────────────────────────────────

const roundDefs: RoundDef[] = [
  // ─── Round 1 – Lørdagstips, 5 Apr 2026 ─────────────────────────────────────
  {
    roundNumber: 1,
    deadlineUTC: "2026-04-04T12:55:00Z",
    status: "completed",
    madsDeviateAt: new Set([3, 8, 11]),
    bjarkeRngSeed: 42,
    // Steffen – hand-picked based on actual match knowledge
    //  1 FCM vs Sønderjyske      → HOME (FCM dominant at home)
    //  2 Horsens vs Lyngby       → AWAY (Lyngby slight favorite)
    //  3 Chelsea vs Port Vale    → HOME (obvious cup mismatch)
    //  4 Mallorca vs Real Madrid → AWAY (Real too strong)
    //  5 Sassuolo vs Cagliari    → HOME (promoted, hungry at home)
    //  6 Bremen vs Leipzig       → DRAW (solid home vs inconsistent away)
    //  7 Freiburg vs Bayern      → AWAY (Bayern quality wins out)
    //  8 HSV vs Augsburg         → HOME (HSV strong at Volksparkstadion)
    //  9 Hoffenheim vs Mainz     → HOME (Hoffenheim home form)
    // 10 Gaziantep vs Alanyaspor → DRAW (Turkish league chaos)
    // 11 PSV vs Utrecht          → HOME (PSV too strong)
    // 12 Nacional vs Estrela     → HOME (home advantage)
    // 13 Strasbourg vs Nice      → HOME (Meinau fortress)
    steffenPicks: [
      "HOME","AWAY","HOME","AWAY","HOME",
      "DRAW","AWAY","HOME","HOME","DRAW",
      "HOME","HOME","HOME",
    ],
    // Michael – simulated "true probability shifts" representing news/form he's seen
    michaelShifts: [
      { h:  0.05, d: -0.02, a: -0.03 }, //  1 FCM even stronger than odds say
      { h: -0.04, d:  0.06, a: -0.02 }, //  2 draw more likely after injury news
      { h:  0.02, d: -0.01, a: -0.01 }, //  3 Chelsea even more dominant
      { h: -0.03, d: -0.02, a:  0.05 }, //  4 Real Madrid resting fewer players than expected
      { h:  0.03, d:  0.04, a: -0.07 }, //  5 Sassuolo form underestimated
      { h: -0.02, d: -0.03, a:  0.05 }, //  6 Leipzig key player returns from injury
      { h:  0.06, d: -0.02, a: -0.04 }, //  7 Bayern rotation, Freiburg undervalued
      { h: -0.05, d:  0.07, a: -0.02 }, //  8 tight match → value on draw
      { h:  0.04, d: -0.02, a: -0.02 }, //  9 Hoffenheim even better at home
      { h: -0.03, d: -0.02, a:  0.05 }, // 10 Alanyaspor form uptick
      { h:  0.03, d: -0.01, a: -0.02 }, // 11 PSV dominant
      { h: -0.04, d:  0.05, a: -0.01 }, // 12 tight game, draw value
      { h: -0.02, d: -0.03, a:  0.05 }, // 13 Nice better away than odds suggest
    ],
    matches: [
      { n:  1, home: "FC Midtjylland",      away: "Sønderjyske",         league: "Superligaen",   h: 1.44, d:  5.00, a:  6.00, result: "HOME" },
      { n:  2, home: "Horsens",             away: "Lyngby",              league: "Superligaen",   h: 3.40, d:  3.40, a:  2.05, result: "AWAY" },
      { n:  3, home: "Chelsea",             away: "Port Vale",           league: "FA Cup",        h: 1.06, d: 11.00, a: 18.00, result: "HOME" },
      { n:  4, home: "Mallorca",            away: "Real Madrid",         league: "La Liga",       h: 5.50, d:  4.25, a:  1.56, result: "AWAY" },
      { n:  5, home: "Sassuolo",            away: "Cagliari",            league: "Serie A",       h: 2.01, d:  3.20, a:  4.00, result: "HOME" },
      { n:  6, home: "Werder Bremen",       away: "RB Leipzig",          league: "Bundesliga",    h: 3.25, d:  3.85, a:  2.07, result: "DRAW" },
      { n:  7, home: "Freiburg",            away: "Bayern München",      league: "Bundesliga",    h: 6.50, d:  5.50, a:  1.41, result: "AWAY" },
      { n:  8, home: "Hamburger SV",        away: "Augsburg",            league: "2. Bundesliga", h: 2.26, d:  3.45, a:  3.15, result: "HOME" },
      { n:  9, home: "Hoffenheim",          away: "Mainz",               league: "Bundesliga",    h: 1.76, d:  4.00, a:  4.25, result: "HOME" },
      { n: 10, home: "Gaziantepspor",       away: "Alanyaspor",          league: "Süper Lig",     h: 2.75, d:  3.30, a:  2.46, result: "AWAY" },
      { n: 11, home: "PSV Eindhoven",       away: "Utrecht",             league: "Eredivisie",    h: 1.49, d:  4.50, a:  5.25, result: "HOME" },
      { n: 12, home: "Nacional De Madeira", away: "Estrela",             league: "Primeira Liga", h: 1.98, d:  3.40, a:  3.50, result: "DRAW" },
      { n: 13, home: "Strasbourg",          away: "Nice",                league: "Ligue 1",       h: 1.84, d:  3.75, a:  4.25, result: "AWAY" },
    ],
  },

  // ─── Round 2 – Lørdagstips, 12 Apr 2026 ────────────────────────────────────
  {
    roundNumber: 2,
    deadlineUTC: "2026-04-12T10:00:00Z",
    status: "completed",
    madsDeviateAt: new Set([2, 6, 12]),
    bjarkeRngSeed: 84,
    //  1 Brøndby vs FCK           → DRAW (derby – either side)
    //  2 AGF vs Silkeborg         → HOME (AGF home advantage)
    //  3 Arsenal vs Wolverhampton → HOME (Arsenal class)
    //  4 Barcelona vs Getafe      → HOME (routine win)
    //  5 Atalanta vs Juventus     → DRAW (old rivals, cagey)
    //  6 Dortmund vs Bochum       → HOME (Dortmund comfortable)
    //  7 Köln vs Schalke          → DRAW (2. Bundesliga chaos)
    //  8 Lazio vs AC Milan        → AWAY (Milan better form)
    //  9 Ajax vs Feyenoord        → HOME (Ajax at Amsterdam Arena)
    // 10 Valencia vs Atletico     → AWAY (Atletico quality)
    // 11 Lyon vs Monaco           → HOME (Lyon slight edge)
    // 12 Brighton vs Everton      → HOME (Brighton superior)
    // 13 Villarreal vs Sevilla    → DRAW (tough Andalusian derby)
    steffenPicks: [
      "DRAW","HOME","HOME","HOME","DRAW",
      "HOME","DRAW","AWAY","HOME","AWAY",
      "HOME","HOME","DRAW",
    ],
    michaelShifts: [
      { h: -0.03, d:  0.07, a: -0.04 }, //  1 derby → draw edge
      { h:  0.04, d: -0.02, a: -0.02 }, //  2 AGF home value
      { h:  0.02, d: -0.01, a: -0.01 }, //  3 Arsenal even more dominant
      { h:  0.03, d: -0.01, a: -0.02 }, //  4 Barca extra motivated
      { h: -0.02, d:  0.05, a: -0.03 }, //  5 both sides happy with a point
      { h:  0.03, d: -0.01, a: -0.02 }, //  6 Dortmund obvious
      { h: -0.05, d:  0.02, a:  0.03 }, //  7 Schalke form uptick
      { h: -0.04, d: -0.01, a:  0.05 }, //  8 Milan rested and sharp
      { h:  0.04, d: -0.02, a: -0.02 }, //  9 Ajax home crowd factor
      { h: -0.03, d: -0.01, a:  0.04 }, // 10 Atletico value
      { h:  0.03, d: -0.02, a: -0.01 }, // 11 Lyon at home
      { h:  0.04, d: -0.01, a: -0.03 }, // 12 Brighton quality
      { h: -0.02, d:  0.04, a: -0.02 }, // 13 draw value in derby
    ],
    matches: [
      { n:  1, home: "Brøndby",             away: "FC Copenhagen",       league: "Superligaen",   h: 3.20, d: 3.40, a: 2.30, result: "DRAW" },
      { n:  2, home: "AGF",                 away: "Silkeborg",           league: "Superligaen",   h: 2.10, d: 3.40, a: 3.50, result: "HOME" },
      { n:  3, home: "Arsenal",             away: "Wolverhampton",       league: "Premier League",h: 1.35, d: 5.50, a: 8.00, result: "HOME" },
      { n:  4, home: "Barcelona",           away: "Getafe",              league: "La Liga",       h: 1.29, d: 6.00, a: 9.50, result: "HOME" },
      { n:  5, home: "Atalanta",            away: "Juventus",            league: "Serie A",       h: 2.60, d: 3.40, a: 2.70, result: "DRAW" },
      { n:  6, home: "Borussia Dortmund",   away: "Bochum",              league: "Bundesliga",    h: 1.50, d: 4.25, a: 6.50, result: "HOME" },
      { n:  7, home: "Köln",               away: "Schalke",              league: "2. Bundesliga", h: 2.20, d: 3.30, a: 3.10, result: "HOME" },
      { n:  8, home: "Lazio",              away: "AC Milan",             league: "Serie A",       h: 3.60, d: 3.50, a: 2.05, result: "AWAY" },
      { n:  9, home: "Ajax",               away: "Feyenoord",            league: "Eredivisie",    h: 2.40, d: 3.40, a: 2.90, result: "HOME" },
      { n: 10, home: "Valencia",           away: "Atlético Madrid",      league: "La Liga",       h: 4.50, d: 4.00, a: 1.72, result: "AWAY" },
      { n: 11, home: "Lyon",               away: "Monaco",               league: "Ligue 1",       h: 2.25, d: 3.30, a: 3.20, result: "HOME" },
      { n: 12, home: "Brighton",           away: "Everton",              league: "Premier League",h: 1.75, d: 3.90, a: 4.75, result: "HOME" },
      { n: 13, home: "Villarreal",         away: "Sevilla",              league: "La Liga",       h: 2.05, d: 3.30, a: 3.60, result: "DRAW" },
    ],
  },

  // ─── Round 3 – Lørdagstips, 19 Apr 2026 ────────────────────────────────────
  {
    roundNumber: 3,
    deadlineUTC: "2026-04-19T10:00:00Z",
    status: "completed",
    madsDeviateAt: new Set([4, 7, 13]),
    bjarkeRngSeed: 126,
    //  1 FC Nordsjælland vs Randers  → HOME (FCN home)
    //  2 OB vs FCM                   → AWAY (FCM always wins)
    //  3 Liverpool vs Tottenham      → HOME (Liverpool dominant)
    //  4 Real Sociedad vs Athletic   → DRAW (local Basque derby – careful)
    //  5 Udinese vs Napoli           → AWAY (Napoli class)
    //  6 Leverkusen vs Mainz         → HOME (Leverkusen too good)
    //  7 HSV vs Fortuna Düsseldorf   → HOME (HSV home strength)
    //  8 Fenerbahçe vs Galatasaray   → DRAW (Turkish derby, always unpredictable)
    //  9 Porto vs Sporting CP        → DRAW (O Clássico – tight as always)
    // 10 PSG vs Marseille            → HOME (PSG class, Le Classique)
    // 11 Tottenham vs Man City       → AWAY (Man City quality)
    // 12 Real Betis vs Real Madrid   → AWAY (Real too strong away)
    // 13 Inter Milan vs Roma         → HOME (Inter dominant at San Siro)
    steffenPicks: [
      "HOME","AWAY","HOME","DRAW","AWAY",
      "HOME","HOME","DRAW","DRAW","HOME",
      "AWAY","AWAY","HOME",
    ],
    michaelShifts: [
      { h:  0.04, d: -0.02, a: -0.02 }, //  1 FCN home value
      { h: -0.05, d:  0.01, a:  0.04 }, //  2 FCM value even at 1.78
      { h:  0.03, d: -0.01, a: -0.02 }, //  3 Liverpool
      { h: -0.02, d:  0.03, a: -0.01 }, //  4 Basque derby → draw edge
      { h: -0.03, d: -0.01, a:  0.04 }, //  5 Napoli value
      { h:  0.02, d: -0.01, a: -0.01 }, //  6 Leverkusen obvious
      { h:  0.04, d: -0.02, a: -0.02 }, //  7 HSV home
      { h: -0.03, d:  0.06, a: -0.03 }, //  8 draw in derby
      { h: -0.04, d:  0.05, a: -0.01 }, //  9 draw value in O Clássico
      { h:  0.04, d: -0.02, a: -0.02 }, // 10 PSG
      { h: -0.05, d:  0.02, a:  0.03 }, // 11 Man City
      { h: -0.02, d: -0.01, a:  0.03 }, // 12 Real Madrid
      { h:  0.04, d: -0.02, a: -0.02 }, // 13 Inter home
    ],
    matches: [
      { n:  1, home: "FC Nordsjælland",     away: "Randers FC",          league: "Superligaen",   h: 1.95, d: 3.50, a: 3.80, result: "HOME" },
      { n:  2, home: "OB",                  away: "FC Midtjylland",      league: "Superligaen",   h: 4.50, d: 4.00, a: 1.78, result: "AWAY" },
      { n:  3, home: "Liverpool",           away: "Tottenham",           league: "Premier League",h: 1.62, d: 4.25, a: 5.50, result: "HOME" },
      { n:  4, home: "Real Sociedad",       away: "Athletic Bilbao",     league: "La Liga",       h: 2.50, d: 3.30, a: 2.80, result: "HOME" },
      { n:  5, home: "Udinese",             away: "Napoli",              league: "Serie A",       h: 5.50, d: 4.25, a: 1.60, result: "AWAY" },
      { n:  6, home: "Bayer Leverkusen",    away: "Mainz",               league: "Bundesliga",    h: 1.44, d: 4.75, a: 6.50, result: "HOME" },
      { n:  7, home: "Hamburger SV",        away: "Fortuna Düsseldorf",  league: "2. Bundesliga", h: 1.98, d: 3.40, a: 3.60, result: "HOME" },
      { n:  8, home: "Fenerbahçe",          away: "Galatasaray",         league: "Süper Lig",     h: 2.60, d: 3.20, a: 2.70, result: "DRAW" },
      { n:  9, home: "Porto",               away: "Sporting CP",         league: "Primeira Liga", h: 2.45, d: 3.30, a: 2.90, result: "AWAY" },
      { n: 10, home: "PSG",                 away: "Marseille",           league: "Ligue 1",       h: 1.68, d: 4.00, a: 5.25, result: "HOME" },
      { n: 11, home: "Tottenham",           away: "Manchester City",     league: "Premier League",h: 4.75, d: 4.25, a: 1.69, result: "AWAY" },
      { n: 12, home: "Real Betis",          away: "Real Madrid",         league: "La Liga",       h: 5.25, d: 4.50, a: 1.55, result: "AWAY" },
      { n: 13, home: "Inter Milan",         away: "Roma",                league: "Serie A",       h: 1.62, d: 3.80, a: 5.50, result: "HOME" },
    ],
  },

  // ─── Round 4 – Lørdagstips, 26 Apr 2026 (current round, open) ───────────────
  {
    roundNumber: 4,
    deadlineUTC: "2026-04-26T10:00:00Z",
    status: "open",
    madsDeviateAt: new Set([1, 5, 9]),
    bjarkeRngSeed: 168,
    //  1 FCK vs Brøndby            → DRAW (revenge derby)
    //  2 FCM vs AGF                → HOME (FCM at home)
    //  3 Man United vs Aston Villa → DRAW (Man Utd inconsistent this season)
    //  4 Real Madrid vs Villarreal → HOME (Real at Bernabéu)
    //  5 Juventus vs Lazio         → HOME (Juve home form)
    //  6 Bayern vs Bayer Leverkusen→ AWAY (Leverkusen in scintillating form)
    //  7 Hannover vs Hamburger SV  → AWAY (HSV better side)
    //  8 Beşiktaş vs Trabzonspor   → HOME (Beşiktaş home noise)
    //  9 Feyenoord vs Ajax         → HOME (Feyenoord home crowd edge)
    // 10 Marseille vs PSG          → AWAY (PSG class even away)
    // 11 Chelsea vs Arsenal        → AWAY (Arsenal top 4 form)
    // 12 Atlético Madrid vs Barca  → DRAW (tactical slog)
    // 13 AC Milan vs Inter Milan   → DRAW (Derby della Madonnina)
    steffenPicks: [
      "DRAW","HOME","DRAW","HOME","HOME",
      "AWAY","AWAY","HOME","HOME","AWAY",
      "AWAY","DRAW","DRAW",
    ],
    michaelShifts: [
      { h:  0.03, d:  0.04, a: -0.07 }, //  1 derby → draw value
      { h:  0.04, d: -0.02, a: -0.02 }, //  2 FCM home
      { h: -0.04, d:  0.06, a: -0.02 }, //  3 draw value, Man Utd erratic
      { h:  0.03, d: -0.01, a: -0.02 }, //  4 Real Madrid home
      { h:  0.03, d: -0.01, a: -0.02 }, //  5 Juventus home
      { h: -0.06, d:  0.02, a:  0.04 }, //  6 Leverkusen high press hurts Bayern
      { h: -0.04, d:  0.01, a:  0.03 }, //  7 HSV value
      { h:  0.04, d: -0.02, a: -0.02 }, //  8 Beşiktaş home
      { h:  0.04, d: -0.02, a: -0.02 }, //  9 Feyenoord home
      { h: -0.04, d:  0.01, a:  0.03 }, // 10 PSG value away
      { h: -0.03, d:  0.01, a:  0.02 }, // 11 Arsenal form
      { h:  0.02, d:  0.03, a: -0.05 }, // 12 Atletico home draw value
      { h:  0.01, d:  0.04, a: -0.05 }, // 13 derby → draw value
    ],
    matches: [
      { n:  1, home: "FC Copenhagen",       away: "Brøndby",             league: "Superligaen",   h: 2.40, d: 3.40, a: 2.85 },
      { n:  2, home: "FC Midtjylland",      away: "AGF",                 league: "Superligaen",   h: 1.72, d: 3.80, a: 4.75 },
      { n:  3, home: "Manchester United",   away: "Aston Villa",         league: "Premier League",h: 2.10, d: 3.40, a: 3.40 },
      { n:  4, home: "Real Madrid",         away: "Villarreal",          league: "La Liga",       h: 1.45, d: 4.75, a: 7.00 },
      { n:  5, home: "Juventus",            away: "Lazio",               league: "Serie A",       h: 1.95, d: 3.40, a: 4.00 },
      { n:  6, home: "Bayern München",      away: "Bayer Leverkusen",    league: "Bundesliga",    h: 1.78, d: 4.00, a: 4.25 },
      { n:  7, home: "Hannover 96",         away: "Hamburger SV",        league: "2. Bundesliga", h: 3.20, d: 3.40, a: 2.25 },
      { n:  8, home: "Beşiktaş",            away: "Trabzonspor",         league: "Süper Lig",     h: 2.45, d: 3.20, a: 2.85 },
      { n:  9, home: "Feyenoord",           away: "Ajax",                league: "Eredivisie",    h: 2.75, d: 3.40, a: 2.55 },
      { n: 10, home: "Marseille",           away: "PSG",                 league: "Ligue 1",       h: 4.50, d: 4.00, a: 1.72 },
      { n: 11, home: "Chelsea",             away: "Arsenal",             league: "Premier League",h: 3.10, d: 3.40, a: 2.30 },
      { n: 12, home: "Atlético Madrid",     away: "Barcelona",           league: "La Liga",       h: 3.20, d: 3.40, a: 2.35 },
      { n: 13, home: "AC Milan",            away: "Inter Milan",         league: "Serie A",       h: 2.95, d: 3.30, a: 2.40 },
    ],
  },
];

// ── Test users ────────────────────────────────────────────────────────────────

// Fake authIds so they won't collide with real Supabase users
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

  // Create all rounds and their matches
  for (const rd of roundDefs) {
    const deadline = new Date(rd.deadlineUTC);
    const round = await prisma.round.upsert({
      where: { seasonId_roundNumber: { seasonId: season.id, roundNumber: rd.roundNumber } },
      update: { deadline, status: rd.status },
      create: { seasonId: season.id, roundNumber: rd.roundNumber, deadline, status: rd.status },
    });
    console.log(`\nRound #${round.roundNumber} [${rd.status}]`);

    for (const m of rd.matches) {
      await prisma.match.upsert({
        where: { roundId_matchNumber: { roundId: round.id, matchNumber: m.n } },
        update: {
          homeTeam: m.home, awayTeam: m.away, league: m.league,
          kickoff: deadline, oddsHome: m.h, oddsDraw: m.d, oddsAway: m.a,
          result: m.result ?? null,
        },
        create: {
          roundId: round.id, matchNumber: m.n,
          homeTeam: m.home, awayTeam: m.away, league: m.league,
          kickoff: deadline, oddsHome: m.h, oddsDraw: m.d, oddsAway: m.a,
          result: m.result ?? null,
        },
      });
      const res = m.result ? ` → ${m.result === "HOME" ? "1" : m.result === "DRAW" ? "X" : "2"}` : "";
      console.log(`  ${m.n}. ${m.home} vs ${m.away}${res}`);
    }
  }

  // Clean up old test users (cascades to predictions)
  await prisma.user.deleteMany({
    where: { authId: { startsWith: "test-auth-" } },
  });

  // Create test users
  console.log("\nCreating test users...");
  const createdUsers = [];
  for (const u of testUsers) {
    const user = await prisma.user.upsert({
      where: { authId: u.authId },
      update: { email: u.email, displayName: u.displayName },
      create: u,
    });
    createdUsers.push(user);
    console.log(`  ${user.displayName} (${user.id})`);
  }

  // Generate personality-driven predictions for every round
  console.log("\nCreating predictions...");
  for (const rd of roundDefs) {
    const round = await prisma.round.findFirstOrThrow({
      where: { seasonId: season.id, roundNumber: rd.roundNumber },
    });
    const roundMatches = await prisma.match.findMany({
      where: { roundId: round.id },
      orderBy: { matchNumber: "asc" },
    });
    const rng = mulberry32(rd.bjarkeRngSeed);

    console.log(`\n  Round #${rd.roundNumber}:`);
    for (const user of createdUsers) {
      let picks: Pick[];
      switch (user.displayName) {
        case "Mads":    picks = madsPicks(roundMatches, rd.madsDeviateAt); break;
        case "Søren":   picks = sørenPicks(roundMatches); break;
        case "Steffen": picks = rd.steffenPicks; break;
        case "Michael": picks = michaelPicks(roundMatches, rd.michaelShifts); break;
        case "Bjarke":  picks = bjarkePicks(roundMatches, rng); break;
        default: throw new Error(`Unknown user: ${user.displayName}`);
      }
      for (let i = 0; i < roundMatches.length; i++) {
        await prisma.prediction.upsert({
          where: { userId_matchId: { userId: user.id, matchId: roundMatches[i].id } },
          update: { pick: picks[i] },
          create: { roundId: round.id, userId: user.id, matchId: roundMatches[i].id, pick: picks[i] },
        });
      }
      console.log(`    ${user.displayName}: ${picks.map(p => p === "HOME" ? "1" : p === "DRAW" ? "X" : "2").join(",")}`);
    }
  }

  console.log("\nDone! Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
