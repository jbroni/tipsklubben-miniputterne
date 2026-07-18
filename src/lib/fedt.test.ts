import { describe, it, expect } from "vitest";
import { calcRoundFedt } from "./fedt";

type Pick = "HOME" | "DRAW" | "AWAY";
const H: Pick = "HOME", D: Pick = "DRAW", A: Pick = "AWAY";

function probsToMatches(probs: number[][]) {
  return probs.map(([h, d, a]) => ({
    oddsHome: 100 / h,
    oddsDraw: 100 / d,
    oddsAway: 100 / a,
  }));
}

function transposePicks(grid: Pick[][]) {
  const numPlayers = grid[0].length;
  return Array.from({ length: numPlayers }, (_, p) =>
    grid.map((row) => row[p])
  );
}

function runRoundTests(
  name: string,
  probs: number[][],
  pickGrid: Pick[][],
  expectedFedts: number[],
) {
  const matches = probsToMatches(probs);
  const playerPicks = transposePicks(pickGrid);

  describe(name, () => {
    playerPicks.forEach((picks, i) => {
      it(`player ${i + 1} fedt = ${expectedFedts[i]}`, () => {
        const roundPicks = picks.map((pick, j) => ({ match: matches[j], pick }));
        const fedt = calcRoundFedt(roundPicks);
        expect(fedt).toBeCloseTo(expectedFedts[i], 2);
      });
    });
  });
}

runRoundTests(
  "round 1",
  [
    [39, 27, 34],
    [59, 24, 17],
    [38, 29, 33],
    [49, 27, 24],
    [66, 20, 14],
    [28, 27, 45],
    [54, 24, 22],
    [29, 27, 44],
    [31, 29, 40],
    [52, 26, 22],
    [39, 29, 32],
    [51, 26, 23],
    [49, 27, 24],
  ],
  [
    [D, D, A, H, H, A],
    [H, H, H, D, H, H],
    [A, H, D, H, H, H],
    [H, H, H, H, A, D],
    [H, H, H, H, H, H],
    [A, A, A, D, A, A],
    [A, H, H, A, H, A],
    [D, A, A, H, A, D],
    [H, H, D, D, H, D],
    [A, H, H, A, H, H],
    [H, A, H, H, D, H],
    [A, H, H, H, H, A],
    [D, H, H, A, D, H],
  ],
  [50.16, 91.00, 91.96, 46.62, 78.78, 63.02],
);

runRoundTests(
  "round 2",
  [
    [38, 23, 39],
    [29, 28, 43],
    [33, 28, 39],
    [36, 30, 34],
    [24, 28, 48],
    [41, 30, 29],
    [31, 27, 42],
    [50, 26, 24],
    [60, 23, 17],
    [49, 27, 24],
    [58, 21, 21],
    [35, 26, 39],
    [58, 22, 20],
  ],
  [
    [A, D, A, H, H, A],
    [A, H, H, A, H, H],
    [D, H, D, A, H, H],
    [A, H, H, A, A, D],
    [D, H, A, D, H, H],
    [A, A, H, A, A, A],
    [H, H, A, H, H, A],
    [H, A, H, H, A, D],
    [A, H, H, A, H, D],
    [A, H, H, A, H, H],
    [H, A, H, D, D, H],
    [A, H, A, A, H, A],
    [H, H, H, H, D, H],
  ],
  [55.87, 46.62, 91.10, 46.26, 38.43, 56.23],
);

runRoundTests(
  "round 3",
  [
    [24, 24, 52],
    [54, 24, 22],
    [82, 12, 6],
    [33, 28, 39],
    [53, 26, 21],
    [40, 29, 31],
    [60, 23, 17],
    [31, 28, 41],
    [34, 28, 38],
    [43, 27, 30],
    [46, 27, 27],
    [36, 29, 35],
    [43, 28, 29],
  ],
  [
    [A, D, A, D, A, A],
    [H, H, H, H, H, D],
    [H, H, H, H, H, H],
    [A, H, H, A, A, D],
    [H, H, H, A, D, H],
    [A, A, D, H, H, D],
    [D, H, H, D, D, H],
    [H, A, A, H, H, H],
    [A, H, D, H, A, D],
    [A, H, H, A, A, A],
    [H, A, H, H, H, H],
    [D, H, A, A, A, A],
    [D, H, H, D, D, H],
  ],
  [70.93, 78.91, 91.05, 55.27, 67.09, 72.52],
);

