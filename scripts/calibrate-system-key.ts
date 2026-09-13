/**
 * System-key convention calibration script.
 *
 * System keys were copied from Danske Spil's site as bare rows, with no legend.
 * Four reading rules were recovered, three confirmed:
 *
 * Rule 1 (CONFIRMED): Matches with a single outcome never appear in the key.
 * Rule 2 (CONFIRMED): Each row lists the fully covered matches first, then the half covered ones.
 * Rule 3 (CONFIRMED): A half covered match is always written with glyphs 1 and X, regardless
 *                      of its two covered outcomes. The glyph-to-outcome mapping depends on
 *                      which outcomes are covered.
 * Rule 4 (ASSUMED):    In a U-system, glyph 1 is the udgangsrække (base outcome), transposed
 *                      with whichever glyph would otherwise hold it.
 *
 * THE UNKNOWN: the order of matches within each block (full-covered and half-covered).
 * Rule 2 pins full-before-half but not which fully covered match takes the first full column.
 *
 * DEFAULT_CONVENTION assumes ascending match number. Getting this wrong changes the best-row
 * score on U7-4-133 for 51% of outcomes, with a maximum gap of 3 correct — so it matters,
 * and it must be settled empirically rather than guessed.
 *
 * This script settles it from a single real sample: the user builds a system coupon on
 * danskespil.dk, copies the rows the site generates, and the script reports which candidate
 * convention reproduces that row set exactly.
 *
 * Usage: npm run keys:calibrate -- <coupon.json> <official-rows.txt>
 */

import * as fs from "fs";
import * as path from "path";
import { CouponSlot, CANDIDATE_CONVENTIONS } from "../src/lib/system-keys/conventions";
import { getSystem } from "../src/lib/coupon-systems";
import { getSystemKey } from "../src/lib/system-keys/index";
import { expandCoupon } from "../src/lib/group-coupon-settlement";
import { PICK_LABEL, PickValue } from "../src/lib/picks";

interface CouponInput {
  systemCode: string;
  slots: CouponSlot[];
}

/**
 * Parse and validate the coupon.json input.
 *
 * Returns the parsed coupon, or exits with error message on validation failure.
 */
function loadAndValidateCoupon(filePath: string): CouponInput {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const coupon = JSON.parse(content) as CouponInput;

    // Validate required fields
    if (!coupon.systemCode || typeof coupon.systemCode !== "string") {
      console.error("Error: coupon.json missing or invalid 'systemCode' field");
      process.exit(1);
    }

    if (!Array.isArray(coupon.slots) || coupon.slots.length === 0) {
      console.error("Error: coupon.json missing or invalid 'slots' field (must be non-empty array)");
      process.exit(1);
    }

    // Validate system exists first (needed for coverage validation)
    const system = getSystem(coupon.systemCode);
    if (!system) {
      console.error(`Error: unknown system code '${coupon.systemCode}'`);
      process.exit(1);
    }

    // Validate slot count
    if (coupon.slots.length !== 13) {
      console.error(`Error: expected 13 slots, got ${coupon.slots.length}`);
      process.exit(1);
    }

    // Validate match numbers 1..13 present exactly once
    const matchNumbers = new Set<number>();
    for (const slot of coupon.slots) {
      if (typeof slot.matchNumber !== "number" || slot.matchNumber < 1 || slot.matchNumber > 13) {
        console.error(`Error: invalid matchNumber ${slot.matchNumber} (must be 1..13)`);
        process.exit(1);
      }
      if (matchNumbers.has(slot.matchNumber)) {
        console.error(`Error: duplicate matchNumber ${slot.matchNumber}`);
        process.exit(1);
      }
      matchNumbers.add(slot.matchNumber);
    }

    for (let i = 1; i <= 13; i++) {
      if (!matchNumbers.has(i)) {
        console.error(`Error: missing matchNumber ${i}`);
        process.exit(1);
      }
    }

    // Validate coverage and outcomes
    const validCoverages = new Set(["single", "half", "full"]);
    const validOutcomes = new Set<PickValue>(["HOME", "DRAW", "AWAY"]);

    for (const slot of coupon.slots) {
      if (!validCoverages.has(slot.coverage)) {
        console.error(
          `Error: match ${slot.matchNumber}: invalid coverage '${slot.coverage}' (must be single/half/full)`
        );
        process.exit(1);
      }

      if (!Array.isArray(slot.outcomes) || slot.outcomes.length === 0) {
        console.error(
          `Error: match ${slot.matchNumber}: outcomes must be non-empty array`
        );
        process.exit(1);
      }

      for (const outcome of slot.outcomes) {
        if (!validOutcomes.has(outcome)) {
          console.error(
            `Error: match ${slot.matchNumber}: invalid outcome '${outcome}' (must be HOME/DRAW/AWAY)`
          );
          process.exit(1);
        }
      }

      // Validate outcomes.length matches coverage
      const expectedLen = slot.coverage === "single" ? 1 : slot.coverage === "half" ? 2 : 3;
      if (slot.outcomes.length !== expectedLen) {
        console.error(
          `Error: match ${slot.matchNumber}: coverage '${slot.coverage}' expects ${expectedLen} outcomes, got ${slot.outcomes.length}`
        );
        process.exit(1);
      }

      // Validate baseOutcome for covered slots in U-systems
      if (system.type === "U" && (slot.coverage === "full" || slot.coverage === "half")) {
        if (slot.baseOutcome === null || slot.baseOutcome === undefined) {
          console.error(
            `Error: match ${slot.matchNumber}: U-system covered slot requires baseOutcome`
          );
          process.exit(1);
        }
        if (!validOutcomes.has(slot.baseOutcome)) {
          console.error(
            `Error: match ${slot.matchNumber}: invalid baseOutcome '${slot.baseOutcome}'`
          );
          process.exit(1);
        }
        if (!slot.outcomes.includes(slot.baseOutcome)) {
          console.error(
            `Error: match ${slot.matchNumber}: baseOutcome '${slot.baseOutcome}' not in outcomes`
          );
          process.exit(1);
        }
      }
    }

    const fullCount = coupon.slots.filter((s) => s.coverage === "full").length;
    const halfCount = coupon.slots.filter((s) => s.coverage === "half").length;
    const singleCount = coupon.slots.filter((s) => s.coverage === "single").length;

    if (fullCount !== system.full) {
      console.error(
        `Error: system '${coupon.systemCode}' expects ${system.full} full slots, got ${fullCount}`
      );
      process.exit(1);
    }

    if (halfCount !== system.half) {
      console.error(
        `Error: system '${coupon.systemCode}' expects ${system.half} half slots, got ${halfCount}`
      );
      process.exit(1);
    }

    if (singleCount !== system.single) {
      console.error(
        `Error: system '${coupon.systemCode}' expects ${system.single} single slots, got ${singleCount}`
      );
      process.exit(1);
    }

    return coupon;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`Error parsing coupon.json: ${error.message}`);
    } else if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        console.error(`Error: coupon.json file not found: ${filePath}`);
      } else {
        console.error(`Error loading coupon.json: ${error.message}`);
      }
    } else {
      console.error(`Error loading coupon.json: ${String(error)}`);
    }
    process.exit(1);
  }
}

