import { describe, it, expect } from "vitest";
import type { LeaderboardEntry } from "@/types";
import {
  playerStyle,
  chooseTickStep,
  computeYAxis,
  layoutLabels,
  truncateName,
  formBarWidth,
  buildProgress,
  type LabelInput,
  type LabelPlacement,
} from "./point-progress";

// --- fixture helpers -------------------------------------------------------

function label(id: string, name: string, endY: number): LabelInput {
  return { id, name, endY };
}

/** Round score tuple: [roundNumber, points] or [roundNumber, points, played]. */
type ScoreSpec = [number, number] | [number, number, boolean];

function entry(
  id: string,
  displayName: string,
  scores: ScoreSpec[],
  seasonFedt = 50
): LeaderboardEntry {
  const roundScores = scores.map(([roundNumber, points, played = true]) => ({
    roundNumber,
    points,
    fedt: seasonFedt,
    played,
  }));
  const totalPoints = roundScores.reduce((sum, r) => sum + r.points, 0);
  const roundsPlayed = roundScores.filter((r) => r.played).length;

  return {
    user: { id, displayName, avatarUrl: null },
    totalPoints,
    roundsPlayed,
    avgScore: roundsPlayed > 0 ? totalPoints / roundsPlayed : 0,
    seasonFedt,
    roundScores,
  };
}

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function allLabelsFinite(placements: LabelPlacement[]): boolean {
  return placements.every((p) => isFiniteNumber(p.labelY) && isFiniteNumber(p.endY));
}

// --- playerStyle -----------------------------------------------------------

describe("playerStyle", () => {
  it("gives 10 distinct shape+colour pairs for indices 0-9", () => {
    const styles = Array.from({ length: 10 }, (_, i) => playerStyle(i));
    const keys = styles.map((s) => `${s.shape}|${s.color}`);
    expect(new Set(keys).size).toBe(10);
    expect(new Set(styles.map((s) => s.shape)).size).toBe(10);
    expect(new Set(styles.map((s) => s.color)).size).toBe(10);
  });

  it("wraps index 10 back to index 0", () => {
    expect(playerStyle(10)).toEqual(playerStyle(0));
    expect(playerStyle(13)).toEqual(playerStyle(3));
  });

  it("is safe for negative and non-finite indices", () => {
    expect(playerStyle(-1)).toEqual(playerStyle(0));
    expect(playerStyle(Number.NaN)).toEqual(playerStyle(0));
    expect(playerStyle(Number.POSITIVE_INFINITY)).toEqual(playerStyle(0));
  });
});

// --- chooseTickStep / computeYAxis ----------------------------------------

