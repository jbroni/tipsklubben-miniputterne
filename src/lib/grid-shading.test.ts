import { describe, it, expect } from "vitest";
import { isShadedRow } from "./grid-shading";

describe("isShadedRow", () => {
  describe("band 1: matches 1–3 (unshaded)", () => {
    it("match 1 is unshaded", () => {
      expect(isShadedRow(1)).toBe(false);
    });

    it("match 2 is unshaded", () => {
      expect(isShadedRow(2)).toBe(false);
    });

    it("match 3 is unshaded (boundary)", () => {
      expect(isShadedRow(3)).toBe(false);
    });
  });

  describe("band 2: matches 4–6 (shaded)", () => {
    it("match 4 is shaded (boundary)", () => {
      expect(isShadedRow(4)).toBe(true);
    });

    it("match 5 is shaded", () => {
      expect(isShadedRow(5)).toBe(true);
    });

    it("match 6 is shaded", () => {
      expect(isShadedRow(6)).toBe(true);
    });
  });

  describe("band 3: matches 7–9 (unshaded)", () => {
    it("match 7 is unshaded (boundary)", () => {
      expect(isShadedRow(7)).toBe(false);
    });

    it("match 8 is unshaded", () => {
      expect(isShadedRow(8)).toBe(false);
    });

    it("match 9 is unshaded", () => {
      expect(isShadedRow(9)).toBe(false);
    });
  });

  describe("band 4: matches 10–13 (shaded, four rows)", () => {
    it("match 10 is shaded (boundary)", () => {
      expect(isShadedRow(10)).toBe(true);
    });

    it("match 11 is shaded", () => {
      expect(isShadedRow(11)).toBe(true);
    });

    it("match 12 is shaded", () => {
      expect(isShadedRow(12)).toBe(true);
    });

    it("match 13 is shaded (last match)", () => {
      expect(isShadedRow(13)).toBe(true);
    });
  });

  describe("comprehensive coverage of all 13 matches", () => {
    const expectedShading: Record<number, boolean> = {
      1: false,
      2: false,
      3: false,
      4: true,
      5: true,
      6: true,
      7: false,
      8: false,
      9: false,
      10: true,
      11: true,
      12: true,
      13: true,
    };

    Object.entries(expectedShading).forEach(([matchNumber, expected]) => {
      it(`match ${matchNumber} shading matches specification`, () => {
        expect(isShadedRow(Number(matchNumber))).toBe(expected);
      });
    });
  });
});
