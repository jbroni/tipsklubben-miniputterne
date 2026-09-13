import { describe, it, expect } from "vitest";
import {
  expandCoupon,
  settleGroupCoupon,
  PRIZE_TIERS,
  type ExpandedRow,
} from "./group-coupon-settlement";
import {
  DEFAULT_CONVENTION,
  type CouponSlot,
  type KeyConvention,
} from "./system-keys/conventions";
import { getSystemKey, generateCompleteKey } from "./system-keys/index";
import { getSystem, SYSTEMS, type SystemDefinition } from "./coupon-systems";
import { type PickValue } from "./picks";

/**
 * Helper to build a coupon slot.
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

/**
 * Build a results map from an array of 13 picks.
 */
function makeResults(picks: (PickValue | null)[]): Record<number, PickValue | null> {
  const results: Record<number, PickValue | null> = {};
  for (let i = 0; i < 13; i++) {
    results[i + 1] = picks[i];
  }
  return results;
}

describe("expandCoupon", () => {
  describe("happy path: hand-built fixture", () => {
    it("expands a small system", () => {
      const system = getSystem("R5-5-108")!;
      const key = getSystemKey("R5-5-108")!;
      const slots: CouponSlot[] = [
        // 5 full
        makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(2, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(3, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(4, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(5, "full", ["HOME", "DRAW", "AWAY"]),
        // 5 half
        makeSlot(6, "half", ["HOME", "AWAY"]),
        makeSlot(7, "half", ["HOME", "AWAY"]),
        makeSlot(8, "half", ["HOME", "AWAY"]),
        makeSlot(9, "half", ["HOME", "AWAY"]),
        makeSlot(10, "half", ["HOME", "AWAY"]),
        // 3 single
        makeSlot(11, "single", ["HOME"]),
        makeSlot(12, "single", ["HOME"]),
        makeSlot(13, "single", ["HOME"]),
      ];

      const rows = expandCoupon({
        system,
        slots,
        key,
        convention: DEFAULT_CONVENTION,
      });

      expect(rows.length).toBe(108);
      expect(rows[0].index).toBe(0);
      expect(rows[107].index).toBe(107);
      expect(rows[0].signs.length).toBe(13);
    });
  });

  describe("expandCoupon with R4-4-144 system", () => {
    it("expands all 144 rows", () => {
      const system = getSystem("R4-4-144")!;
      const key = getSystemKey("R4-4-144")!;
      const slots: CouponSlot[] = [
        // 4 full
        makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(2, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(3, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(4, "full", ["HOME", "DRAW", "AWAY"]),
        // 4 half
        makeSlot(5, "half", ["HOME", "AWAY"]),
        makeSlot(6, "half", ["HOME", "DRAW"]),
        makeSlot(7, "half", ["DRAW", "AWAY"]),
        makeSlot(8, "half", ["HOME", "AWAY"]),
        // 5 single
        makeSlot(9, "single", ["HOME"]),
        makeSlot(10, "single", ["DRAW"]),
        makeSlot(11, "single", ["AWAY"]),
        makeSlot(12, "single", ["HOME"]),
        makeSlot(13, "single", ["DRAW"]),
      ];

      const rows = expandCoupon({
        system,
        slots,
        key,
        convention: DEFAULT_CONVENTION,
      });

      expect(rows.length).toBe(144);
      expect(rows.every((r) => r.signs.length === 13)).toBe(true);

      // All rows should be distinct
      const rowStrings = rows.map((r) => r.signs.join(","));
      expect(new Set(rowStrings).size).toBe(144);

      // Single slots should have constant values
      expect(rows.every((r) => r.signs[8] === "HOME")).toBe(true);
      expect(rows.every((r) => r.signs[9] === "DRAW")).toBe(true);
      expect(rows.every((r) => r.signs[10] === "AWAY")).toBe(true);
      expect(rows.every((r) => r.signs[11] === "HOME")).toBe(true);
      expect(rows.every((r) => r.signs[12] === "DRAW")).toBe(true);
    });
  });

  describe("expandCoupon error cases", () => {
    const system = getSystem("R5-5-108")!;
    const key = getSystemKey("R5-5-108")!;

    it("throws on slot count !== 13", () => {
      const slots: CouponSlot[] = [
        makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(2, "full", ["HOME", "DRAW", "AWAY"]),
      ];
      expect(() => expandCoupon({ system, slots, key })).toThrow();
      expect(() => expandCoupon({ system, slots, key })).toThrow("Expected 13 slots");
    });

    it("throws on duplicate match numbers", () => {
      const slots: CouponSlot[] = Array.from({ length: 13 }, (_, i) => {
        const matchNumber = i === 12 ? 1 : i + 1; // Duplicate match 1
        return makeSlot(matchNumber, "single", ["HOME"]);
      });
      expect(() => expandCoupon({ system, slots, key })).toThrow("Duplicate match numbers");
    });

    it("throws on missing match number", () => {
      const slots: CouponSlot[] = Array.from({ length: 13 }, (_, i) => {
        const matchNumber = i === 12 ? 14 : i + 1; // Missing 13, has 14
        return makeSlot(matchNumber, "single", ["HOME"]);
      });
      expect(() => expandCoupon({ system, slots, key })).toThrow("Missing match number");
    });

    it("throws on outcomes length disagreement", () => {
      const slots: CouponSlot[] = [
        makeSlot(1, "full", ["HOME", "DRAW"]), // Should have 3 for full
        ...Array.from({ length: 12 }, (_, i) =>
          makeSlot(i + 2, "single", ["HOME"])
        ),
      ];
      expect(() => expandCoupon({ system, slots, key })).toThrow(
        /coverage.*expects/
      );
    });
  });
});

describe("expandCoupon guarantee suite", () => {
  /**
   * For each file-backed system, we test the guarantee that for any combination
   * of outcomes, some row scores at least the documented minimum.
   */
  const guarantees: Array<{
    code: string;
    guarantee: number;
    outcomeCombos: number;
  }> = [
    { code: "U8-3-100", guarantee: 5, outcomeCombos: 52488 },
    { code: "U7-3-100", guarantee: 6, outcomeCombos: 17496 },
    { code: "U6-4-106", guarantee: 5, outcomeCombos: 11664 },
    { code: "R5-5-108", guarantee: 8, outcomeCombos: 7776 },
    { code: "R7-2-108", guarantee: 7, outcomeCombos: 8748 },
    { code: "U6-3-118", guarantee: 5, outcomeCombos: 5832 },
    { code: "R0-13-128", guarantee: 11, outcomeCombos: 8192 },
    { code: "U7-4-133", guarantee: 6, outcomeCombos: 34992 },
    { code: "U11-0-133", guarantee: 4, outcomeCombos: 177147 },
    { code: "R3-7-144", guarantee: 8, outcomeCombos: 3456 },
    { code: "R4-4-144", guarantee: 7, outcomeCombos: 1296 },
    { code: "R6-4-144", guarantee: 8, outcomeCombos: 11664 },
  ];

  it.each(guarantees)(
    "$code meets guarantee of $guarantee with $outcomeCombos combinations",
    ({ code, guarantee }) => {
      const system = getSystem(code)!;
      const key = getSystemKey(code)!;

      // Build slots: full, half, single in order
      const slots: CouponSlot[] = [];
      let matchNum = 1;

      for (let i = 0; i < system.full; i++) {
        slots.push(
          makeSlot(
            matchNum++,
            "full",
            ["HOME", "DRAW", "AWAY"],
            system.type === "U" ? "HOME" : undefined
          )
        );
      }

      for (let i = 0; i < system.half; i++) {
        slots.push(
          makeSlot(
            matchNum++,
            "half",
            ["HOME", "AWAY"],
            system.type === "U" ? "HOME" : undefined
          )
        );
      }

      for (let i = 0; i < system.single; i++) {
        slots.push(makeSlot(matchNum++, "single", ["HOME"]));
      }

      const expanded = expandCoupon({ system, slots, key });

      // Count all possible outcome combinations for covered matches
      const fullCombos = 3 ** system.full;
      const halfCombos = 2 ** system.half;
      const totalCombos = fullCombos * halfCombos;

      // For each outcome combination, check that some row meets the guarantee
      let tightCount = 0; // Combinations where guarantee is exactly met
      let meetsGuarantee = 0;

      for (let comboIdx = 0; comboIdx < totalCombos; comboIdx++) {
        // Decode combination into outcome array
        const outcomes = new Array(13).fill("HOME");

        // Full slots: base-3 enumeration
        let fullIdx = comboIdx % fullCombos;
        for (let i = 0; i < system.full; i++) {
          const outcome = [0, 1, 2].map((v) => ["HOME", "DRAW", "AWAY"][v])[
            fullIdx % 3
          ] as PickValue;
          outcomes[i] = outcome;
          fullIdx = Math.floor(fullIdx / 3);
        }

        // Half slots: base-2 enumeration
        let halfIdx = Math.floor(comboIdx / fullCombos);
        for (let i = 0; i < system.half; i++) {
          const outcome = (halfIdx & 1) ? "AWAY" : "HOME";
          outcomes[system.full + i] = outcome;
          halfIdx >>= 1;
        }

        // Score all rows
        const results = makeResults(outcomes);
        let maxScore = 0;

        for (const row of expanded) {
          let score = 0;
          for (let j = 0; j < system.full + system.half; j++) {
            if (row.signs[j] === results[j + 1]) {
              score++;
            }
          }
          maxScore = Math.max(maxScore, score);
        }

        if (maxScore >= guarantee) {
          meetsGuarantee++;
        }
        if (maxScore === guarantee) {
          tightCount++;
        }
      }

      // All combinations should meet the guarantee
      expect(meetsGuarantee).toBe(totalCombos);

      // At least one combination should achieve exactly the guarantee (tight)
      expect(tightCount).toBeGreaterThan(0);
    }
  );

  it("U7-4-133 with mixed-shape interleaved coverage meets guarantee", () => {
    // A system key's guarantee is a property of the key and must hold for any valid
    // slot assignment. This test exercises a mixed-shape case with interleaved coverage
    // across match numbers to verify:
    // 1. Half-glyph substitution for pairs other than ["HOME","AWAY"]
    // 2. U-system transposition when baseOutcome is "AWAY" (glyph X must still mean DRAW, 2 must mean HOME)
    // 3. Column assignment when covered matches are not numbered consecutively
    const system = getSystem("U7-4-133")!;
    const key = getSystemKey("U7-4-133")!;
    const guarantee = 6;

    // U7-4-133: 7 full, 4 half, 2 single with interleaved match numbers
    // Matches: 1(full,AWAY), 2(half,DRAW), 3(single), 4(full,DRAW), 5(half,AWAY),
    //          6(full,HOME), 7(full,AWAY), 8(half,HOME), 9(single), 10(full,DRAW),
    //          11(half,HOME), 12(full,HOME), 13(full,AWAY)
    const slots: CouponSlot[] = [
      makeSlot(1, "full", ["HOME", "DRAW", "AWAY"], "AWAY"),
      makeSlot(2, "half", ["HOME", "DRAW"], "DRAW"),
      makeSlot(3, "single", ["AWAY"], null),
      makeSlot(4, "full", ["HOME", "DRAW", "AWAY"], "DRAW"),
      makeSlot(5, "half", ["DRAW", "AWAY"], "AWAY"),
      makeSlot(6, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
      makeSlot(7, "full", ["HOME", "DRAW", "AWAY"], "AWAY"),
      makeSlot(8, "half", ["HOME", "AWAY"], "HOME"),
      makeSlot(9, "single", ["DRAW"], null),
      makeSlot(10, "full", ["HOME", "DRAW", "AWAY"], "DRAW"),
      makeSlot(11, "half", ["HOME", "DRAW"], "HOME"),
      makeSlot(12, "full", ["HOME", "DRAW", "AWAY"], "HOME"),
      makeSlot(13, "full", ["HOME", "DRAW", "AWAY"], "AWAY"),
    ];

    const expanded = expandCoupon({ system, slots, key });

    // Collect covered slots (non-single) in ascending match-number order
    const covered = slots
      .filter((s) => s.coverage !== "single")
      .sort((a, b) => a.matchNumber - b.matchNumber);

    // Mixed-radix enumeration: each slot has radix equal to its outcomes.length
    // 7 full slots (radix 3 each) × 4 half slots (radix 2 each) = 34992 total combinations
    const totalCombos = covered.reduce((acc, s) => acc * s.outcomes.length, 1);

    let tightCount = 0;
    let meetsGuarantee = 0;

    for (let k = 0; k < totalCombos; k++) {
      // Mixed-radix counter: k encodes outcome indices for each slot
      let t = k;
      const results: Record<number, PickValue> = {};

      // Enumerate each covered slot using its own radix
      for (const slot of covered) {
        const n = slot.outcomes.length;
        results[slot.matchNumber] = slot.outcomes[t % n]!;
        t = Math.floor(t / n);
      }

      // Single slots get their fixed outcome
      for (const slot of slots) {
        if (slot.coverage === "single") {
          results[slot.matchNumber] = slot.outcomes[0]!;
        }
      }

      // Score all rows against this outcome combination
      let maxScore = 0;

      for (const row of expanded) {
        let score = 0;
        for (const slot of covered) {
          if (row.signs[slot.matchNumber - 1] === results[slot.matchNumber]) {
            score++;
          }
        }
        maxScore = Math.max(maxScore, score);
      }

      if (maxScore >= guarantee) {
        meetsGuarantee++;
      }
      if (maxScore === guarantee) {
        tightCount++;
      }
    }

    // All outcome combinations should meet the guarantee
    expect(meetsGuarantee).toBe(totalCombos);

    // The guarantee is tight for exactly 184 combinations
    expect(tightCount).toBe(184);
  });
});

describe("U-system base-row decode tests", () => {
  const uSystemsAndExpected: Array<{ code: string; expectedScore: number }> = [
    { code: "U7-4-133", expectedScore: 13 },
    { code: "U11-0-133", expectedScore: 13 },
    { code: "U7-3-100", expectedScore: 13 },
    { code: "U6-4-106", expectedScore: 13 },
    { code: "U6-3-118", expectedScore: 13 },
    { code: "U8-3-100", expectedScore: 12 }, // Special: lacks pure udgangsrække
  ];

  it.each(uSystemsAndExpected)(
    "$code scores $expectedScore when results match baseOutcomes",
    ({ code, expectedScore }) => {
      const system = getSystem(code)!;
      const key = getSystemKey(code)!;

      const slots: CouponSlot[] = [];
      let matchNum = 1;

      for (let i = 0; i < system.full; i++) {
        slots.push(
          makeSlot(
            matchNum++,
            "full",
            ["HOME", "DRAW", "AWAY"],
            "HOME"
          )
        );
      }

      for (let i = 0; i < system.half; i++) {
        slots.push(
          makeSlot(
            matchNum++,
            "half",
            ["HOME", "AWAY"],
            "HOME"
          )
        );
      }

      for (let i = 0; i < system.single; i++) {
        slots.push(makeSlot(matchNum++, "single", ["HOME"]));
      }

      const expanded = expandCoupon({ system, slots, key });

      // Results are all HOME (matching baseOutcome for all slots)
      const results = makeResults(Array(13).fill("HOME"));

      let bestScore = 0;
      for (const row of expanded) {
        let score = 0;
        for (let i = 1; i <= 13; i++) {
          if (row.signs[i - 1] === results[i]) {
            score++;
          }
        }
        bestScore = Math.max(bestScore, score);
      }

      expect(bestScore).toBe(expectedScore);
    }
  );
});

describe("settleGroupCoupon", () => {
  describe("pending states", () => {
    it("returns pending when roundCompleted=false", () => {
      const system = getSystem("R5-5-108")!;
      const slots: CouponSlot[] = Array.from({ length: 13 }, (_, i) =>
        makeSlot(i + 1, "single", ["HOME"])
      );
      const results = makeResults(Array(13).fill("HOME"));

      const settlement = settleGroupCoupon({
        systemCode: "R5-5-108",
        slots,
        results,
        roundCompleted: false,
      });

      expect(settlement.status).toBe("pending");
      if (settlement.status !== "pending") throw new Error(`expected pending, got ${settlement.status}`);
      expect(settlement.reason).toBe("round-not-completed");
      expect(settlement.missingMatches).toEqual([]);
    });

    it("returns pending with missing match numbers", () => {
      const system = getSystem("R5-5-108")!;
      const slots: CouponSlot[] = Array.from({ length: 13 }, (_, i) =>
        makeSlot(i + 1, "single", ["HOME"])
      );
      const results = makeResults(Array(13).fill(null));
      results[5] = "HOME";
      results[10] = "DRAW";

      const settlement = settleGroupCoupon({
        systemCode: "R5-5-108",
        slots,
        results,
        roundCompleted: true,
      });

      expect(settlement.status).toBe("pending");
      if (settlement.status !== "pending") throw new Error(`expected pending, got ${settlement.status}`);
      expect(settlement.reason).toBe("missing-results");
      expect(settlement.missingMatches).toContain(1);
      expect(settlement.missingMatches).toContain(13);
    });
  });

  describe("partial state", () => {
    it("returns partial when system code is unknown", () => {
      const slots: CouponSlot[] = Array.from({ length: 13 }, (_, i) =>
        makeSlot(i + 1, "single", ["HOME"])
      );
      const results = makeResults(Array(13).fill("HOME"));

      const settlement = settleGroupCoupon({
        systemCode: "NOPE-1-1",
        slots,
        results,
        roundCompleted: true,
      });

      expect(settlement.status).toBe("partial");
      if (settlement.status !== "partial") throw new Error(`expected partial, got ${settlement.status}`);
      expect(settlement.reason).toBe("no-key");
      expect(settlement.systemCode).toBe("NOPE-1-1");
      expect(settlement.ceiling).toBe(13);
      expect(settlement.fullyCovered).toBe(true);
    });
  });

  describe("settled state", () => {
    it("returns settled with correct scores for simple case", () => {
      const system = getSystem("R5-5-108")!;
      const key = getSystemKey("R5-5-108")!;
      const slots: CouponSlot[] = [
        // 5 full
        makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(2, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(3, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(4, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(5, "full", ["HOME", "DRAW", "AWAY"]),
        // 5 half
        makeSlot(6, "half", ["HOME", "AWAY"]),
        makeSlot(7, "half", ["HOME", "AWAY"]),
        makeSlot(8, "half", ["HOME", "AWAY"]),
        makeSlot(9, "half", ["HOME", "AWAY"]),
        makeSlot(10, "half", ["HOME", "AWAY"]),
        // 3 single
        makeSlot(11, "single", ["HOME"]),
        makeSlot(12, "single", ["HOME"]),
        makeSlot(13, "single", ["HOME"]),
      ];
      const results = makeResults([
        "HOME",
        "DRAW",
        "AWAY",
        "HOME",
        "DRAW",
        "HOME",
        "AWAY",
        "HOME",
        "DRAW",
        "AWAY",
        "HOME",
        "HOME",
        "HOME",
      ]);

      const settlement = settleGroupCoupon({
        systemCode: "R5-5-108",
        slots,
        results,
        roundCompleted: true,
      });

      // Calculate expected ceiling from fixture
      // Position 9 has result "DRAW" but slot coverage is ["HOME", "AWAY"], so it's missed
      const expectedCeiling = 12;

      expect(settlement.status).toBe("settled");
      if (settlement.status !== "settled") throw new Error(`expected settled, got ${settlement.status}`);
      expect(settlement.systemCode).toBe("R5-5-108");
      expect(settlement.totalRows).toBe(108);
      expect(settlement.ceiling).toBe(expectedCeiling);
      expect(settlement.fullyCovered).toBe(false);
      expect(settlement.bestRow.correct).toBeGreaterThanOrEqual(0);
      expect(settlement.bestRow.index).toBeGreaterThanOrEqual(0);
      expect(settlement.bestRow.index).toBeLessThan(108);
      expect(settlement.bestRowCount).toBeGreaterThanOrEqual(1);
      expect(settlement.reductionCost).toBe(expectedCeiling - settlement.bestRow.correct);
    });

    it("tierCounts includes all PRIZE_TIERS", () => {
      const system = getSystem("R5-5-108")!;
      const key = getSystemKey("R5-5-108")!;
      const slots: CouponSlot[] = Array.from(
        { length: system.full },
        (_, i) =>
          makeSlot(i + 1, "full", ["HOME", "DRAW", "AWAY"])
      ).concat(
        Array.from({ length: system.half }, (_, i) =>
          makeSlot(system.full + i + 1, "half", ["HOME", "AWAY"])
        )
      ).concat(
        Array.from({ length: system.single }, (_, i) =>
          makeSlot(system.full + system.half + i + 1, "single", ["HOME"])
        )
      );
      const results = makeResults(Array(13).fill("HOME"));

      const settlement = settleGroupCoupon({
        systemCode: "R5-5-108",
        slots,
        results,
        roundCompleted: true,
      });

      expect(settlement.status).toBe("settled");
      if (settlement.status !== "settled") throw new Error(`expected settled, got ${settlement.status}`);
      for (const tier of PRIZE_TIERS) {
        expect(tier in settlement.tierCounts).toBe(true);
      }
    });

    it("distribution sums to totalRows", () => {
      const system = getSystem("R5-5-108")!;
      const key = getSystemKey("R5-5-108")!;
      const slots: CouponSlot[] = Array.from(
        { length: system.full },
        (_, i) =>
          makeSlot(i + 1, "full", ["HOME", "DRAW", "AWAY"])
      ).concat(
        Array.from({ length: system.half }, (_, i) =>
          makeSlot(system.full + i + 1, "half", ["HOME", "AWAY"])
        )
      ).concat(
        Array.from({ length: system.single }, (_, i) =>
          makeSlot(system.full + system.half + i + 1, "single", ["HOME"])
        )
      );
      const results = makeResults(Array(13).fill("HOME"));

      const settlement = settleGroupCoupon({
        systemCode: "R5-5-108",
        slots,
        results,
        roundCompleted: true,
      });

      expect(settlement.status).toBe("settled");
      if (settlement.status !== "settled") throw new Error(`expected settled, got ${settlement.status}`);
      const sum = Object.values(settlement.distribution).reduce((a: number, b: number) => a + b, 0);
      expect(sum).toBe(settlement.totalRows);
    });

    it("returns index of first (lowest) tied row", () => {
      // Use R5-5-108 to create a fixture that produces ties
      const system = getSystem("R5-5-108")!;
      const key = getSystemKey("R5-5-108")!;
      const slots: CouponSlot[] = [
        // 5 full
        makeSlot(1, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(2, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(3, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(4, "full", ["HOME", "DRAW", "AWAY"]),
        makeSlot(5, "full", ["HOME", "DRAW", "AWAY"]),
        // 5 half
        makeSlot(6, "half", ["HOME", "AWAY"]),
        makeSlot(7, "half", ["HOME", "AWAY"]),
        makeSlot(8, "half", ["HOME", "AWAY"]),
        makeSlot(9, "half", ["HOME", "AWAY"]),
        makeSlot(10, "half", ["HOME", "AWAY"]),
        // 3 single
        makeSlot(11, "single", ["HOME"]),
        makeSlot(12, "single", ["HOME"]),
        makeSlot(13, "single", ["HOME"]),
      ];

      // Use results that produce ties: all HOME
      // This creates multiple rows with the same maximum score
      const results = makeResults(Array(13).fill("HOME"));

      const settlement = settleGroupCoupon({
        systemCode: "R5-5-108",
        slots,
        results,
        roundCompleted: true,
      });

      expect(settlement.status).toBe("settled");
      if (settlement.status !== "settled") throw new Error(`expected settled, got ${settlement.status}`);

      // This fixture must produce ties to test tie-breaking
      expect(settlement.bestRowCount).toBeGreaterThan(1);

      // Verify that bestRow.index is the minimum index among all tied rows
      const expanded = expandCoupon({ system, slots, key });
      const allBestRows = expanded
        .map((row, idx) => {
          let score = 0;
          for (let i = 0; i < 13; i++) {
            if (row.signs[i] === results[i + 1]) {
              score++;
            }
          }
          return { index: idx, score };
        })
        .filter((r) => r.score === settlement.bestRow.correct);

      const minIndex = Math.min(...allBestRows.map((r) => r.index));
      expect(settlement.bestRow.index).toBe(minIndex);
      expect(allBestRows.length).toBe(settlement.bestRowCount);
    });
  });

  describe("error handling", () => {
    it("returns partial with invalid-coupon for malformed slots (never throws)", () => {
      const slots: CouponSlot[] = [
        makeSlot(1, "full", ["HOME"]), // Wrong outcomes length
      ];
      const results = makeResults(Array(13).fill("HOME"));

      const settlement = settleGroupCoupon({
        systemCode: "R5-5-108",
        slots,
        results,
        roundCompleted: true,
      });

      // Malformed coupon that fails expansion returns partial with invalid-coupon reason
      expect(settlement.status).toBe("partial");
      if (settlement.status !== "partial") throw new Error(`expected partial, got ${settlement.status}`);
      expect(settlement.reason).toBe("invalid-coupon");
      // Even with invalid coupon, should have key-free facts (ceiling, fullyCovered)
      expect(settlement.ceiling).toBeDefined();
      expect(settlement.fullyCovered).toBeDefined();
    });
  });

  describe("M0-7-128 invariant: complete system", () => {
    it("bestRow.correct equals ceiling for all outcome combinations", () => {
      const system = getSystem("M0-7-128")!;
      const slots: CouponSlot[] = Array.from(
        { length: system.full },
        (_, i) =>
          makeSlot(i + 1, "full", ["HOME", "DRAW", "AWAY"])
      ).concat(
        Array.from({ length: system.half }, (_, i) =>
          makeSlot(system.full + i + 1, "half", ["HOME", "AWAY"])
        )
      ).concat(
        Array.from({ length: system.single }, (_, i) =>
          makeSlot(system.full + system.half + i + 1, "single", ["HOME"])
        )
      );

      // Enumerate all 2^7 = 128 in-coverage combinations deterministically
      const halfCombos = 2 ** system.half;
      for (let comboIdx = 0; comboIdx < halfCombos; comboIdx++) {
        const outcomes: PickValue[] = Array(13).fill("HOME");

        // Decode half-slot combinations (base-2 enumeration)
        let halfIdx = comboIdx;
        for (let i = 0; i < system.half; i++) {
          const outcome = (halfIdx & 1) ? "AWAY" : "HOME";
          outcomes[system.full + i] = outcome;
          halfIdx >>= 1;
        }

        const results = makeResults(outcomes);

        const settlement = settleGroupCoupon({
          systemCode: "M0-7-128",
          slots,
          results,
          roundCompleted: true,
        });

        expect(settlement.status).toBe("settled");
        if (settlement.status !== "settled") throw new Error(`expected settled, got ${settlement.status}`);
        // M0-7-128 is complete: best row always matches the ceiling
        expect(settlement.bestRow.correct).toBe(settlement.ceiling);
      }

      // Test a few deliberately out-of-coverage cases to verify robustness
      for (let testIdx = 0; testIdx < 3; testIdx++) {
        const outcomes: PickValue[] = Array(13).fill("HOME");
        // Vary the first two half-slot results
        outcomes[0] = testIdx % 2 === 0 ? "HOME" : "AWAY";
        outcomes[1] = testIdx % 3 === 0 ? "AWAY" : "HOME";
        const results = makeResults(outcomes);

        const settlement = settleGroupCoupon({
          systemCode: "M0-7-128",
          slots,
          results,
          roundCompleted: true,
        });

        expect(settlement.status).toBe("settled");
        if (settlement.status !== "settled") throw new Error(`expected settled, got ${settlement.status}`);
        expect(settlement.bestRow.correct).toBe(settlement.ceiling);
      }
    });

    it("bestRow.correct equals 13 when all results are fully covered", () => {
      const system = getSystem("M0-7-128")!;
      const slots: CouponSlot[] = Array.from(
        { length: system.full },
        (_, i) =>
          makeSlot(i + 1, "full", ["HOME", "DRAW", "AWAY"])
      ).concat(
        Array.from({ length: system.half }, (_, i) =>
          makeSlot(system.full + i + 1, "half", ["HOME", "AWAY"])
        )
      ).concat(
        Array.from({ length: system.single }, (_, i) =>
          makeSlot(system.full + system.half + i + 1, "single", ["HOME"])
        )
      );

      // All results are fully covered
      const results = makeResults(Array(13).fill("HOME"));

      const settlement = settleGroupCoupon({
        systemCode: "M0-7-128",
        slots,
        results,
        roundCompleted: true,
      });

      expect(settlement.status).toBe("settled");
      if (settlement.status !== "settled") throw new Error(`expected settled, got ${settlement.status}`);
      expect(settlement.bestRow.correct).toBe(13);
      expect(settlement.ceiling).toBe(13);
    });
  });

  describe("determinism", () => {
    it("identical input yields identical output", () => {
      const system = getSystem("R5-5-108")!;
      const slots: CouponSlot[] = Array.from(
        { length: system.full },
        (_, i) =>
          makeSlot(i + 1, "full", ["HOME", "DRAW", "AWAY"])
      ).concat(
        Array.from({ length: system.half }, (_, i) =>
          makeSlot(system.full + i + 1, "half", ["HOME", "AWAY"])
        )
      ).concat(
        Array.from({ length: system.single }, (_, i) =>
          makeSlot(system.full + system.half + i + 1, "single", ["HOME"])
        )
      );
      const results = makeResults([
        "HOME",
        "DRAW",
        "AWAY",
        "HOME",
        "DRAW",
        "HOME",
        "AWAY",
        "HOME",
        "DRAW",
        "AWAY",
        "HOME",
        "HOME",
        "HOME",
      ]);

      const settlement1 = settleGroupCoupon({
        systemCode: "R5-5-108",
        slots,
        results,
        roundCompleted: true,
      });

      const settlement2 = settleGroupCoupon({
        systemCode: "R5-5-108",
        slots,
        results,
        roundCompleted: true,
      });

      expect(settlement1).toEqual(settlement2);
    });
  });
});