describe("chooseTickStep", () => {
  it("picks the smallest step keeping at most 4 intervals", () => {
    const cases: [number, number][] = [
      [1, 1],
      [4, 1],
      [5, 2],
      [8, 2],
      [9, 5],
      [20, 5],
      [21, 10],
      [40, 10],
      [41, 20],
      [80, 20],
      [81, 25],
      [100, 25],
      [101, 50],
      [156, 50],
      [200, 50],
    ];
    for (const [max, expected] of cases) {
      expect(chooseTickStep(max), `max=${max}`).toBe(expected);
    }
  });

  it("falls back to the largest step when the max is huge", () => {
    expect(chooseTickStep(10_000)).toBe(50);
  });

  it("returns 1 for zero, negative and non-finite maxima", () => {
    expect(chooseTickStep(0)).toBe(1);
    expect(chooseTickStep(-12)).toBe(1);
    expect(chooseTickStep(Number.NaN)).toBe(1);
    expect(chooseTickStep(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("computeYAxis", () => {
  it("rounds yMax up to a whole number of steps and never below the max", () => {
    for (const max of [1, 4, 5, 7, 9, 13, 21, 37, 41, 78, 100, 156]) {
      const { step, yMax } = computeYAxis(max);
      expect(yMax, `max=${max}`).toBeGreaterThanOrEqual(Math.max(max, step));
      expect(yMax % step, `max=${max}`).toBe(0);
      expect(yMax - max, `max=${max}`).toBeLessThan(step);
    }
  });

  it("produces ticks from 0 to yMax with uniform spacing and at most 5 entries", () => {
    for (const max of [0, 3, 6, 11, 29, 52, 99, 156]) {
      const { step, yMax, ticks } = computeYAxis(max);
      expect(ticks[0], `max=${max}`).toBe(0);
      expect(ticks[ticks.length - 1], `max=${max}`).toBe(yMax);
      expect(ticks.length, `max=${max}`).toBeLessThanOrEqual(5);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i] - ticks[i - 1], `max=${max}`).toBe(step);
      }
      expect(ticks.every(isFiniteNumber)).toBe(true);
    }
  });

  it("handles a full 12-round season capped at 156 points", () => {
    expect(computeYAxis(156)).toEqual({
      step: 50,
      yMax: 200,
      ticks: [0, 50, 100, 150, 200],
    });
  });

  it("degrades gracefully for zero and non-finite maxima", () => {
    expect(computeYAxis(0)).toEqual({ step: 1, yMax: 1, ticks: [0, 1] });
    expect(computeYAxis(Number.NaN)).toEqual({ step: 1, yMax: 1, ticks: [0, 1] });
    expect(computeYAxis(-5).ticks.every(isFiniteNumber)).toBe(true);
  });
});

// --- layoutLabels ----------------------------------------------------------

describe("layoutLabels", () => {
  it("returns an empty array for empty input", () => {
    expect(layoutLabels([], 12, 0, 300)).toEqual([]);
  });

  it("leaves well-separated labels at their line ends", () => {
    const input = [label("a", "Anna", 20), label("b", "Bo", 100), label("c", "Carl", 220)];
    const out = layoutLabels(input, 12, 0, 300);
    expect(out.map((p) => p.labelY)).toEqual([20, 100, 220]);
    expect(out.every((p) => p.labelY === p.endY)).toBe(true);
  });

  it("separates a tie of two players by exactly the gap", () => {
    const out = layoutLabels([label("a", "Anna", 100), label("b", "Bo", 100)], 12, 0, 300);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.labelY)).toEqual([100, 112]);
    expect(new Set(out.map((p) => p.labelY)).size).toBe(2);
    expect(out.every((p) => p.endY === 100)).toBe(true);
  });

  it("separates a tie of three players by the gap each", () => {
    const out = layoutLabels(
      [label("a", "Anna", 150), label("b", "Bo", 150), label("c", "Carl", 150)],
      12,
      0,
      400
    );
    expect(out.map((p) => p.labelY)).toEqual([150, 162, 174]);
    expect(new Set(out.map((p) => p.labelY)).size).toBe(3);
  });

  it("shifts a stack up when it would run past the bottom edge", () => {
    const gap = 12;
    const bottom = 300;
    const out = layoutLabels(
      [label("a", "Anna", 290), label("b", "Bo", 292), label("c", "Carl", 294)],
      gap,
      0,
      bottom
    );

    expect(out[out.length - 1].labelY).toBe(bottom);
    for (let i = out.length - 2; i >= 0; i--) {
      expect(out[i + 1].labelY - out[i].labelY).toBeGreaterThanOrEqual(gap);
    }
    expect(out.map((p) => p.labelY)).toEqual([276, 288, 300]);
  });

  it("never places a label above the top of the plot area", () => {
    const out = layoutLabels(
      [label("a", "Anna", -40), label("b", "Bo", -20), label("c", "Carl", 0)],
      12,
      10,
      300
    );
    expect(out.every((p) => p.labelY >= 10)).toBe(true);
  });

  it("orders output by endY, then name, then id, regardless of input order", () => {
    const shuffled = [
      label("z", "Bo", 100),
      label("c", "Anna", 220),
      label("a", "Bo", 100),
      label("m", "Anna", 40),
    ];
    const out = layoutLabels(shuffled, 12, 0, 400);

    expect(out.map((p) => p.id)).toEqual(["m", "a", "z", "c"]);
    expect(out.map((p) => p.endY)).toEqual([40, 100, 100, 220]);

    // Same set in a different order yields the identical result
    const reshuffled = [shuffled[2], shuffled[3], shuffled[1], shuffled[0]];
    expect(layoutLabels(reshuffled, 12, 0, 400)).toEqual(out);
  });

  it("does not mutate the input array or its objects", () => {
    const input = [label("a", "Anna", 290), label("b", "Bo", 292), label("c", "Carl", 294)];
    const before = JSON.parse(JSON.stringify(input));
    const order = [...input];

    layoutLabels(input, 12, 0, 300);

    expect(input).toEqual(before);
    expect(input).toEqual(order);
    expect(input.every((p) => !("labelY" in p))).toBe(true);
  });

  it("produces no NaN, even when the stack is taller than the plot area", () => {
    const crowded = Array.from({ length: 12 }, (_, i) =>
      label(`p${i}`, `Player ${i}`, 50)
    );
    const out = layoutLabels(crowded, 20, 0, 60);

    expect(out).toHaveLength(12);
    expect(allLabelsFinite(out)).toBe(true);
    expect(out.every((p) => p.labelY >= 0)).toBe(true);
  });

  it("produces no NaN for a zero gap or a zero-height plot area", () => {
    const input = [label("a", "Anna", 10), label("b", "Bo", 10)];
    expect(allLabelsFinite(layoutLabels(input, 0, 0, 100))).toBe(true);
    expect(allLabelsFinite(layoutLabels(input, 12, 50, 50))).toBe(true);
  });
});

// --- truncateName / formBarWidth ------------------------------------------

describe("truncateName", () => {
  it("leaves short names untouched", () => {
    expect(truncateName("Bo")).toBe("Bo");
    expect(truncateName("Alexander", 10)).toBe("Alexander");
    expect(truncateName("Alexandra", 9)).toBe("Alexandra");
  });

  it("truncates long names with an ellipsis within the limit", () => {
    const out = truncateName("Jesper Broni Andersen");
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(10);
  });

  it("defaults to a maximum of 10 characters", () => {
    expect(truncateName("ABCDEFGHIJ")).toBe("ABCDEFGHIJ");
    expect(truncateName("ABCDEFGHIJK").length).toBe(10);
  });

  it("respects an explicit maxChars", () => {
    const out = truncateName("Christoffer", 5);
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out.endsWith("…")).toBe(true);
  });

  it("handles the empty string", () => {
    expect(truncateName("")).toBe("");
  });
});