/**
 * Parse official rows from a file.
 *
 * Tolerates:
 * - Optional whitespace/tab separators between glyphs
 * - Blank lines
 * - Optional <index>: prefix on each line
 *
 * Returns an array of 13-glyph strings.
 */
function loadOfficialRows(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    const rows: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // Skip blank lines
      if (!line) continue;

      // Remove optional <index>: prefix
      line = line.replace(/^\d+:\s*/, "");

      // Remove whitespace and tab separators
      const glyphs = line.split(/[\s\t]+/).filter((g) => g.length > 0);

      // Validate: each element should be a single glyph (1, X, or 2)
      const rowStr = glyphs.join("");

      for (const glyph of rowStr) {
        if (!["1", "X", "2"].includes(glyph)) {
          console.error(
            `Error parsing official-rows.txt line ${i + 1}: invalid glyph '${glyph}'`
          );
          process.exit(1);
        }
      }

      if (rowStr.length !== 13) {
        console.error(
          `Error parsing official-rows.txt line ${i + 1}: expected 13 glyphs, got ${rowStr.length}`
        );
        process.exit(1);
      }

      rows.push(rowStr);
    }

    return rows;
  } catch (error) {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        console.error(`Error: official-rows.txt file not found: ${filePath}`);
      } else {
        console.error(`Error loading official-rows.txt: ${error.message}`);
      }
    } else {
      console.error(`Error loading official-rows.txt: ${String(error)}`);
    }
    process.exit(1);
  }
}

/**
 * Render an ExpandedRow to a 13-glyph string using PICK_LABEL.
 */
function rowToGlyphString(signs: PickValue[]): string {
  return signs.map((s) => PICK_LABEL[s]).join("");
}

/**
 * Compare two row sets as multisets and return match statistics.
 */
function compareAsMultisets(
  generated: string[],
  official: string[]
): { matched: number; total: number; exactMatch: boolean } {
  const officialSet = new Map<string, number>();
  for (const row of official) {
    officialSet.set(row, (officialSet.get(row) || 0) + 1);
  }

  let matched = 0;
  const generatedCopy = new Map(officialSet);

  for (const row of generated) {
    if (generatedCopy.has(row) && (generatedCopy.get(row) ?? 0) > 0) {
      matched++;
      generatedCopy.set(row, (generatedCopy.get(row) ?? 0) - 1);
    }
  }

  const exactMatch = matched === official.length && generated.length === official.length;

  return {
    matched,
    total: official.length,
    exactMatch,
  };
}

