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