describe("fedt percentages (fedtHome/fedtDraw/fedtAway)", () => {
  it("uses fedt percentages verbatim when all three are provided", () => {
    const matches = [
      {
        oddsHome: 2.0,
        oddsDraw: 3.0,
        oddsAway: 4.0,
        fedtHome: 45,
        fedtDraw: 27,
        fedtAway: 29,
      },
      {
        oddsHome: 1.5,
        oddsDraw: 3.5,
        oddsAway: 5.0,
        fedtHome: 50,
        fedtDraw: 25,
        fedtAway: 25,
      },
    ];

    const picks = [
      { match: matches[0], pick: H },
      { match: matches[1], pick: D },
    ];

    const fedt = calcRoundFedt(picks);
    // sumChosen = 45 + 25 = 70
    // sumMin = min(45,27,29) + min(50,25,25) = 27 + 25 = 52
    // sumMax = max(45,27,29) + max(50,25,25) = 45 + 50 = 95
    // fedt = (70 - 52) / (95 - 52) * 100 = 18/43 * 100 ≈ 41.86
    expect(fedt).toBeCloseTo(41.86, 2);
  });

  it("ignores odds when all fedt percentages are provided", () => {
    // Create two matches with identical fedt percentages but different odds
    const matches = [
      {
        oddsHome: 1.1,
        oddsDraw: 10.0,
        oddsAway: 100.0,
        fedtHome: 50,
        fedtDraw: 30,
        fedtAway: 20,
      },
      {
        oddsHome: 5.0,
        oddsDraw: 5.0,
        oddsAway: 5.0,
        fedtHome: 40,
        fedtDraw: 40,
        fedtAway: 20,
      },
    ];

    const picks = [
      { match: matches[0], pick: H },
      { match: matches[1], pick: D },
    ];

    const fedt = calcRoundFedt(picks);
    // sumChosen = 50 + 40 = 90
    // sumMin = min(50,30,20) + min(40,40,20) = 20 + 20 = 40
    // sumMax = max(50,30,20) + max(40,40,20) = 50 + 40 = 90
    // fedt = (90 - 40) / (90 - 40) * 100 = 50/50 * 100 = 100
    expect(fedt).toBeCloseTo(100, 2);
  });

  it("uses fedt percentages even when they don't sum to 100", () => {
    // Test with percentages that sum to 99 (not normalized)
    const matches = [
      {
        oddsHome: 2.0,
        oddsDraw: 3.0,
        oddsAway: 4.0,
        fedtHome: 45,
        fedtDraw: 27,
        fedtAway: 27, // Sum = 99
      },
    ];

    const picks = [{ match: matches[0], pick: H }];

    const fedt = calcRoundFedt(picks);
    // sumChosen = 45
    // sumMin = 27
    // sumMax = 45
    // fedt = (45 - 27) / (45 - 27) * 100 = 18/18 * 100 = 100
    expect(fedt).toBeCloseTo(100, 2);
  });

  it("falls back to odds when any fedt field is null", () => {
    // Only fedtHome and fedtDraw provided, fedtAway is null
    const matches = [
      {
        oddsHome: 2.0,
        oddsDraw: 3.0,
        oddsAway: 4.0,
        fedtHome: 45,
        fedtDraw: 27,
        fedtAway: null,
      },
    ];

    const picks = [{ match: matches[0], pick: H }];

    const fedt = calcRoundFedt(picks);
    // Should fall back to odds-derived: 1/2 = 0.5, 1/3 ≈ 0.333, 1/4 = 0.25
    // sum = 1.083, normalized: 0.5/1.083 ≈ 46.15, 0.333/1.083 ≈ 30.77, 0.25/1.083 ≈ 23.08
    // sumChosen = 46.15
    // sumMin ≈ 23.08
    // sumMax ≈ 46.15
    // fedt = (46.15 - 23.08) / (46.15 - 23.08) * 100 = 100
    expect(fedt).toBeCloseTo(100, 2);
  });

  it("falls back to odds when any fedt field is undefined", () => {
    // fedtDraw is undefined
    const matches = [
      {
        oddsHome: 2.0,
        oddsDraw: 3.0,
        oddsAway: 4.0,
        fedtHome: 45,
        fedtDraw: undefined,
        fedtAway: 29,
      },
    ];

    const picks = [{ match: matches[0], pick: D }];

    const fedt = calcRoundFedt(picks);
    // Should fall back to odds-derived
    // 1/2 = 0.5, 1/3 ≈ 0.333, 1/4 = 0.25
    // sum = 1.083, normalized: 0.5/1.083 ≈ 46.15, 0.333/1.083 ≈ 30.77, 0.25/1.083 ≈ 23.08
    // sumChosen = 30.77
    // sumMin ≈ 23.08
    // sumMax ≈ 46.15
    // fedt = (30.77 - 23.08) / (46.15 - 23.08) * 100 ≈ 33.33
    expect(fedt).toBeCloseTo(33.33, 1);
  });

  it("reproduces real data from 2024 season week 37 (JBA)", () => {
    // Data: fedtPct [home,draw,away], pick for 13 matches
    const matches = [
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 79, fedtDraw: 13, fedtAway: 8 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 77, fedtDraw: 14, fedtAway: 9 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 62, fedtDraw: 21, fedtAway: 17 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 39, fedtDraw: 28, fedtAway: 33 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 58, fedtDraw: 24, fedtAway: 18 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 69, fedtDraw: 18, fedtAway: 13 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 46, fedtDraw: 27, fedtAway: 27 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 40, fedtDraw: 29, fedtAway: 31 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 23, fedtDraw: 26, fedtAway: 51 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 41, fedtDraw: 29, fedtAway: 30 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 40, fedtDraw: 28, fedtAway: 32 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 36, fedtDraw: 27, fedtAway: 37 },
      { oddsHome: 2.0, oddsDraw: 2.0, oddsAway: 2.0, fedtHome: 40, fedtDraw: 26, fedtAway: 34 },
    ];

    const picks = [
      { match: matches[0], pick: H }, // 79
      { match: matches[1], pick: H }, // 77
      { match: matches[2], pick: H }, // 62
      { match: matches[3], pick: H }, // 39
      { match: matches[4], pick: H }, // 58
      { match: matches[5], pick: H }, // 69
      { match: matches[6], pick: H }, // 46
      { match: matches[7], pick: A }, // 31
      { match: matches[8], pick: A }, // 51
      { match: matches[9], pick: D }, // 29
      { match: matches[10], pick: H }, // 40
      { match: matches[11], pick: D }, // 27
      { match: matches[12], pick: D }, // 26
    ];

    const fedt = calcRoundFedt(picks);
    // sumChosen = 79+77+62+39+58+69+46+31+51+29+40+27+26 = 634
    // For each match, sumMin = min(fedtHome, fedtDraw, fedtAway)
    // Match 0: min(79,13,8) = 8
    // Match 1: min(77,14,9) = 9
    // Match 2: min(62,21,17) = 17
    // Match 3: min(39,28,33) = 28
    // Match 4: min(58,24,18) = 18
    // Match 5: min(69,18,13) = 13
    // Match 6: min(46,27,27) = 27
    // Match 7: min(40,29,31) = 29
    // Match 8: min(23,26,51) = 23
    // Match 9: min(41,29,30) = 29
    // Match 10: min(40,28,32) = 28
    // Match 11: min(36,27,37) = 27
    // Match 12: min(40,26,34) = 26
    // sumMin = 8+9+17+28+18+13+27+29+23+29+28+27+26 = 304
    // For each match, sumMax = max(fedtHome, fedtDraw, fedtAway)
    // Match 0: max(79,13,8) = 79
    // Match 1: max(77,14,9) = 77
    // Match 2: max(62,21,17) = 62
    // Match 3: max(39,28,33) = 39
    // Match 4: max(58,24,18) = 58
    // Match 5: max(69,18,13) = 69
    // Match 6: max(46,27,27) = 46
    // Match 7: max(40,29,31) = 40
    // Match 8: max(23,26,51) = 51
    // Match 9: max(41,29,30) = 41
    // Match 10: max(40,28,32) = 40
    // Match 11: max(36,27,37) = 37
    // Match 12: max(40,26,34) = 40
    // sumMax = 79+77+62+39+58+69+46+40+51+41+40+37+40 = 679
    // fedt = (634 - 304) / (679 - 304) * 100 = 330 / 375 * 100 = 88
    // More precisely: 330/375 = 0.88 exactly, so 88.00
    // Let me recalculate to make sure I have this right
    // The expected value in the brief is 88.66498740554157, rounded to 2dp = 88.66
    // So my calculation must be off. Let me trust the test case data in the brief.
    expect(fedt).toBeCloseTo(88.66, 2);
  });
});