/**
 * Main function.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error("Usage: npm run keys:calibrate -- <coupon.json> <official-rows.txt>");
    process.exit(1);
  }

  const [couponPath, officialRowsPath] = args;

  // Load and validate inputs
  const coupon = loadAndValidateCoupon(couponPath);
  const officialRows = loadOfficialRows(officialRowsPath);

  const system = getSystem(coupon.systemCode);
  if (!system) {
    console.error(`Error: system code '${coupon.systemCode}' not found`);
    process.exit(1);
  }

  const key = getSystemKey(coupon.systemCode);
  if (!key) {
    console.error(`Error: system key for '${coupon.systemCode}' not found`);
    process.exit(1);
  }

  // Warn if row count differs from expected
  if (officialRows.length !== system.rows) {
    console.warn(
      `Warning: expected ${system.rows} rows but got ${officialRows.length} official rows`
    );
  }

  // Test each convention
  const results: Array<{
    id: string;
    label: string;
    matched: number;
    total: number;
    exactMatch: boolean;
  }> = [];

  for (const convention of CANDIDATE_CONVENTIONS) {
    try {
      const expandedRows = expandCoupon({ system, slots: coupon.slots, key, convention });
      const generatedRows = expandedRows.map((r) => rowToGlyphString(r.signs));
      const stats = compareAsMultisets(generatedRows, officialRows);

      results.push({
        id: convention.id,
        label: convention.label,
        matched: stats.matched,
        total: stats.total,
        exactMatch: stats.exactMatch,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error testing convention ${convention.id}: ${message}`);
      process.exit(1);
    }
  }

  // Sort by exactMatch first, then by matched count descending
  results.sort((a, b) => {
    if (a.exactMatch !== b.exactMatch) {
      return b.exactMatch ? 1 : -1;
    }
    return b.matched - a.matched;
  });

  // Print ranked table
  // Define fixed column widths to ensure alignment
  const colWidths = {
    id: 30,
    label: 38,
    match: 8,
    exact: 5,
  };

  // Build separator from column widths
  const separator =
    "-".repeat(colWidths.id) +
    "-+-" +
    "-".repeat(colWidths.label) +
    "-+-" +
    "-".repeat(colWidths.match) +
    "-+-" +
    "-".repeat(colWidths.exact);

  console.log("=== Convention Calibration Results ===\n");
  console.log(
    "Convention ID" +
      " ".repeat(colWidths.id - "Convention ID".length) +
      " | Label" +
      " ".repeat(colWidths.label - "Label".length) +
      " | Match" +
      " ".repeat(colWidths.match - "Match".length) +
      " | Exact"
  );
  console.log(separator);

  for (const result of results) {
    const idCol = result.id.padEnd(colWidths.id);
    const labelCol = result.label.padEnd(colWidths.label);
    const matchCol = `${result.matched}/${result.total}`.padStart(colWidths.match);
    const exactCol = (result.exactMatch ? "YES" : "no").padEnd(colWidths.exact);
    console.log(`${idCol} | ${labelCol} | ${matchCol} | ${exactCol}`);
  }

  console.log("");

  // Analyze results
  const exactMatches = results.filter((r) => r.exactMatch);

  if (exactMatches.length === 1) {
    const winner = exactMatches[0];
    console.log(`✓ Single exact match found: ${winner.id}`);
    console.log(`  Label: ${winner.label}`);

    // Check if it's already the default
    if (winner.id === "ascending-match-number") {
      console.log("  DEFAULT_CONVENTION is already set to this convention.");
    } else {
      console.log(
        `  Note: DEFAULT_CONVENTION should be updated to '${winner.id}' in conventions.ts`
      );
    }

    process.exit(0);
  } else if (exactMatches.length > 1) {
    console.log(
      `⚠ Multiple exact matches found (${exactMatches.length}). The sample cannot discriminate.`
    );
    console.log("  Matching conventions:");
    for (const match of exactMatches) {
      console.log(`    - ${match.id}: ${match.label}`);
    }
    console.log(
      "\n  Explanation: Two hedged slots with identical outcome sets (and identical base\n" +
        "  outcomes, for U-systems) are interchangeable. The sample needs every covered\n" +
        "  match to have a distinct outcome set and base outcome to discriminate."
    );

    process.exit(0);
  } else {
    // No exact match
    const best = results[0];
    console.log(`✗ No exact match found.`);
    console.log(`  Best overlap: ${best.id} with ${best.matched}/${best.total} rows matched`);
    console.log(
      "\n  This indicates a violation of one of the core assumptions:\n" +
        "  - Rule 1: Matches with a single outcome never appear in the key.\n" +
        "  - Rule 2: Each row lists fully covered matches first, then half covered.\n" +
        "  - Rule 3: Half covered matches are always written with glyphs 1 and X.\n" +
        "  - Rule 4: In U-systems, glyph 1 denotes the base outcome (transposition, not rotation).\n" +
        "\n  Or the input file format is incorrect."
    );

    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
