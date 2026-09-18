import * as fs from "fs";
import * as path from "path";
import { prisma } from "../src/lib/prisma";
import { isoWeekSaturday } from "../src/lib/iso-week";
import { computeLeaderboard } from "../src/lib/leaderboard";
import { HISTORIC_AUTH_PREFIX } from "../src/lib/historic-users";
import type { User, Pick as PickType } from "@prisma/client";

// Type definitions for the historic data JSON
interface FedtPct {
  home: number;
  draw: number;
  away: number;
}

interface MatchData {
  matchNumber: number;
  result: "1" | "X" | "2" | null;
  fedtPct: FedtPct;
  picks: Record<string, "1" | "X" | "2" | null>;
}

interface RoundExpected {
  points: number;
  fedt: number;
}

interface RoundData {
  weekNumber: number;
  matches: MatchData[];
  expected: Record<string, RoundExpected>;
  fedtDivergences?: string[];
}

interface SeasonJSON {
  year: number;
  players: string[];
  rounds: RoundData[];
  expectedSeason: Record<string, RoundExpected>;
}

const isDryRun = process.argv.includes("--dry-run");

/**
 * Load all season JSON files
 */
async function loadSeasons(): Promise<SeasonJSON[]> {
  const jsonDir = path.join(process.cwd(), "historic-data", "json");

  if (!fs.existsSync(jsonDir)) {
    console.error(`Error: historic-data/json directory not found at ${jsonDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(jsonDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.error("Error: No JSON files found in historic-data/json/");
    process.exit(1);
  }

  const seasons: SeasonJSON[] = [];
  for (const file of files) {
    const filePath = path.join(jsonDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const season: SeasonJSON = JSON.parse(content);
    seasons.push(season);
  }

  return seasons;
}

/**
 * Upsert placeholder users for all seasons
 */
async function upsertPlaceholderUsers(seasons: SeasonJSON[]): Promise<Map<string, User>> {
  const allInitials = new Set<string>();
  seasons.forEach((s) => s.players.forEach((p) => allInitials.add(p)));

  const users = new Map<string, User>();

  for (const initials of Array.from(allInitials)) {
    const authId = `${HISTORIC_AUTH_PREFIX}${initials}`;
    const email = `${HISTORIC_AUTH_PREFIX}${initials.toLowerCase()}@miniputterne.invalid`;

    const user = await prisma.user.upsert({
      where: { authId },
      update: {}, // No updates on existing users
      create: {
        authId,
        displayName: initials,
        email,
        role: "member",
      },
    });

    users.set(initials, user);
  }

  return users;
}

/**
 * Map a string pick to a Prisma Pick enum value
 */
function mapPick(pick: "1" | "X" | "2" | null): PickType | null {
  if (pick === null) return null;
  if (pick === "1") return "HOME";
  if (pick === "X") return "DRAW";
  if (pick === "2") return "AWAY";
  return null;
}


/**
 * Calculate synthesized odds from fedt percentage
 */
function calculateOdds(pct: number): string {
  return (100 / pct).toFixed(2);
}

/**
 * Import a single season
 */
async function importSeason(
  season: SeasonJSON,
  users: Map<string, User>,
  dryRun: boolean
): Promise<{ success: boolean; message: string }> {
  const seasonName = String(season.year);

  if (dryRun) {
    console.log(`\n[DRY RUN] Would import season ${seasonName} with ${season.rounds.length} rounds`);
    return { success: true, message: `Would import season ${seasonName}` };
  }

  try {
    // Delete existing season (cascade removes rounds/matches/predictions)
    await prisma.season.deleteMany({
      where: { name: seasonName },
    });

    // Use a transaction with extended timeout to ensure atomicity for creation
    const result = await prisma.$transaction(
      async (tx) => {
        // Calculate start date from first round's Saturday
        const startDate = isoWeekSaturday(season.year, season.rounds[0].weekNumber);

        // Build all rounds data for nested creation
        const roundsData = season.rounds.map((roundData, i) => {
          const roundNumber = i + 1;
          const deadline = isoWeekSaturday(season.year, roundData.weekNumber);
          return {
            roundNumber,
            deadline,
            status: "completed" as const,
          };
        });

        // Create season with nested rounds in a single query
        const createdSeason = await tx.season.create({
          data: {
            name: seasonName,
            startDate,
            numRounds: season.rounds.length,
            isActive: false,
            rounds: {
              create: roundsData,
            },
          },
          include: {
            rounds: {
              select: { id: true, roundNumber: true },
            },
          },
        });

        // Build a map of roundNumber -> roundId for quick lookup
        const roundMap = new Map(createdSeason.rounds.map((r) => [r.roundNumber, r.id]));

        // Prepare all matches for createMany
        const allMatches = [];
        const matchMetadata: Array<{ roundNumber: number; matchNumber: number }> = [];

        for (let i = 0; i < season.rounds.length; i++) {
          const roundData = season.rounds[i];
          const roundNumber = i + 1;
          const roundId = roundMap.get(roundNumber)!;
          const deadline = isoWeekSaturday(season.year, roundData.weekNumber);

          for (const matchData of roundData.matches) {
            const matchNumber = matchData.matchNumber;
            const oddsHome = Number(calculateOdds(matchData.fedtPct.home));
            const oddsDraw = Number(calculateOdds(matchData.fedtPct.draw));
            const oddsAway = Number(calculateOdds(matchData.fedtPct.away));

            allMatches.push({
              roundId,
              matchNumber,
              homeTeam: `Kamp ${matchNumber}`,
              awayTeam: "–",
              league: "Tips 13",
              kickoff: deadline,
              oddsHome,
              oddsDraw,
              oddsAway,
              fedtHome: matchData.fedtPct.home,
              fedtDraw: matchData.fedtPct.draw,
              fedtAway: matchData.fedtPct.away,
              result: mapPick(matchData.result),
            });

            matchMetadata.push({ roundNumber, matchNumber });
          }
        }

        // Create all matches in one batch
        if (allMatches.length > 0) {
          await tx.match.createMany({
            data: allMatches,
          });
        }

        // Fetch created matches to get their IDs
        const roundIds = Array.from(roundMap.values());
        const createdMatches = await tx.match.findMany({
          where: {
            roundId: { in: roundIds },
          },
          select: { id: true, roundId: true, matchNumber: true },
        });

        // Build a map of roundId+matchNumber -> matchId
        const matchMap = new Map<string, string>();
        for (const match of createdMatches) {
          const key = `${match.roundId}#${match.matchNumber}`;
          matchMap.set(key, match.id);
        }

        // Prepare all predictions in memory
        const allPredictions = [];

        for (let i = 0; i < season.rounds.length; i++) {
          const roundData = season.rounds[i];
          const roundNumber = i + 1;
          const roundId = roundMap.get(roundNumber)!;

          for (const matchData of roundData.matches) {
            const matchNumber = matchData.matchNumber;
            const matchKey = `${roundId}#${matchNumber}`;
            const matchId = matchMap.get(matchKey);

            if (!matchId) continue;

            for (const [initials, pick] of Object.entries(matchData.picks)) {
              if (pick !== null && users.has(initials)) {
                const user = users.get(initials)!;
                const mappedPick = mapPick(pick as "1" | "X" | "2" | null);
                if (mappedPick !== null) {
                  allPredictions.push({
                    roundId,
                    userId: user.id,
                    matchId,
                    pick: mappedPick,
                  });
                }
              }
            }
          }
        }

        // Create all predictions in one batch
        if (allPredictions.length > 0) {
          await tx.prediction.createMany({
            data: allPredictions,
          });
        }

        return { id: createdSeason.id };
      },
      { timeout: 60000, maxWait: 10000 }
    );

    return { success: true, message: `Imported season ${seasonName}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to import season ${seasonName}: ${message}` };
  }
}

