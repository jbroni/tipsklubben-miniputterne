/**
 * System-key loading and validation layer.
 *
 * Provides lookups and validation for both file-backed and generated system keys.
 */

import {
  KeyGlyph,
  SystemKeyParseError,
} from "./format";
import { FILE_SYSTEM_KEYS } from "./generated-keys";
import { getSystem, SystemDefinition } from "../coupon-systems";

// Re-export for convenience
export type { KeyGlyph };
export { SystemKeyParseError };

export interface SystemKey {
  code: string;
  rows: readonly string[];
  columns: number;
  source: "file" | "generated";
}

/**
 * Cache for generated keys, keyed by system code.
 */
const generatedKeyCache = new Map<string, SystemKey>();

/**
 * Look up a system key by code.
 *
 * Returns the key if found (from file or generated for M-systems),
 * or null if the code is unknown or invalid.
 * Never throws on an unknown code.
 */
export function getSystemKey(code: string): SystemKey | null {
  // Check if it's in the generated file keys
  if (Object.hasOwn(FILE_SYSTEM_KEYS, code)) {
    const rows = FILE_SYSTEM_KEYS[code as keyof typeof FILE_SYSTEM_KEYS];
    if (rows.length === 0) return null;
    return {
      code,
      rows,
      columns: rows[0].length,
      source: "file",
    };
  }

  // Try to generate if it's an M-type system
  const system = getSystem(code);
  if (system && system.type === "M") {
    return generateCompleteKey(system);
  }

  return null;
}

/**
 * Generate a complete key for an M-type (mathematical) system.
 *
 * An M-system is complete (full === 0) and always has 2^half rows.
 * Each row is a binary counting sequence (1 = bit 0, X = bit 1) in
 * ascending order across the half columns.
 *
 * Results are memoised per code.
 *
 * @throws Error if the system is not of type "M".
 */
export function generateCompleteKey(system: SystemDefinition): SystemKey {
  if (system.type !== "M") {
    throw new Error(
      `generateCompleteKey only works for M-type systems; got ${system.type}`
    );
  }

  // Return cached result if available
  if (generatedKeyCache.has(system.code)) {
    return generatedKeyCache.get(system.code)!;
  }

  const rows: string[] = [];
  const rowCount = 2 ** system.half;

  // Generate each row as a binary counting sequence
  for (let i = 0; i < rowCount; i++) {
    let row = "";
    for (let bit = 0; bit < system.half; bit++) {
      // Bit 0 = LSB; map 0 -> "1", 1 -> "X"
      row += (i >> bit) & 1 ? "X" : "1";
    }
    rows.push(row);
  }

  const result: SystemKey = {
    code: system.code,
    rows,
    columns: system.full + system.half,
    source: "generated",
  };

  generatedKeyCache.set(system.code, result);
  return result;
}

/**
 * Validate a set of rows against a system definition.
 *
 * Returns an array of human-readable problem strings. Empty array means valid.
 * Never throws; all checks are performed even if earlier ones fail.
 */
