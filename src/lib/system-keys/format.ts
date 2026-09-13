/**
 * Pure parsing module for Danske Spil system-key files.
 *
 * No dependencies on fs, Prisma, or type definitions; safe for client.
 */

export type KeyGlyph = "1" | "X" | "2";

/**
 * Thrown when a key file fails to parse.
 */
export class SystemKeyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SystemKeyParseError";
  }
}

/**
 * Parse a Danske Spil key file into rows of compact glyph strings.
 *
 * Each line must match `^(\d+)\t[1X2](?:\t[1X2])*$` (index colon-tab-glyphs).
 * Indices must run strictly 1..N with no gaps.
 * All rows must have the same width.
 * A single trailing newline or blank line is tolerated.
 *
 * Returns an array of compact strings, e.g. ["1X2114X1", ...], with tabs
 * and index prefixes stripped.
 *
 * @throws SystemKeyParseError if input is empty, any line is malformed,
 * indices are out of order or gapped, or row widths are inconsistent.
 */
export function parseKeyFile(text: string): string[] {
  if (!text || text.trim().length === 0) {
    throw new SystemKeyParseError("File is empty");
  }

  // Split and remove trailing blank line if present
  let lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines = lines.slice(0, -1);
  }

  if (lines.length === 0) {
    throw new SystemKeyParseError("File contains no data");
  }

  const rows: string[] = [];
  let expectedIndex = 1;
  let rowWidth: number | null = null;

  for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
    const line = lines[lineNum - 1];

    // Match: index colon-tab-glyphs
    const match = line.match(/^(\d+):\t(.*)$/);
    if (!match) {
      throw new SystemKeyParseError(
        `Line ${lineNum}: expected format '<index>:\\t<glyph>\\t...' but got '${line}'`
      );
    }

    const [, indexStr, glyphsPart] = match;
    const index = parseInt(indexStr, 10);

    // Check index order
    if (index !== expectedIndex) {
      throw new SystemKeyParseError(
        `Line ${lineNum}: expected index ${expectedIndex} but got ${index}`
      );
    }

    // Parse glyphs
    const glyphs = glyphsPart.split("\t");
    if (glyphs.length === 0 || glyphs.some((g) => !["1", "X", "2"].includes(g))) {
      throw new SystemKeyParseError(
        `Line ${lineNum}: invalid or missing glyphs. Got '${glyphsPart}'`
      );
    }

    // Check row width consistency
    if (rowWidth === null) {
      rowWidth = glyphs.length;
    } else if (glyphs.length !== rowWidth) {
      throw new SystemKeyParseError(
        `Line ${lineNum}: row width mismatch. Expected ${rowWidth} glyphs but got ${glyphs.length}`
      );
    }

    rows.push(glyphs.join(""));
    expectedIndex++;
  }

  return rows;
}
