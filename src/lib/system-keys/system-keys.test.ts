import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import {
  getSystemKey,
  generateCompleteKey,
  validateSystemKey,
  availableKeyCodes,
} from "./index";
import { parseKeyFile } from "./format";
import { SYSTEMS, getSystem } from "../coupon-systems";

describe("System Keys", () => {
  describe("getSystemKey", () => {
    it.each(SYSTEMS)(
      "returns a non-null key for system $code",
      (system) => {
        const key = getSystemKey(system.code);
        expect(key).not.toBeNull();
      }
    );

    it.each(SYSTEMS)(
      "returns correct row count for system $code",
      (system) => {
        const key = getSystemKey(system.code);
        expect(key!.rows.length).toBe(system.rows);
      }
    );

    it.each(SYSTEMS)(
      "all rows have correct width for system $code",
      (system) => {
        const key = getSystemKey(system.code);
        const expectedWidth = system.full + system.half;
        for (const row of key!.rows) {
          expect(row.length).toBe(expectedWidth);
        }
      }
    );

    it.each(SYSTEMS)(
      "columns property matches full + half for system $code",
      (system) => {
        const key = getSystemKey(system.code);
        expect(key!.columns).toBe(system.full + system.half);
      }
    );

    it.each(SYSTEMS)(
      "validates successfully for system $code",
      (system) => {
        const key = getSystemKey(system.code);
        const problems = validateSystemKey(system, key!.rows);
        expect(problems).toEqual([]);
      }
    );

    it("returns null for unknown code", () => {
      const key = getSystemKey("NOPE-1-2");
      expect(key).toBeNull();
    });

    it("does not throw on unknown code", () => {
      expect(() => getSystemKey("NOPE-1-2")).not.toThrow();
    });
  });

  describe("generateCompleteKey", () => {
    it("generates M0-7-128 with correct row count", () => {
      const system = getSystem("M0-7-128")!;
      const key = generateCompleteKey(system);
      expect(key.rows.length).toBe(128);
      expect(key.rows.length).toBe(2 ** 7);
    });

    it("generates M0-7-128 with 7 columns", () => {
      const system = getSystem("M0-7-128")!;
      const key = generateCompleteKey(system);
      expect(key.columns).toBe(7);
    });

    it("M0-7-128 alphabet contains only 1 and X", () => {
      const system = getSystem("M0-7-128")!;
      const key = generateCompleteKey(system);
      const alphabet = new Set<string>();
      for (const row of key.rows) {
        for (const glyph of row) {
          alphabet.add(glyph);
        }
      }
      expect(Array.from(alphabet).sort()).toEqual(["1", "X"]);
    });

    it("M0-7-128 has source 'generated'", () => {
      const system = getSystem("M0-7-128")!;
      const key = generateCompleteKey(system);
      expect(key.source).toBe("generated");
    });

    it("M0-7-128 contains all 2^7 binary combinations", () => {
      const system = getSystem("M0-7-128")!;
      const key = generateCompleteKey(system);
      const seen = new Set(key.rows);
      expect(seen.size).toBe(128);
      for (const row of key.rows) {
        expect(row.length).toBe(7);
        for (const glyph of row) {
          expect(["1", "X"]).toContain(glyph);
        }
      }
    });

    it("throws on non-M system", () => {
      const system = getSystem("R5-5-108")!;
      expect(() => generateCompleteKey(system)).toThrow();
    });
  });

  describe("availableKeyCodes", () => {
    it("returns 13 codes", () => {
      const codes = availableKeyCodes();
      expect(codes.length).toBe(13);
    });

    it("includes all SYSTEMS codes", () => {
      const codes = availableKeyCodes();
      const systemCodes = SYSTEMS.map((s) => s.code);
      for (const code of systemCodes) {
        expect(codes).toContain(code);
      }
    });

    it("includes M0-7-128", () => {
      const codes = availableKeyCodes();
      expect(codes).toContain("M0-7-128");
    });
  });

  describe("file-backed systems have source 'file'", () => {
    it.each(SYSTEMS.filter((s) => s.code !== "M0-7-128"))(
      "system $code has source 'file'",
      (system) => {
        const key = getSystemKey(system.code);
        expect(key!.source).toBe("file");
      }
    );
  });

  describe("drift guard: file contents match generated-keys export", () => {
    it("all file-backed keys match their disk representation", () => {
      const repoRoot = process.cwd();
      const keysDir = path.join(repoRoot, "system-keys");

      for (const system of SYSTEMS.filter((s) => s.code !== "M0-7-128")) {
        const keyFile = path.join(
          keysDir,
          system.code.toLowerCase() + ".txt"
        );

        // Read and parse the file
        const fileContent = fs.readFileSync(keyFile, "utf-8");
        const fileRows = parseKeyFile(fileContent);

        // Get the key from the module
        const key = getSystemKey(system.code)!;

        // Compare
        expect(fileRows).toEqual(Array.from(key.rows));
      }
    });
  });

  describe("regression cases: real system quirks", () => {
    it("U8-3-100 contains no all-1 row yet is valid", () => {
      const system = getSystem("U8-3-100")!;
      const key = getSystemKey("U8-3-100")!;

      // Check that there is no all-1 row
      const allOneRow = key.rows.find((row) =>
        Array.from(row).every((g) => g === "1")
      );
      expect(allOneRow).toBeUndefined();

      // But it validates fine
      const problems = validateSystemKey(system, key.rows);
      expect(problems).toEqual([]);
    });

    it("R3-7-144 contains an all-1 row and is still valid", () => {
      const system = getSystem("R3-7-144")!;
      const key = getSystemKey("R3-7-144")!;

      // Check that there IS an all-1 row
      const allOneRow = key.rows.find((row) =>
        Array.from(row).every((g) => g === "1")
      );
      expect(allOneRow).toBeDefined();

      // And it validates fine
      const problems = validateSystemKey(system, key.rows);
      expect(problems).toEqual([]);
    });
  });

  describe("validateSystemKey negative cases", () => {
    it("rejects dropped row", () => {
      const system = getSystem("R5-5-108")!;
      const key = getSystemKey("R5-5-108")!;
      const mutated = key.rows.slice(0, -1);
      const problems = validateSystemKey(system, mutated);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.some((p) => p.includes("Expected"))).toBe(true);
    });

    it("rejects duplicated row", () => {
      const system = getSystem("R5-5-108")!;
      const key = getSystemKey("R5-5-108")!;
      const mutated = [...key.rows, key.rows[0]];
      const problems = validateSystemKey(system, mutated);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.some((p) => p.includes("duplicate"))).toBe(true);
    });

    it("rejects row of wrong width", () => {
      const system = getSystem("R5-5-108")!;
      const key = getSystemKey("R5-5-108")!;
      const mutated = Array.from(key.rows);
      mutated[0] = mutated[0].slice(0, -1);
      const problems = validateSystemKey(system, mutated);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.some((p) => p.includes("width"))).toBe(true);
    });

    it("rejects glyph 2 in half column of R-system", () => {
      const system = getSystem("R5-5-108")!;
      const key = getSystemKey("R5-5-108")!;
      const mutated = Array.from(key.rows);
      // Half columns start at index system.full
      // Replace a character in a half column with '2'
      const row = mutated[0];
      const charArray = row.split("");
      // Change a glyph in the half column (after full columns)
      charArray[system.full] = "2";
      mutated[0] = charArray.join("");
      const problems = validateSystemKey(system, mutated);
      expect(problems.length).toBeGreaterThan(0);
    });
  });
});