/**
 * Validate imported season data against expected values
 */
async function validateSeason(
  season: SeasonJSON,
  users: Map<string, User>,
  dryRun: boolean
): Promise<{ passed: boolean; warnings: string[] }> {
  if (dryRun) {
    return { passed: true, warnings: [] };
  }

  const seasonName = String(season.year);
  const warnings: string[] = [];

  try {
    // Fetch the imported season with all related data
    // Note: Using findFirst because name is not a unique field
    const seasonRecord = await prisma.season.findFirst({
      where: { name: seasonName },
    });

    if (!seasonRecord) {
      return { passed: false, warnings: [`Season ${seasonName} not found after import`] };
    }

    const importedSeason = await prisma.season.findUnique({
      where: { id: seasonRecord.id },
      include: {
        rounds: {
          include: {
            matches: true,
            predictions: {
              include: {
                match: true,
              },
            },
          },
          orderBy: { roundNumber: "asc" },
        },
      },
    });

    if (!importedSeason) {
      return { passed: false, warnings: [`Season ${seasonName} not found after import`] };
    }

    // Prepare users array for leaderboard computation
    const allUsers = Array.from(users.values());

    // Validate each round
    for (let i = 0; i < importedSeason.rounds.length; i++) {
      const round = importedSeason.rounds[i];
      const roundData = season.rounds[i];
      const fedtDivergences = roundData.fedtDivergences || [];

      // Compute leaderboard for this round only
      const leaderboard = computeLeaderboard([round], allUsers);

      // Validate points and fedt for each player
      for (const entry of leaderboard) {
        const initials = entry.user.displayName;
        const expected = roundData.expected[initials];

        if (!expected) continue;

        // Check total points
        if (entry.totalPoints !== expected.points) {
          return {
            passed: false,
            warnings: [
              `Round ${round.roundNumber} ${seasonName}: ${initials} points mismatch. ` +
                `Expected ${expected.points}, got ${entry.totalPoints}`,
            ],
          };
        }

        // Check fedt (within 0.01 tolerance)
        const fedtDiff = Math.abs(entry.seasonFedt - expected.fedt);
        if (fedtDiff > 0.01) {
          if (fedtDivergences.includes(initials)) {
            warnings.push(
              `Round ${round.roundNumber} ${seasonName} ${initials}: fedt divergence. ` +
                `Expected ${expected.fedt.toFixed(2)}, got ${entry.seasonFedt.toFixed(2)}`
            );
          } else {
            return {
              passed: false,
              warnings: [
                `Round ${round.roundNumber} ${seasonName}: ${initials} fedt mismatch. ` +
                  `Expected ${expected.fedt}, got ${entry.seasonFedt}`,
              ],
            };
          }
        }
      }
    }

    // Validate season totals
    const leaderboard = computeLeaderboard(importedSeason.rounds, allUsers);
    for (const entry of leaderboard) {
      const initials = entry.user.displayName;
      const expected = season.expectedSeason[initials];

      if (!expected) continue;

      // Check total points
      if (entry.totalPoints !== expected.points) {
        return {
          passed: false,
          warnings: [
            `Season ${seasonName}: ${initials} total points mismatch. ` +
              `Expected ${expected.points}, got ${entry.totalPoints}`,
          ],
        };
      }

      // Check fedt (within 0.01 tolerance)
      const fedtDiff = Math.abs(entry.seasonFedt - expected.fedt);

      // Check if this player has any divergent rounds
      const hasDivergentRounds = season.rounds.some(
        (r) => r.fedtDivergences && r.fedtDivergences.includes(initials)
      );

      if (fedtDiff > 0.01) {
        if (hasDivergentRounds) {
          warnings.push(
            `Season ${seasonName} ${initials}: season fedt divergence (player has divergent rounds). ` +
              `Expected ${expected.fedt.toFixed(2)}, got ${entry.seasonFedt.toFixed(2)}`
          );
        } else {
          return {
            passed: false,
            warnings: [
              `Season ${seasonName}: ${initials} season fedt mismatch. ` +
                `Expected ${expected.fedt}, got ${entry.seasonFedt}`,
            ],
          };
        }
      }
    }

    return { passed: true, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { passed: false, warnings: [`Validation error for season ${seasonName}: ${message}`] };
  }
}

/**
 * Main import function
 */
async function main() {
  console.log("Loading historic seasons...");

  const seasons = await loadSeasons();
  console.log(`Found ${seasons.length} seasons (${seasons.map((s) => s.year).join(", ")})\n`);

  if (isDryRun) {
    console.log("[DRY RUN MODE] - No changes will be written to the database\n");
  }

  // Upsert placeholder users
  console.log("Upserting placeholder users...");
  const users = await upsertPlaceholderUsers(seasons);
  console.log(`Created/verified ${users.size} placeholder users\n`);

  if (isDryRun) {
    console.log("[DRY RUN] Would have upserted the following users:");
    for (const [initials, user] of Array.from(users)) {
      console.log(`  - ${initials} (${user.email})`);
    }
  }

  // Import each season
  const summaryTable: Array<{
    season: string;
    status: string;
    playersValidated?: number;
    warnings?: number;
  }> = [];

  for (const season of seasons) {
    const result = await importSeason(season, users, isDryRun);

    if (!result.success) {
      console.error(`\n✗ ${result.message}`);
      summaryTable.push({
        season: String(season.year),
        status: "FAILED",
      });
      continue;
    }

    console.log(`✓ ${result.message}`);

    // Validate if not dry run
    if (!isDryRun) {
      const validation = await validateSeason(season, users, false);

      if (!validation.passed) {
        console.error(`  ✗ Validation failed:`);
        validation.warnings.forEach((w) => console.error(`    - ${w}`));
        summaryTable.push({
          season: String(season.year),
          status: "VALIDATION_FAILED",
          warnings: validation.warnings.length,
        });
        continue;
      }

      if (validation.warnings.length > 0) {
        console.log(`  ⚠ ${validation.warnings.length} warning(s):`);
        validation.warnings.forEach((w) => console.log(`    - ${w}`));
        summaryTable.push({
          season: String(season.year),
          status: "VALIDATED_WITH_WARNINGS",
          playersValidated: season.players.length,
          warnings: validation.warnings.length,
        });
      } else {
        console.log(`  ✓ All players validated`);
        summaryTable.push({
          season: String(season.year),
          status: "OK",
          playersValidated: season.players.length,
        });
      }
    }
  }

  // Print summary table
  console.log("\n" + "=".repeat(80));
  console.log("IMPORT SUMMARY");
  console.log("=".repeat(80));

  if (isDryRun) {
    console.log("\n[DRY RUN MODE] - No changes were written.\n");
  }

  console.table(summaryTable);

  if (!isDryRun) {
    console.log("\nIDEMPOTENCY NOTE:");
    console.log(
      "Re-running this script will recreate seasons. If placeholder users were " +
        "previously linked to real members via admin linking, a re-run will reattach " +
        "history to fresh placeholder users and links must be redone from the admin panel."
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
