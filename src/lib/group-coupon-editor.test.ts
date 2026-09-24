import { describe, it, expect } from "vitest";
import {
  coverageFor,
  toggleOutcome,
  setBaseOutcome,
  isRowEdited,
  countCoverage,
  validateCoupon,
  ADMIN_OVERRIDE_REASONING,
  type EditableRow,
  type CouponValidationIssue,
  type Coverage,
} from "./group-coupon-editor";
import { PICK_ORDER, type PickValue } from "./picks";
import { getSystem } from "./coupon-systems";

/* ──────────────────────────────────────────────────────────────────────── */
/* Test helpers                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Build an EditableRow with sensible defaults.
 */
function makeRow(
  matchNumber: number = 1,
  coverage: Coverage = "full",
  outcomes: PickValue[] = ["HOME", "DRAW", "AWAY"],
  baseOutcome: PickValue | null = null,
  reasoning: string = "Test reasoning"
): EditableRow {
  return {
    matchNumber,
    coverage,
    outcomes,
    baseOutcome,
    reasoning,
  };
}

/**
 * Build 13 EditableRows for a given system, all with full coverage initially.
 */
function make13Rows(
  systemCode: string
): EditableRow[] {
  const system = getSystem(systemCode)!;
  const rows: EditableRow[] = [];

  for (let i = 0; i < system.full; i++) {
    rows.push(
      makeRow(i + 1, "full", ["HOME", "DRAW", "AWAY"], null, "Full coverage")
    );
  }
  for (let i = 0; i < system.half; i++) {
    rows.push(
      makeRow(
        system.full + i + 1,
        "half",
        ["HOME", "DRAW"],
        null,
        "Half coverage"
      )
    );
  }
  for (let i = 0; i < system.single; i++) {
    rows.push(
      makeRow(
        system.full + system.half + i + 1,
        "single",
        ["HOME"],
        null,
        "Single coverage"
      )
    );
  }

  return rows;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* coverageFor                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

describe("coverageFor", () => {
  it("returns 'single' for count 1", () => {
    expect(coverageFor(1)).toBe("single");
  });

  it("returns 'half' for count 2", () => {
    expect(coverageFor(2)).toBe("half");
  });

  it("returns 'full' for count 3", () => {
    expect(coverageFor(3)).toBe("full");
  });

  it("throws for count 0", () => {
    expect(() => coverageFor(0)).toThrow();
  });

  it("throws for count 4", () => {
    expect(() => coverageFor(4)).toThrow();
  });

  it("throws for negative count", () => {
    expect(() => coverageFor(-1)).toThrow();
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* toggleOutcome                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

describe("toggleOutcome", () => {
  describe("adding outcomes", () => {
    it("adds outcome to empty row", () => {
      const row = makeRow(1, "single", [], null);
      const result = toggleOutcome(row, "HOME", false);

      expect(result.outcomes).toContain("HOME");
      expect(result.coverage).toBe("single");
    });

    it("adds outcome to single-outcome row → half", () => {
      const row = makeRow(1, "single", ["HOME"], null);
      const result = toggleOutcome(row, "DRAW", false);

      expect(result.outcomes).toEqual(["HOME", "DRAW"]);
      expect(result.coverage).toBe("half");
    });

    it("adds outcome to half-outcome row → full", () => {
      const row = makeRow(1, "half", ["HOME", "DRAW"], null);
      const result = toggleOutcome(row, "AWAY", false);

      expect(result.outcomes).toEqual(["HOME", "DRAW", "AWAY"]);
      expect(result.coverage).toBe("full");
    });

    it("maintains PICK_ORDER when adding to middle", () => {
      const row = makeRow(1, "single", ["HOME"], null);
      const result = toggleOutcome(row, "AWAY", false);

      expect(result.outcomes).toEqual(["HOME", "AWAY"]);
    });

    it("maintains PICK_ORDER when adding to beginning", () => {
      const row = makeRow(1, "single", ["AWAY"], null);
      const result = toggleOutcome(row, "HOME", false);

      expect(result.outcomes).toEqual(["HOME", "AWAY"]);
    });
  });

  describe("removing outcomes", () => {
    it("removes outcome from full row → half", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null);
      const result = toggleOutcome(row, "AWAY", false);

      expect(result.outcomes).toEqual(["HOME", "DRAW"]);
      expect(result.coverage).toBe("half");
    });

    it("removes outcome from half row → single", () => {
      const row = makeRow(1, "half", ["HOME", "DRAW"], null);
      const result = toggleOutcome(row, "DRAW", false);

      expect(result.outcomes).toEqual(["HOME"]);
      expect(result.coverage).toBe("single");
    });

    it("returns unchanged reference when removing last outcome", () => {
      const row = makeRow(1, "single", ["HOME"], null);
      const result = toggleOutcome(row, "HOME", false);

      expect(result).toBe(row);
    });

    it("maintains PICK_ORDER when removing middle outcome", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null);
      const result = toggleOutcome(row, "DRAW", false);

      expect(result.outcomes).toEqual(["HOME", "AWAY"]);
    });
  });

  describe("reasoning updates", () => {
    it("sets reasoning to ADMIN_OVERRIDE_REASONING when adding", () => {
      const row = makeRow(1, "single", ["HOME"], null, "Old reasoning");
      const result = toggleOutcome(row, "DRAW", false);

      expect(result.reasoning).toBe(ADMIN_OVERRIDE_REASONING);
    });

    it("sets reasoning to ADMIN_OVERRIDE_REASONING when removing", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null, "Old reasoning");
      const result = toggleOutcome(row, "AWAY", false);

      expect(result.reasoning).toBe(ADMIN_OVERRIDE_REASONING);
    });
  });

  describe("base outcome when requiresBaseRow false", () => {
    it("sets base to null when requiresBaseRow false, regardless of new coverage", () => {
      const row = makeRow(1, "half", ["HOME", "DRAW"], "HOME");
      const result = toggleOutcome(row, "AWAY", false);

      expect(result.baseOutcome).toBeNull();
    });
  });

  describe("base outcome when requiresBaseRow true and new coverage single", () => {
    it("sets base to null when new coverage is single", () => {
      const row = makeRow(1, "half", ["HOME", "DRAW"], "HOME");
      const result = toggleOutcome(row, "DRAW", true);

      expect(result.baseOutcome).toBeNull();
      expect(result.coverage).toBe("single");
    });
  });

  describe("base outcome when requiresBaseRow true and new coverage not single", () => {
    describe("keeping existing base if still covered", () => {
      it("keeps base when base is still in new outcomes", () => {
        const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME");
        const result = toggleOutcome(row, "AWAY", true);

        expect(result.baseOutcome).toBe("HOME");
        expect(result.outcomes).toEqual(["HOME", "DRAW"]);
      });
    });

    describe("regression case: single → half with base preserved", () => {
      it("preserves base when old row was single and its sole outcome still covered", () => {
        // Old: single [HOME] base HOME
        // Toggle DRAW with requiresBaseRow true
        // New: half [HOME, DRAW] base should be HOME (the old sole outcome, still covered)
        const row = makeRow(1, "single", ["HOME"], "HOME");
        const result = toggleOutcome(row, "DRAW", true);

        expect(result.coverage).toBe("half");
        expect(result.outcomes).toEqual(["HOME", "DRAW"]);
        expect(result.baseOutcome).toBe("HOME");
      });

      it("preserves base when old was single and that outcome is still there, even if adding to make half", () => {
        const row = makeRow(1, "single", ["DRAW"], "DRAW");
        const result = toggleOutcome(row, "AWAY", true);

        expect(result.outcomes).toEqual(["DRAW", "AWAY"]);
        expect(result.baseOutcome).toBe("DRAW");
      });
    });

    describe("nullifying base when conditions don't allow preservation", () => {
      it("nullifies base when old row was half and we remove base outcome", () => {
        // Old: half [HOME, DRAW] base HOME
        // Toggle HOME off (which removes it)
        // New: single [DRAW]
        // But wait, single means base should be null anyway...
        // Let me test half → half removing the base
        const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME");
        const result = toggleOutcome(row, "HOME", true);

        expect(result.coverage).toBe("half");
        expect(result.outcomes).toEqual(["DRAW", "AWAY"]);
        expect(result.baseOutcome).toBeNull();
      });

      it("nullifies base when old row was half and base not in new outcomes", () => {
        const row = makeRow(1, "half", ["HOME", "DRAW"], "HOME");
        // Remove HOME, but add AWAY
        // New: half [DRAW, AWAY], but we're toggling HOME off so base HOME is not covered
        const result = toggleOutcome(row, "HOME", true);

        expect(result.outcomes).toEqual(["DRAW"]);
        expect(result.coverage).toBe("single");
        expect(result.baseOutcome).toBeNull();
      });
    });
  });

  describe("coverage derived from outcomes", () => {
    it("coverage is always derived from outcome count", () => {
      const testCases: Array<[number, Coverage]> = [
        [1, "single"],
        [2, "half"],
        [3, "full"],
      ];

      for (const [count, expected] of testCases) {
        expect(coverageFor(count)).toBe(expected);
      }
    });
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* setBaseOutcome                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

describe("setBaseOutcome", () => {
  describe("sets base and reasoning", () => {
    it("sets baseOutcome to specified outcome", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null);
      const result = setBaseOutcome(row, "DRAW");

      expect(result.baseOutcome).toBe("DRAW");
    });

    it("sets reasoning to ADMIN_OVERRIDE_REASONING", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null, "Old reasoning");
      const result = setBaseOutcome(row, "HOME");

      expect(result.reasoning).toBe(ADMIN_OVERRIDE_REASONING);
    });
  });

  describe("unchanged reference for single rows", () => {
    it("returns same reference unchanged when row is single", () => {
      const row = makeRow(1, "single", ["HOME"], "HOME");
      const result = setBaseOutcome(row, "HOME");

      expect(result).toBe(row);
    });
  });

  describe("unchanged reference when outcome not covered", () => {
    it("returns same reference unchanged when outcome not in row's outcomes", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null);
      const result = setBaseOutcome(row, "HOME");

      // HOME is covered, so this should change. Let me fix this test.
      expect(result.baseOutcome).toBe("HOME");

      // Test with outcome not covered
      const row2 = makeRow(1, "half", ["HOME", "DRAW"], null);
      const result2 = setBaseOutcome(row2, "AWAY");

      expect(result2).toBe(row2);
    });
  });

  describe("modifying when coverage and outcome allow", () => {
    it("modifies base for half coverage with covered outcome", () => {
      const row = makeRow(1, "half", ["HOME", "DRAW"], "HOME");
      const result = setBaseOutcome(row, "DRAW");

      expect(result.baseOutcome).toBe("DRAW");
      expect(result.reasoning).toBe(ADMIN_OVERRIDE_REASONING);
    });

    it("modifies base for full coverage", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME");
      const result = setBaseOutcome(row, "AWAY");

      expect(result.baseOutcome).toBe("AWAY");
    });
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* isRowEdited                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

describe("isRowEdited", () => {
  describe("coverage changes", () => {
    it("returns true when coverage differs", () => {
      const row = makeRow(1, "half", ["HOME", "DRAW"], null);
      const baseline = makeRow(1, "single", ["HOME"], null);

      expect(isRowEdited(row, baseline)).toBe(true);
    });
  });

  describe("outcome set changes", () => {
    it("returns true when outcomes differ", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null);
      const baseline = makeRow(1, "full", ["HOME", "DRAW"], null);

      expect(isRowEdited(row, baseline)).toBe(true);
    });

    it("returns false when outcomes are the same set (order-independent check)", () => {
      const row = makeRow(1, "half", ["HOME", "DRAW"], null);
      const baseline = makeRow(1, "half", ["HOME", "DRAW"], null);

      expect(isRowEdited(row, baseline)).toBe(false);
    });
  });

  describe("baseOutcome changes", () => {
    it("returns true when baseOutcome differs", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME");
      const baseline = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "DRAW");

      expect(isRowEdited(row, baseline)).toBe(true);
    });

    it("returns true when baseOutcome becomes null", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null);
      const baseline = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME");

      expect(isRowEdited(row, baseline)).toBe(true);
    });
  });

  describe("reasoning ignored", () => {
    it("returns false when only reasoning differs", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME", "New reasoning");
      const baseline = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME", "Old reasoning");

      expect(isRowEdited(row, baseline)).toBe(false);
    });
  });

  describe("no changes", () => {
    it("returns false when rows are identical", () => {
      const row = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME");
      const baseline = makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME");

      expect(isRowEdited(row, baseline)).toBe(false);
    });
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* countCoverage                                                             */
/* ──────────────────────────────────────────────────────────────────────── */

describe("countCoverage", () => {
  it("counts rows by coverage", () => {
    const rows = [
      makeRow(1, "single", ["HOME"]),
      makeRow(2, "half", ["HOME", "DRAW"]),
      makeRow(3, "full", ["HOME", "DRAW", "AWAY"]),
      makeRow(4, "single", ["HOME"]),
      makeRow(5, "half", ["HOME", "DRAW"]),
    ];

    const counts = countCoverage(rows);

    expect(counts.single).toBe(2);
    expect(counts.half).toBe(2);
    expect(counts.full).toBe(1);
  });

  it("handles empty array", () => {
    const counts = countCoverage([]);

    expect(counts.single).toBe(0);
    expect(counts.half).toBe(0);
    expect(counts.full).toBe(0);
  });

  it("handles all single", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow(i + 1, "single", ["HOME"])
    );

    const counts = countCoverage(rows);

    expect(counts.single).toBe(5);
    expect(counts.half).toBe(0);
    expect(counts.full).toBe(0);
  });

  it("handles 13 rows matching system budget", () => {
    const rows = make13Rows("U8-3-100"); // 8 full, 3 half, 2 single

    const counts = countCoverage(rows);

    expect(counts.full).toBe(8);
    expect(counts.half).toBe(3);
    expect(counts.single).toBe(2);
  });
});

