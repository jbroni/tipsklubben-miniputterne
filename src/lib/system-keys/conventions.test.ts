import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONVENTION,
  CANDIDATE_CONVENTIONS,
  CouponSlot,
  type KeyConvention,
} from "./conventions";
import { PICK_ORDER, type PickValue } from "../picks";
import { type SystemDefinition } from "../coupon-systems";

/**
 * Build a minimal system definition for testing.
 */
function makeSystem(
  type: "R" | "U" | "M",
  full: number,
  half: number
): SystemDefinition {
  return {
    code: `${type}${full}-${half}-999`,
    type,
    full,
    half,
    single: 13 - full - half,
    rows: 999,
    requiresBaseRow: type === "U",
  };
}

/**
 * Build a coupon slot for testing.
 */
function makeSlot(
  matchNumber: number,
  coverage: "single" | "half" | "full",
  outcomes: PickValue[],
  baseOutcome?: PickValue | null
): CouponSlot {
  return {
    matchNumber,
    coverage,
    outcomes,
    baseOutcome: baseOutcome ?? null,
  };
}

describe("DEFAULT_CONVENTION.decodeGlyph", () => {
  describe("R-system full coverage (HOME, DRAW, AWAY)", () => {
    it("1 → HOME", () => {
      const system = makeSystem("R", 3, 0);
      const slot = makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]);
      const result = DEFAULT_CONVENTION.decodeGlyph("1", slot, system);
      expect(result).toBe("HOME");
    });

    it("X → DRAW", () => {
      const system = makeSystem("R", 3, 0);
      const slot = makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]);
      const result = DEFAULT_CONVENTION.decodeGlyph("X", slot, system);
      expect(result).toBe("DRAW");
    });

    it("2 → AWAY", () => {
      const system = makeSystem("R", 3, 0);
      const slot = makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]);
      const result = DEFAULT_CONVENTION.decodeGlyph("2", slot, system);
      expect(result).toBe("AWAY");
    });
  });

  describe("R-system half coverage (HOME, AWAY)", () => {
    it("1 → HOME", () => {
      const system = makeSystem("R", 0, 1);
      const slot = makeSlot(1, "half", ["HOME", "AWAY"]);
      const result = DEFAULT_CONVENTION.decodeGlyph("1", slot, system);
      expect(result).toBe("HOME");
    });

    it("X → AWAY", () => {
      const system = makeSystem("R", 0, 1);
      const slot = makeSlot(1, "half", ["HOME", "AWAY"]);
      const result = DEFAULT_CONVENTION.decodeGlyph("X", slot, system);
      expect(result).toBe("AWAY");
    });

    it("2 throws", () => {
      const system = makeSystem("R", 0, 1);
      const slot = makeSlot(1, "half", ["HOME", "AWAY"]);
      expect(() => DEFAULT_CONVENTION.decodeGlyph("2", slot, system)).toThrow();
    });
  });

  describe("R-system half coverage (DRAW, AWAY)", () => {
    it("1 → DRAW", () => {
      const system = makeSystem("R", 0, 1);
      const slot = makeSlot(1, "half", ["DRAW", "AWAY"]);
      const result = DEFAULT_CONVENTION.decodeGlyph("1", slot, system);
      expect(result).toBe("DRAW");
    });

    it("X → AWAY", () => {
      const system = makeSystem("R", 0, 1);
      const slot = makeSlot(1, "half", ["DRAW", "AWAY"]);
      const result = DEFAULT_CONVENTION.decodeGlyph("X", slot, system);
      expect(result).toBe("AWAY");
    });

    it("2 throws", () => {
      const system = makeSystem("R", 0, 1);
      const slot = makeSlot(1, "half", ["DRAW", "AWAY"]);
      expect(() => DEFAULT_CONVENTION.decodeGlyph("2", slot, system)).toThrow();
    });
  });

  describe("U-system full coverage", () => {
    it("base=HOME: 1→HOME, X→DRAW, 2→AWAY", () => {
      const system = makeSystem("U", 1, 0);
      const slot = makeSlot(
        1,
        "full",
        ["HOME", "DRAW", "AWAY"],
        "HOME"
      );
      expect(DEFAULT_CONVENTION.decodeGlyph("1", slot, system)).toBe("HOME");
      expect(DEFAULT_CONVENTION.decodeGlyph("X", slot, system)).toBe("DRAW");
      expect(DEFAULT_CONVENTION.decodeGlyph("2", slot, system)).toBe("AWAY");
    });

    it("base=DRAW: 1→DRAW, X→HOME, 2→AWAY (transposition)", () => {
      const system = makeSystem("U", 1, 0);
      const slot = makeSlot(
        1,
        "full",
        ["HOME", "DRAW", "AWAY"],
        "DRAW"
      );
      expect(DEFAULT_CONVENTION.decodeGlyph("1", slot, system)).toBe("DRAW");
      expect(DEFAULT_CONVENTION.decodeGlyph("X", slot, system)).toBe("HOME");
      expect(DEFAULT_CONVENTION.decodeGlyph("2", slot, system)).toBe("AWAY");
    });

    it("base=AWAY: 1→AWAY, X→DRAW, 2→HOME (transposition)", () => {
      const system = makeSystem("U", 1, 0);
      const slot = makeSlot(
        1,
        "full",
        ["HOME", "DRAW", "AWAY"],
        "AWAY"
      );
      expect(DEFAULT_CONVENTION.decodeGlyph("1", slot, system)).toBe("AWAY");
      expect(DEFAULT_CONVENTION.decodeGlyph("X", slot, system)).toBe("DRAW");
      expect(DEFAULT_CONVENTION.decodeGlyph("2", slot, system)).toBe("HOME");
    });
  });

  describe("U-system half coverage", () => {
    it("(HOME, AWAY) with base=HOME: 1→HOME, X→AWAY", () => {
      const system = makeSystem("U", 0, 1);
      const slot = makeSlot(1, "half", ["HOME", "AWAY"], "HOME");
      expect(DEFAULT_CONVENTION.decodeGlyph("1", slot, system)).toBe("HOME");
      expect(DEFAULT_CONVENTION.decodeGlyph("X", slot, system)).toBe("AWAY");
    });

    it("(HOME, AWAY) with base=AWAY: 1→AWAY, X→HOME", () => {
      const system = makeSystem("U", 0, 1);
      const slot = makeSlot(1, "half", ["HOME", "AWAY"], "AWAY");
      expect(DEFAULT_CONVENTION.decodeGlyph("1", slot, system)).toBe("AWAY");
      expect(DEFAULT_CONVENTION.decodeGlyph("X", slot, system)).toBe("HOME");
    });

    it("(DRAW, AWAY) with base=AWAY: 1→AWAY, X→DRAW", () => {
      const system = makeSystem("U", 0, 1);
      const slot = makeSlot(1, "half", ["DRAW", "AWAY"], "AWAY");
      expect(DEFAULT_CONVENTION.decodeGlyph("1", slot, system)).toBe("AWAY");
      expect(DEFAULT_CONVENTION.decodeGlyph("X", slot, system)).toBe("DRAW");
    });

    it("(HOME, DRAW) with base=DRAW: 1→DRAW, X→HOME", () => {
      const system = makeSystem("U", 0, 1);
      const slot = makeSlot(1, "half", ["HOME", "DRAW"], "DRAW");
      expect(DEFAULT_CONVENTION.decodeGlyph("1", slot, system)).toBe("DRAW");
      expect(DEFAULT_CONVENTION.decodeGlyph("X", slot, system)).toBe("HOME");
    });
  });

  describe("transposition vs rotation for U-system base=AWAY", () => {
    it("transposition: X stays DRAW, 2 becomes HOME (not rotation)", () => {
      const system = makeSystem("U", 1, 0);
      const slot = makeSlot(
        1,
        "full",
        ["HOME", "DRAW", "AWAY"],
        "AWAY"
      );
      // With transposition (which is correct):
      // Outcomes sorted by PICK_ORDER: [HOME, DRAW, AWAY]
      // Swap HOME and AWAY so AWAY is at index 0: [AWAY, DRAW, HOME]
      // So: 1→AWAY, X→DRAW, 2→HOME
      expect(DEFAULT_CONVENTION.decodeGlyph("1", slot, system)).toBe("AWAY");
      expect(DEFAULT_CONVENTION.decodeGlyph("X", slot, system)).toBe("DRAW");
      expect(DEFAULT_CONVENTION.decodeGlyph("2", slot, system)).toBe("HOME");
    });
  });

  describe("error cases", () => {
    it("throws for single coverage slot", () => {
      const system = makeSystem("R", 0, 0);
      const slot = makeSlot(1, "single", ["HOME"]);
      expect(() => DEFAULT_CONVENTION.decodeGlyph("1", slot, system)).toThrow();
    });

    it("throws for U-covered slot with null baseOutcome", () => {
      const system = makeSystem("U", 1, 0);
      const slot = makeSlot(1, "full", ["HOME", "DRAW", "AWAY"], null);
      expect(() => DEFAULT_CONVENTION.decodeGlyph("1", slot, system)).toThrow();
    });

    it("throws for baseOutcome not in outcomes", () => {
      const system = makeSystem("U", 1, 0);
      const slot = makeSlot(
        1,
        "full",
        ["HOME", "DRAW"],
        "AWAY"
      );
      expect(() => DEFAULT_CONVENTION.decodeGlyph("1", slot, system)).toThrow();
    });
  });

  describe("property: no two glyphs decode to same outcome", () => {
    it("for R full coverage", () => {
      const system = makeSystem("R", 1, 0);
      const slot = makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]);
      const results = ["1", "X", "2"].map((g) =>
        DEFAULT_CONVENTION.decodeGlyph(g as "1" | "X" | "2", slot, system)
      );
      expect(new Set(results).size).toBe(3);
    });

    it("for U full coverage with different bases", () => {
      const system = makeSystem("U", 1, 0);
      for (const base of ["HOME", "DRAW", "AWAY"] as PickValue[]) {
        const slot = makeSlot(1, "full", ["HOME", "DRAW", "AWAY"], base);
        const results = ["1", "X", "2"].map((g) =>
          DEFAULT_CONVENTION.decodeGlyph(g as "1" | "X" | "2", slot, system)
        );
        expect(new Set(results).size).toBe(3);
      }
    });

    it("for half coverage combinations", () => {
      const system = makeSystem("U", 0, 1);
      const halfCombos: [PickValue[], PickValue | null][] = [
        [["HOME", "AWAY"], "HOME"],
        [["HOME", "AWAY"], "AWAY"],
        [["HOME", "DRAW"], "HOME"],
        [["HOME", "DRAW"], "DRAW"],
        [["DRAW", "AWAY"], "DRAW"],
        [["DRAW", "AWAY"], "AWAY"],
      ];
      for (const [outcomes, base] of halfCombos) {
        const slot = makeSlot(1, "half", outcomes, base);
        const results = ["1", "X"].map((g) =>
          DEFAULT_CONVENTION.decodeGlyph(g as "1" | "X", slot, system)
        );
        expect(new Set(results).size).toBe(2);
      }
    });
  });
});