describe("formBarWidth", () => {
  it("stays within [1, 8] across plausible round counts", () => {
    for (let rounds = 1; rounds <= 40; rounds++) {
      const width = formBarWidth(rounds);
      expect(width, `rounds=${rounds}`).toBeGreaterThanOrEqual(1);
      expect(width, `rounds=${rounds}`).toBeLessThanOrEqual(8);
      expect(Number.isInteger(width), `rounds=${rounds}`).toBe(true);
    }
  });

  it("gives narrower bars as the season grows", () => {
    expect(formBarWidth(1)).toBe(8);
    expect(formBarWidth(12)).toBeLessThan(formBarWidth(4));
  });

  it("is safe for zero and non-finite inputs", () => {
    expect(formBarWidth(0)).toBe(1);
    expect(formBarWidth(-3)).toBe(1);
    expect(formBarWidth(Number.NaN)).toBe(1);
  });
});

// --- buildProgress ---------------------------------------------------------

describe("buildProgress", () => {
  it("returns a fully zeroed progress for no entries", () => {
    expect(buildProgress([])).toEqual({
      series: [],
      roundNumbers: [],
      roundCount: 0,
      maxCumulative: 0,
      maxGap: 0,
    });
  });

  it("accumulates points per round and sorts best-first", () => {
    const entries = [
      entry("u-b", "Bo", [
        [1, 5],
        [2, 5],
      ]),
      entry("u-a", "Anna", [
        [1, 8],
        [2, 6],
      ]),
      entry("u-c", "Carl", [
        [1, 2],
        [2, 3],
      ]),
    ];

    const progress = buildProgress(entries);

    expect(progress.roundNumbers).toEqual([1, 2]);
    expect(progress.roundCount).toBe(2);
    expect(progress.series.map((s) => s.displayName)).toEqual(["Anna", "Bo", "Carl"]);
    expect(progress.series.map((s) => s.total)).toEqual([14, 10, 5]);
    expect(progress.series[0].points.map((p) => p.cumulative)).toEqual([8, 14]);
    expect(progress.series[1].points.map((p) => p.cumulative)).toEqual([5, 10]);
    expect(progress.maxCumulative).toBe(14);
  });

  it("breaks equal point totals with the bolder (lower) season fedt", () => {
    const entries = [
      entry("u-a", "Anna", [[1, 7]], 80),
      entry("u-b", "Bo", [[1, 7]], 20),
    ];

    const progress = buildProgress(entries);
    expect(progress.series.map((s) => s.displayName)).toEqual(["Bo", "Anna"]);
    expect(progress.series.map((s) => s.rank)).toEqual([1, 2]);
  });

  it("computes a non-negative gap to the round leader, zero for the leader", () => {
    const entries = [
      entry("u-a", "Anna", [
        [1, 8],
        [2, 6],
      ]),
      entry("u-b", "Bo", [
        [1, 5],
        [2, 5],
      ]),
    ];

    const progress = buildProgress(entries);
    const [leader, chaser] = progress.series;

    expect(leader.points.map((p) => p.gap)).toEqual([0, 0]);
    expect(chaser.points.map((p) => p.gap)).toEqual([3, 4]);
    for (const s of progress.series) {
      expect(s.points.every((p) => p.gap >= 0)).toBe(true);
    }
    expect(leader.gapToLeader).toBe(0);
    expect(leader.isLeader).toBe(true);
    expect(chaser.gapToLeader).toBe(4);
    expect(progress.maxGap).toBe(4);
  });

  it("assigns a shared rank on a full tie and skips the next rank", () => {
    const entries = [
      entry("u-a", "Anna", [[1, 7]], 40),
      entry("u-b", "Bo", [[1, 7]], 40),
      entry("u-c", "Carl", [[1, 3]], 40),
    ];

    const progress = buildProgress(entries);
    expect(progress.series.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it("uses the sorted union of round numbers when rounds are non-contiguous", () => {
    const entries = [
      entry("u-a", "Anna", [
        [1, 6],
        [2, 4],
        [4, 5],
      ]),
      entry("u-b", "Bo", [
        [1, 3],
        [2, 3],
        [4, 3],
      ]),
    ];

    const progress = buildProgress(entries);
    expect(progress.roundNumbers).toEqual([1, 2, 4]);
    expect(progress.roundCount).toBe(3);
    for (const s of progress.series) {
      expect(s.points).toHaveLength(3);
      expect(s.points.map((p) => p.roundNumber)).toEqual([1, 2, 4]);
    }
  });

  it("treats a missing round as 0 points, unplayed, carrying the cumulative forward", () => {
    const entries = [
      entry("u-a", "Anna", [
        [1, 6],
        [2, 4],
        [4, 5],
      ]),
      entry("u-b", "Bo", [
        [1, 3],
        [4, 4],
      ]),
    ];

    const progress = buildProgress(entries);
    const bo = progress.series.find((s) => s.displayName === "Bo");
    expect(bo).toBeDefined();
    expect(bo!.points.map((p) => p.roundNumber)).toEqual([1, 2, 4]);
    expect(bo!.points.map((p) => p.points)).toEqual([3, 0, 4]);
    expect(bo!.points.map((p) => p.played)).toEqual([true, false, true]);
    expect(bo!.points.map((p) => p.cumulative)).toEqual([3, 3, 7]);
    expect(bo!.total).toBe(7);
  });

  it("marks an explicitly unplayed round as played: false", () => {
    const entries = [entry("u-a", "Anna", [[1, 0, false], [2, 7]])];
    const progress = buildProgress(entries);
    expect(progress.series[0].points.map((p) => p.played)).toEqual([false, true]);
  });

  it("keeps styleIndex stable when standings change", () => {
    const first = buildProgress([
      entry("u-a", "Anna", [[1, 9]]),
      entry("u-b", "Bo", [[1, 4]]),
      entry("u-c", "Carl", [[1, 1]]),
    ]);
    const second = buildProgress([
      entry("u-a", "Anna", [[1, 1]]),
      entry("u-b", "Bo", [[1, 9]]),
      entry("u-c", "Carl", [[1, 6]]),
    ]);

    // Standings genuinely changed
    expect(first.series.map((s) => s.displayName)).not.toEqual(
      second.series.map((s) => s.displayName)
    );

    const styleFor = (p: typeof first, name: string) =>
      p.series.find((s) => s.displayName === name)!;

    for (const name of ["Anna", "Bo", "Carl"]) {
      expect(styleFor(first, name).styleIndex, name).toBe(styleFor(second, name).styleIndex);
      expect(styleFor(first, name).style, name).toEqual(styleFor(second, name).style);
    }
    expect(new Set(first.series.map((s) => s.styleIndex)).size).toBe(3);
    expect(first.series.every((s) => Boolean(s.style.shape) && Boolean(s.style.color))).toBe(true);
  });

  it("derives latestRoundPoints and gapToLeader from the final round", () => {
    const entries = [
      entry("u-a", "Anna", [
        [1, 2],
        [2, 11],
      ]),
      entry("u-b", "Bo", [
        [1, 10],
        [2, 1],
      ]),
    ];

    const progress = buildProgress(entries);
    const anna = progress.series.find((s) => s.displayName === "Anna")!;
    const bo = progress.series.find((s) => s.displayName === "Bo")!;

    expect(anna.latestRoundPoints).toBe(11);
    expect(bo.latestRoundPoints).toBe(1);
    // Bo led after round 1, Anna after round 2
    expect(bo.points[0].gap).toBe(0);
    expect(anna.points[0].gap).toBe(8);
    expect(anna.gapToLeader).toBe(0);
    expect(bo.gapToLeader).toBe(2);
  });

  it("shortens long display names for compact labels", () => {
    const progress = buildProgress([entry("u-a", "Jesper Broni Andersen", [[1, 5]])]);
    expect(progress.series[0].displayName).toBe("Jesper Broni Andersen");
    expect(progress.series[0].shortName.length).toBeLessThanOrEqual(10);
    expect(progress.series[0].shortName.endsWith("…")).toBe(true);
  });

  it("handles a single round with all-zero points without NaN or Infinity", () => {
    const progress = buildProgress([
      entry("u-a", "Anna", [[1, 0]]),
      entry("u-b", "Bo", [[1, 0]]),
    ]);

    expect(progress.roundCount).toBe(1);
    expect(progress.maxCumulative).toBe(0);
    expect(progress.maxGap).toBe(0);
    for (const s of progress.series) {
      expect(isFiniteNumber(s.total)).toBe(true);
      expect(isFiniteNumber(s.rank)).toBe(true);
      expect(isFiniteNumber(s.gapToLeader)).toBe(true);
      expect(isFiniteNumber(s.latestRoundPoints)).toBe(true);
      for (const p of s.points) {
        expect(isFiniteNumber(p.cumulative)).toBe(true);
        expect(isFiniteNumber(p.gap)).toBe(true);
        expect(isFiniteNumber(p.points)).toBe(true);
      }
    }
  });

  it("handles entries with no round scores at all", () => {
    const progress = buildProgress([entry("u-a", "Anna", []), entry("u-b", "Bo", [])]);
    expect(progress).toMatchObject({ roundNumbers: [], roundCount: 0, maxCumulative: 0, maxGap: 0 });
    expect(progress.series.map((s) => s.points)).toEqual([[], []]);
    expect(progress.series.every((s) => s.total === 0 && s.gapToLeader === 0)).toBe(true);
  });
});

// --- buildProgress: maxGap regression -------------------------------------

describe("buildProgress maxGap", () => {
  // Regression: maxGap was once derived from each series' final-round
  // gapToLeader, so a mid-season blowout that closed by the last round fell
  // outside the y-axis domain of gap ("Bag føreren") mode and drew off-plot.
  it("spans every round, not just the final one", () => {
    const entries = [
      // cumulative 20 / 20 / 20
      entry("u-a", "Anna", [
        [1, 20],
        [2, 0],
        [3, 0],
      ]),
      // cumulative 0 / 18 / 19 — 20 behind at round 1, only 1 behind at the end
      entry("u-b", "Bo", [
        [1, 0],
        [2, 18],
        [3, 1],
      ]),
    ];

    const progress = buildProgress(entries);
    const bo = progress.series.find((s) => s.displayName === "Bo")!;

    expect(bo.points.map((p) => p.cumulative)).toEqual([0, 18, 19]);
    expect(bo.points.map((p) => p.gap)).toEqual([20, 2, 1]);

    // The two derivations must be distinguishable: the final-round gap is 1,
    // the all-rounds maximum is 20.
    expect(bo.gapToLeader).toBe(1);
    expect(progress.maxGap).toBe(20);
    expect(progress.maxGap).toBeGreaterThan(
      Math.max(...progress.series.map((s) => s.gapToLeader))
    );

    // The domain must contain every plotted gap value
    for (const s of progress.series) {
      for (const point of s.points) {
        expect(point.gap).toBeLessThanOrEqual(progress.maxGap);
      }
    }
  });

  it("is 0 when every player is level at every round", () => {
    const progress = buildProgress([
      entry("u-a", "Anna", [
        [1, 5],
        [2, 6],
      ]),
      entry("u-b", "Bo", [
        [1, 5],
        [2, 6],
      ]),
    ]);

    expect(progress.series.flatMap((s) => s.points.map((p) => p.gap))).toEqual([0, 0, 0, 0]);
    expect(progress.maxGap).toBe(0);
  });

  it("is 0, not NaN, for no entries", () => {
    const progress = buildProgress([]);
    expect(progress.maxGap).toBe(0);
    expect(Number.isNaN(progress.maxGap)).toBe(false);
  });
});