export function validateSystemKey(
  system: SystemDefinition,
  rows: readonly string[]
): string[] {
  const problems: string[] = [];

  // 1. Check row count
  if (rows.length !== system.rows) {
    problems.push(
      `Expected ${system.rows} rows but got ${rows.length}`
    );
  }

  // 2. Check row width
  const expectedWidth = system.full + system.half;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== expectedWidth) {
      problems.push(
        `Row ${i + 1}: expected width ${expectedWidth} but got ${rows[i].length}`
      );
    }
  }

  // 3. Check full column alphabets (1, X, 2)
  if (system.full > 0) {
    for (let col = 0; col < system.full; col++) {
      const alphabet = new Set<string>();
      for (let row = 0; row < rows.length; row++) {
        if (col < rows[row].length) {
          alphabet.add(rows[row][col]);
        }
      }
      if (alphabet.size !== 3 || !alphabet.has("1") || !alphabet.has("X") || !alphabet.has("2")) {
        problems.push(
          `Full column ${col + 1}: expected {1, X, 2} but got {${Array.from(alphabet).sort().join(", ")}}`
        );
      }
    }
  }

  // 4. Check half column alphabets (1, X)
  if (system.half > 0) {
    for (let col = system.full; col < system.full + system.half; col++) {
      const alphabet = new Set<string>();
      for (let row = 0; row < rows.length; row++) {
        if (col < rows[row].length) {
          alphabet.add(rows[row][col]);
        }
      }
      if (alphabet.size !== 2 || !alphabet.has("1") || !alphabet.has("X")) {
        problems.push(
          `Half column ${col - system.full + 1}: expected {1, X} but got {${Array.from(alphabet).sort().join(", ")}}`
        );
      }
    }
  }

  // 5. Check for duplicate rows
  const seenRows = new Set<string>();
  let duplicateCount = 0;
  for (const row of rows) {
    if (seenRows.has(row)) {
      duplicateCount++;
    } else {
      seenRows.add(row);
    }
  }
  if (duplicateCount > 0) {
    problems.push(`Found ${duplicateCount} duplicate rows`);
  }

  // Helper to build a glyph histogram for a single column
  function buildGlyphHistogram(col: number): Record<string, number> {
    const glyphCounts: Record<string, number> = { "1": 0, X: 0, "2": 0 };
    for (let row = 0; row < rows.length; row++) {
      if (col < rows[row].length) {
        const glyph = rows[row][col];
        if (glyph in glyphCounts) {
          glyphCounts[glyph]++;
        }
      }
    }
    return glyphCounts;
  }

  // 6. R/U discriminator: uniformity check
  if (system.type === "R" || system.type === "M") {
    // All columns must be exactly uniform
    for (let col = 0; col < system.full + system.half; col++) {
      const glyphCounts = buildGlyphHistogram(col);

      // For full columns, each glyph should occur exactly rows/3 times
      // For half columns, each glyph should occur exactly rows/2 times
      const isFullColumn = col < system.full;
      const expectedFreq = isFullColumn ? rows.length / 3 : rows.length / 2;

      let isUniform = false;
      if (isFullColumn) {
        isUniform =
          glyphCounts["1"] === expectedFreq &&
          glyphCounts["X"] === expectedFreq &&
          glyphCounts["2"] === expectedFreq;
      } else {
        isUniform =
          glyphCounts["1"] === expectedFreq &&
          glyphCounts["X"] === expectedFreq;
      }

      if (!isUniform) {
        const columnType = isFullColumn ? "full" : "half";
        problems.push(
          `${system.type === "R" ? "R" : "M"}-system ${columnType} column ${col + 1}: ` +
          `not uniform. Expected each glyph ${expectedFreq}x but got {1: ${glyphCounts["1"]}, X: ${glyphCounts["X"]}, 2: ${glyphCounts["2"]}}`
        );
      }
    }
  } else if (system.type === "U") {
    // No column may be uniform; 1 must be most frequent overall
    for (let col = 0; col < system.full + system.half; col++) {
      const glyphCounts = buildGlyphHistogram(col);

      // For full columns, check uniformity with rows/3
      // For half columns, check uniformity with rows/2
      const isFullColumn = col < system.full;
      const expectedFreq = isFullColumn ? rows.length / 3 : rows.length / 2;

      let isUniform = false;
      if (isFullColumn) {
        isUniform =
          glyphCounts["1"] === expectedFreq &&
          glyphCounts["X"] === expectedFreq &&
          glyphCounts["2"] === expectedFreq;
      } else {
        isUniform =
          glyphCounts["1"] === expectedFreq &&
          glyphCounts["X"] === expectedFreq;
      }

      if (isUniform) {
        const columnType = isFullColumn ? "full" : "half";
        problems.push(
          `U-system ${columnType} column ${col + 1}: must not be uniform but got all glyphs ${expectedFreq}x`
        );
      }
    }

    // Check that 1 is the most frequent glyph overall
    const totalCounts: Record<string, number> = { "1": 0, X: 0, "2": 0 };
    for (const row of rows) {
      for (const glyph of row) {
        if (glyph in totalCounts) {
          totalCounts[glyph]++;
        }
      }
    }
    const maxCount = Math.max(
      totalCounts["1"],
      totalCounts["X"],
      totalCounts["2"]
    );
    if (totalCounts["1"] !== maxCount) {
      problems.push(
        `U-system must have '1' as most frequent glyph, but got {1: ${totalCounts["1"]}, X: ${totalCounts["X"]}, 2: ${totalCounts["2"]}}`
      );
    }
  }

  return problems;
}

/**
 * List all available system-key codes.
 *
 * Returns the 12 file-backed codes plus M0-7-128 (generated).
 */
export function availableKeyCodes(): string[] {
  const fileCodes = Object.keys(FILE_SYSTEM_KEYS).sort();
  const hasM0 = fileCodes.includes("M0-7-128");
  if (!hasM0) {
    fileCodes.push("M0-7-128");
    fileCodes.sort();
  }
  return fileCodes;
}