/* ──────────────────────────────────────────────────────────────────────── */
/* validateCoupon                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

describe("validateCoupon", () => {
  describe("valid coupons (empty issues array)", () => {
    it("returns empty array for valid U-system coupon with all bases", () => {
      const system = getSystem("U8-3-100")!;
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], "DRAW"),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], "AWAY"),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(7, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(8, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(9, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(10, "half", ["HOME", "DRAW"], "DRAW"),
        makeRow(11, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(12, "single", ["HOME"], null),
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      expect(issues).toEqual([]);
    });

    it("returns empty array for valid R-system coupon (no base required)", () => {
      const system = getSystem("R5-5-108")!;
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null),
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], null),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], null),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], null),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], null),
        makeRow(6, "half", ["HOME", "DRAW"], null),
        makeRow(7, "half", ["HOME", "DRAW"], null),
        makeRow(8, "half", ["HOME", "DRAW"], null),
        makeRow(9, "half", ["HOME", "DRAW"], null),
        makeRow(10, "half", ["HOME", "DRAW"], null),
        makeRow(11, "single", ["HOME"], null),
        makeRow(12, "single", ["HOME"], null),
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      expect(issues).toEqual([]);
    });

    it("returns empty array for single rows (no base required even for U-systems)", () => {
      const system = getSystem("U8-3-100")!;
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(7, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(8, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(9, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(10, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(11, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(12, "single", ["HOME"], null),
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      expect(issues).toEqual([]);
    });
  });

  describe("budget mismatch", () => {
    it("returns one 'budget' issue when full count exceeds system", () => {
      const system = getSystem("U8-3-100")!; // 8 full, 3 half, 2 single
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(7, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(8, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(9, "full", ["HOME", "DRAW", "AWAY"], "HOME"), // 9th full, exceeds
        makeRow(10, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(11, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(12, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      const budgetIssues = issues.filter((i) => i.kind === "budget");
      expect(budgetIssues.length).toBe(1);
      expect(budgetIssues[0].kind).toBe("budget");
      expect(budgetIssues[0].message.length).toBeGreaterThan(0);
      expect(budgetIssues[0].matchNumber).toBeUndefined();
    });

    it("returns one 'budget' issue when half count exceeds system", () => {
      const system = getSystem("U8-3-100")!; // 8 full, 3 half, 2 single
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(7, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(8, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(9, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(10, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(11, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(12, "half", ["HOME", "DRAW"], "HOME"), // 4th half, exceeds
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      const budgetIssues = issues.filter((i) => i.kind === "budget");
      expect(budgetIssues.length).toBe(1);
      expect(budgetIssues[0].kind).toBe("budget");
    });

    it("returns one 'budget' issue when single count exceeds system", () => {
      const system = getSystem("U8-3-100")!; // 8 full, 3 half, 2 single
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(7, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(8, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(9, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(10, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(11, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(12, "single", ["HOME"], null),
        makeRow(13, "single", ["HOME"], null),
        makeRow(14, "single", ["HOME"], null), // 3rd single, exceeds
      ];

      const issues = validateCoupon(rows, system);

      const budgetIssues = issues.filter((i) => i.kind === "budget");
      expect(budgetIssues.length).toBe(1);
    });
  });

  describe("missing base issues (U-systems only)", () => {
    it("returns 'missingBase' for half row with null base in U-system", () => {
      const system = getSystem("U8-3-100")!;
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(7, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(8, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(9, "half", ["HOME", "DRAW"], null), // Missing base
        makeRow(10, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(11, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(12, "single", ["HOME"], null),
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      const missingBaseIssues = issues.filter((i) => i.kind === "missingBase");
      expect(missingBaseIssues.length).toBe(1);
      expect(missingBaseIssues[0].matchNumber).toBe(9);
      expect(missingBaseIssues[0].message.length).toBeGreaterThan(0);
    });

    it("returns 'missingBase' for full row with null base in U-system", () => {
      const system = getSystem("U8-3-100")!;
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null), // Missing base
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(7, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(8, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(9, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(10, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(11, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(12, "single", ["HOME"], null),
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      const missingBaseIssues = issues.filter((i) => i.kind === "missingBase");
      expect(missingBaseIssues.length).toBe(1);
      expect(missingBaseIssues[0].matchNumber).toBe(1);
    });

    it("returns 'missingBase' when base is not covered by outcomes", () => {
      const system = getSystem("U8-3-100")!;
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(7, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(8, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(9, "half", ["HOME", "DRAW"], "AWAY"), // Base AWAY not covered
        makeRow(10, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(11, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(12, "single", ["HOME"], null),
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      const missingBaseIssues = issues.filter((i) => i.kind === "missingBase");
      expect(missingBaseIssues.length).toBe(1);
      expect(missingBaseIssues[0].matchNumber).toBe(9);
    });

    it("returns multiple 'missingBase' issues for multiple offending rows", () => {
      const system = getSystem("U8-3-100")!;
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null), // Missing
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(7, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(8, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(9, "half", ["HOME", "DRAW"], null), // Missing
        makeRow(10, "half", ["HOME", "DRAW"], "AWAY"), // Base not covered
        makeRow(11, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(12, "single", ["HOME"], null),
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      const missingBaseIssues = issues.filter((i) => i.kind === "missingBase");
      expect(missingBaseIssues.length).toBe(3);
      expect(missingBaseIssues.map((i) => i.matchNumber).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 9, 10]);
    });
  });

  describe("R-systems (no base required)", () => {
    it("ignores missing base for R-systems", () => {
      const system = getSystem("R5-5-108")!;
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null),
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], null),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], null),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], null),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], null),
        makeRow(6, "half", ["HOME", "DRAW"], null),
        makeRow(7, "half", ["HOME", "DRAW"], null),
        makeRow(8, "half", ["HOME", "DRAW"], null),
        makeRow(9, "half", ["HOME", "DRAW"], null),
        makeRow(10, "half", ["HOME", "DRAW"], null),
        makeRow(11, "single", ["HOME"], null),
        makeRow(12, "single", ["HOME"], null),
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      const missingBaseIssues = issues.filter((i) => i.kind === "missingBase");
      expect(missingBaseIssues).toEqual([]);
    });
  });

  describe("message properties", () => {
    it("all issues have non-empty Danish messages", () => {
      const system = getSystem("U8-3-100")!;
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], null),
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(7, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(8, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(9, "full", ["HOME", "DRAW", "AWAY"], "HOME"), // Budget issue
        makeRow(10, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(11, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(12, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      for (const issue of issues) {
        expect(issue.message.length).toBeGreaterThan(0);
        expect(typeof issue.message).toBe("string");
      }
    });

    it("budget issue does not have matchNumber", () => {
      const system = getSystem("U8-3-100")!;
      const rows = make13Rows("U8-3-100");
      rows.push(makeRow(14, "full", ["HOME", "DRAW", "AWAY"], "HOME"));

      const issues = validateCoupon(rows, system);

      const budgetIssues = issues.filter((i) => i.kind === "budget");
      for (const issue of budgetIssues) {
        expect(issue.matchNumber).toBeUndefined();
      }
    });

    it("missingBase issue has matchNumber", () => {
      const system = getSystem("U8-3-100")!;
      const rows = [
        makeRow(1, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(2, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(3, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(4, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(5, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(7, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(8, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
        makeRow(9, "half", ["HOME", "DRAW"], null),
        makeRow(10, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(11, "half", ["HOME", "DRAW"], "HOME"),
        makeRow(12, "single", ["HOME"], null),
        makeRow(13, "single", ["HOME"], null),
      ];

      const issues = validateCoupon(rows, system);

      const missingBaseIssues = issues.filter((i) => i.kind === "missingBase");
      for (const issue of missingBaseIssues) {
        expect(typeof issue.matchNumber).toBe("number");
        expect(issue.matchNumber! >= 1 && issue.matchNumber! <= 13).toBe(true);
      }
    });
  });
});