describe("DEFAULT_CONVENTION.assignColumns", () => {
  it("returns full slots first, then half slots", () => {
    const system = makeSystem("R", 2, 2);
    const slots = [
      makeSlot(13, "single", ["HOME"]),
      makeSlot(12, "single", ["HOME"]),
      makeSlot(11, "single", ["HOME"]),
      makeSlot(10, "single", ["HOME"]),
      makeSlot(9, "single", ["HOME"]),
      makeSlot(8, "single", ["HOME"]),
      makeSlot(7, "single", ["HOME"]),
      makeSlot(6, "single", ["HOME"]),
      makeSlot(5, "single", ["HOME"]),
      makeSlot(3, "full", ["HOME", "DRAW", "AWAY"]),
      makeSlot(1, "half", ["HOME", "AWAY"]),
      makeSlot(2, "full", ["HOME", "DRAW", "AWAY"]),
      makeSlot(4, "half", ["HOME", "DRAW"]),
    ];
    const assigned = DEFAULT_CONVENTION.assignColumns(slots, system);
    expect(assigned.length).toBe(4);
    expect(assigned[0].matchNumber).toBe(2); // full sorted: 2, 3
    expect(assigned[1].matchNumber).toBe(3);
    expect(assigned[2].matchNumber).toBe(1); // half sorted: 1, 4
    expect(assigned[3].matchNumber).toBe(4);
  });

  it("sorts full slots by ascending matchNumber", () => {
    const system = makeSystem("R", 3, 0);
    const slots = [
      makeSlot(3, "full", ["HOME", "DRAW", "AWAY"]),
      makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]),
      makeSlot(2, "full", ["HOME", "DRAW", "AWAY"]),
      ...Array.from({ length: 10 }, (_, i) =>
        makeSlot(i + 4, "single", ["HOME"])
      ),
    ];
    const assigned = DEFAULT_CONVENTION.assignColumns(slots, system);
    expect(assigned.map((s) => s.matchNumber)).toEqual([1, 2, 3]);
  });

  it("sorts half slots by ascending matchNumber", () => {
    const system = makeSystem("R", 0, 3);
    const slots = [
      makeSlot(5, "half", ["HOME", "AWAY"]),
      makeSlot(3, "half", ["HOME", "DRAW"]),
      makeSlot(4, "half", ["DRAW", "AWAY"]),
      ...Array.from({ length: 10 }, (_, i) =>
        makeSlot(i + 6, "single", ["HOME"])
      ),
    ];
    const assigned = DEFAULT_CONVENTION.assignColumns(slots, system);
    expect(assigned.map((s) => s.matchNumber)).toEqual([3, 4, 5]);
  });

  it("is independent of input slot order", () => {
    const system = makeSystem("R", 2, 2);
    const allSlots = [
      makeSlot(4, "half", ["HOME", "AWAY"]),
      makeSlot(1, "half", ["HOME", "AWAY"]),
      makeSlot(3, "full", ["HOME", "DRAW", "AWAY"]),
      makeSlot(2, "full", ["HOME", "DRAW", "AWAY"]),
      ...Array.from({ length: 9 }, (_, i) =>
        makeSlot(i + 5, "single", ["HOME"])
      ),
    ];
    const assigned1 = DEFAULT_CONVENTION.assignColumns(allSlots, system);
    const shuffled = [allSlots[2], allSlots[0], allSlots[3], allSlots[1], ...allSlots.slice(4)];
    const assigned2 = DEFAULT_CONVENTION.assignColumns(shuffled, system);
    expect(assigned1.map((s) => s.matchNumber)).toEqual(
      assigned2.map((s) => s.matchNumber)
    );
  });

  it("throws when full coverage count disagrees", () => {
    const system = makeSystem("R", 3, 0);
    const slots = [
      makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]),
      makeSlot(2, "full", ["HOME", "DRAW", "AWAY"]),
      // Missing one full slot
    ];
    expect(() => DEFAULT_CONVENTION.assignColumns(slots, system)).toThrow();
  });

  it("throws when half coverage count disagrees", () => {
    const system = makeSystem("R", 0, 2);
    const slots = [
      makeSlot(1, "half", ["HOME", "AWAY"]),
      // Missing one half slot
    ];
    expect(() => DEFAULT_CONVENTION.assignColumns(slots, system)).toThrow();
  });

  it("works when full === 0", () => {
    const system = makeSystem("R", 0, 2);
    const slots = [
      makeSlot(1, "half", ["HOME", "AWAY"]),
      makeSlot(2, "half", ["DRAW", "AWAY"]),
      ...Array.from({ length: 11 }, (_, i) =>
        makeSlot(i + 3, "single", ["HOME"])
      ),
    ];
    const assigned = DEFAULT_CONVENTION.assignColumns(slots, system);
    expect(assigned.length).toBe(2);
    expect(assigned.map((s) => s.matchNumber)).toEqual([1, 2]);
  });

  it("works when half === 0", () => {
    const system = makeSystem("R", 2, 0);
    const slots = [
      makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]),
      makeSlot(2, "full", ["HOME", "DRAW", "AWAY"]),
      ...Array.from({ length: 11 }, (_, i) =>
        makeSlot(i + 3, "single", ["HOME"])
      ),
    ];
    const assigned = DEFAULT_CONVENTION.assignColumns(slots, system);
    expect(assigned.length).toBe(2);
    expect(assigned.map((s) => s.matchNumber)).toEqual([1, 2]);
  });
});

describe("CANDIDATE_CONVENTIONS", () => {
  it("has exactly 3 entries", () => {
    expect(CANDIDATE_CONVENTIONS.length).toBe(3);
  });

  it("includes DEFAULT_CONVENTION", () => {
    const ids = CANDIDATE_CONVENTIONS.map((c) => c.id);
    expect(ids).toContain("ascending-match-number");
  });

  it("all have unique ids", () => {
    const ids = CANDIDATE_CONVENTIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("includes descending-match-number variant", () => {
    const ids = CANDIDATE_CONVENTIONS.map((c) => c.id);
    expect(ids).toContain("descending-match-number");
  });

  it("includes rotational-u-base variant", () => {
    const ids = CANDIDATE_CONVENTIONS.map((c) => c.id);
    expect(ids).toContain("rotational-u-base");
  });
});
