import { describe, it, expect } from "vitest";
import { buildSeries } from "./PointsProgressChart";
import type { LeaderboardEntry, LeaderboardUser } from "@/types";

// Helper to create a user fixture
function createUser(id: string, displayName: string): LeaderboardUser {
  return { id, displayName, avatarUrl: null };
}

// Helper to create a round score
function createRoundScore(
  roundNumber: number,
  points: number,
  played: boolean = true,
  fedt: number = 50
) {
  return { roundNumber, points, played, fedt };
}

// Helper to create a leaderboard entry
function createEntry(
  user: LeaderboardUser,
  totalPoints: number,
  roundScores: Array<{ roundNumber: number; points: number; played: boolean; fedt: number }>
): LeaderboardEntry {
  return {
    user,
    totalPoints,
    roundsPlayed: roundScores.filter((r) => r.played).length,
    avgScore: roundScores.length > 0 ? totalPoints / roundScores.length : 0,
    seasonFedt: 50,
    roundScores,
  };
}

describe("PointsProgressChart.buildSeries", () => {
  describe("the totalPoints invariant", () => {
    it("ensures each series final cumulative equals totalPoints", () => {
      const user = createUser("user1", "Alice Smith");
      const entry = createEntry(user, 10, [
        createRoundScore(1, 2),
        createRoundScore(2, 3),
        createRoundScore(3, 5),
      ]);

      const result = buildSeries([entry]);

      const series = result.series[0];
      const lastCumulative = series.points[series.points.length - 1].cumulative;

      expect(lastCumulative).toBe(entry.totalPoints);
      expect(lastCumulative).toBe(10);
    });

    it("maintains invariant for multiple entries with different totalPoints", () => {
      const entries = [
        createEntry(createUser("user1", "Alice"), 15, [
          createRoundScore(1, 5),
          createRoundScore(2, 7),
          createRoundScore(3, 3),
        ]),
        createEntry(createUser("user2", "Bob"), 12, [
          createRoundScore(1, 4),
          createRoundScore(2, 5),
          createRoundScore(3, 3),
        ]),
        createEntry(createUser("user3", "Charlie"), 8, [
          createRoundScore(1, 2),
          createRoundScore(2, 3),
          createRoundScore(3, 3),
        ]),
      ];

      const result = buildSeries(entries);

      entries.forEach((entry, idx) => {
        const series = result.series[idx];
        const lastCumulative = series.points[series.points.length - 1].cumulative;
        expect(lastCumulative).toBe(entry.totalPoints);
      });
    });

    it("maintains invariant even with single round", () => {
      const user = createUser("user1", "Alice");
      const entry = createEntry(user, 7, [createRoundScore(1, 7)]);

      const result = buildSeries([entry]);

      const series = result.series[0];
      expect(series.points[0].cumulative).toBe(7);
      expect(series.totalPoints).toBe(7);
    });
  });

  describe("cumulative monotonicity", () => {
    it("cumulative sums are monotonically non-decreasing", () => {
      const user = createUser("user1", "Alice");
      const entry = createEntry(user, 10, [
        createRoundScore(1, 2),
        createRoundScore(2, 3),
        createRoundScore(3, 5),
      ]);

      const result = buildSeries([entry]);

      const series = result.series[0];
      for (let i = 1; i < series.points.length; i++) {
        expect(series.points[i].cumulative).toBeGreaterThanOrEqual(
          series.points[i - 1].cumulative
        );
      }
    });

    it("handles zero-point rounds correctly (still non-decreasing)", () => {
      const user = createUser("user1", "Alice");
      const entry = createEntry(user, 5, [
        createRoundScore(1, 3),
        createRoundScore(2, 0),
        createRoundScore(3, 2),
      ]);

      const result = buildSeries([entry]);

      const series = result.series[0];
      expect(series.points[0].cumulative).toBe(3);
      expect(series.points[1].cumulative).toBe(3); // Same as before
      expect(series.points[2].cumulative).toBe(5);
    });
  });

  describe("unplayed rounds", () => {
    it("unplayed rounds contribute 0 points but still advance the round axis", () => {
      const user = createUser("user1", "Alice");
      const entry = createEntry(user, 2, [
        createRoundScore(1, 0, false), // Unplayed - 0 points
        createRoundScore(2, 2, true),
      ]);

      const result = buildSeries([entry]);

      const series = result.series[0];
      expect(series.points).toHaveLength(2);
      expect(series.points[0].roundNumber).toBe(1);
      expect(series.points[0].cumulative).toBe(0); // No points added
      expect(series.points[0].played).toBe(false);
      expect(series.points[1].roundNumber).toBe(2);
      expect(series.points[1].cumulative).toBe(2);
      expect(series.points[1].played).toBe(true);
    });

    it("handles multiple unplayed rounds", () => {
      const user = createUser("user1", "Alice");
      const entry = createEntry(user, 5, [
        createRoundScore(1, 0, false),
        createRoundScore(2, 0, false),
        createRoundScore(3, 5, true),
      ]);

      const result = buildSeries([entry]);

      const series = result.series[0];
      expect(series.points[0].played).toBe(false);
      expect(series.points[1].played).toBe(false);
      expect(series.points[2].played).toBe(true);
      expect(series.points[2].cumulative).toBe(5);
    });
  });

  describe("domain calculation", () => {
    it("domain.maxRound matches the longest roundScores array", () => {
      const entries = [
        createEntry(createUser("user1", "Alice"), 10, [
          createRoundScore(1, 3),
          createRoundScore(2, 3),
          createRoundScore(3, 4),
        ]),
        createEntry(createUser("user2", "Bob"), 6, [
          createRoundScore(1, 2),
          createRoundScore(2, 4),
        ]),
      ];

      const result = buildSeries(entries);

      expect(result.domain.maxRound).toBe(3);
    });

    it("domain.maxPoints is at least the highest cumulative value", () => {
      const entries = [
        createEntry(createUser("user1", "Alice"), 15, [
          createRoundScore(1, 5),
          createRoundScore(2, 5),
          createRoundScore(3, 5),
        ]),
        createEntry(createUser("user2", "Bob"), 8, [
          createRoundScore(1, 3),
          createRoundScore(2, 5),
        ]),
      ];

      const result = buildSeries(entries);

      expect(result.domain.maxPoints).toBeGreaterThanOrEqual(15);
    });

    it("domain.maxPoints equals the highest totalPoints when all rounds are sequential", () => {
      const entries = [
        createEntry(createUser("user1", "Alice"), 20, [
          createRoundScore(1, 5),
          createRoundScore(2, 5),
          createRoundScore(3, 5),
          createRoundScore(4, 5),
        ]),
        createEntry(createUser("user2", "Bob"), 10, [
          createRoundScore(1, 2),
          createRoundScore(2, 3),
          createRoundScore(3, 5),
        ]),
      ];

      const result = buildSeries(entries);

      expect(result.domain.maxPoints).toBe(20);
    });

    it("handles domain with single round", () => {
      const entries = [
        createEntry(createUser("user1", "Alice"), 5, [
          createRoundScore(1, 5),
        ]),
      ];

      const result = buildSeries(entries);

      expect(result.domain.maxRound).toBe(1);
      expect(result.domain.maxPoints).toBeGreaterThanOrEqual(5);
    });
  });

  describe("color assignment", () => {
    it("assigns colors from SERIES_COLORS palette deterministically", () => {
      const entries = [
        createEntry(createUser("user1", "Alice"), 10, [
          createRoundScore(1, 5),
          createRoundScore(2, 5),
        ]),
        createEntry(createUser("user2", "Bob"), 10, [
          createRoundScore(1, 5),
          createRoundScore(2, 5),
        ]),
        createEntry(createUser("user3", "Charlie"), 10, [
          createRoundScore(1, 5),
          createRoundScore(2, 5),
        ]),
      ];

      const result = buildSeries(entries);

      // First entry gets first color
      const color0 = result.series[0].color;
      const color1 = result.series[1].color;
      const color2 = result.series[2].color;

      // Different entries should get different colors (first 6 are distinct)
      expect(color0).not.toBe(color1);
      expect(color1).not.toBe(color2);
      expect(color0).not.toBe(color2);
    });

    it("cycles through palette for more than 8 players", () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        createEntry(createUser(`user${i}`, `Player${i}`), 10, [
          createRoundScore(1, 5),
          createRoundScore(2, 5),
        ])
      );

      const result = buildSeries(entries);

      // With 8-color palette, player 9 (index 8) should cycle back to the first color
      expect(result.series[0].color).toBe(result.series[8].color);
      expect(result.series[1].color).toBe(result.series[9].color);
    });

    it("assigns all required series colors", () => {
      const entries = Array.from({ length: 3 }, (_, i) =>
        createEntry(createUser(`user${i}`, `Player${i}`), 10, [
          createRoundScore(1, 5),
          createRoundScore(2, 5),
        ])
      );

      const result = buildSeries(entries);

      entries.forEach((_, idx) => {
        expect(result.series[idx].color).toBeDefined();
        expect(typeof result.series[idx].color).toBe("string");
        expect(result.series[idx].color.startsWith("#")).toBe(true);
      });
    });
  });

  describe("series structure", () => {
    it("series includes userId, displayName, firstName, and totalPoints", () => {
      const user = createUser("user1", "Alice Johnson");
      const entry = createEntry(user, 10, [
        createRoundScore(1, 5),
        createRoundScore(2, 5),
      ]);

      const result = buildSeries([entry]);

      const series = result.series[0];
      expect(series.userId).toBe("user1");
      expect(series.displayName).toBe("Alice Johnson");
      expect(series.firstName).toBe("Alice");
      expect(series.totalPoints).toBe(10);
    });

    it("extracts firstName correctly from displayName", () => {
      const cases = [
        { displayName: "Alice Smith", expected: "Alice" },
        { displayName: "Bob", expected: "Bob" },
        { displayName: "John Michael Doe", expected: "John" },
      ];

      cases.forEach(({ displayName, expected }) => {
        const user = createUser("user1", displayName);
        const entry = createEntry(user, 10, [createRoundScore(1, 10)]);
        const result = buildSeries([entry]);

        expect(result.series[0].firstName).toBe(expected);
      });
    });

    it("points array has correct structure with roundNumber, cumulative, and played", () => {
      const user = createUser("user1", "Alice");
      const entry = createEntry(user, 10, [
        createRoundScore(1, 3),
        createRoundScore(2, 7),
      ]);

      const result = buildSeries([entry]);

      const series = result.series[0];
      const points = series.points;

      expect(points).toHaveLength(2);
      points.forEach((p) => {
        expect(p).toHaveProperty("roundNumber");
        expect(p).toHaveProperty("cumulative");
        expect(p).toHaveProperty("played");
      });
    });
  });

  describe("degenerate inputs", () => {
    it("returns empty series array for empty entries", () => {
      const result = buildSeries([]);

      expect(result.series).toHaveLength(0);
    });

    it("returns domain with zeros for empty entries", () => {
      const result = buildSeries([]);

      expect(result.domain.maxRound).toBe(0);
      expect(result.domain.maxPoints).toBe(0);
    });

    it("handles single entry with single round", () => {
      const user = createUser("user1", "Alice");
      const entry = createEntry(user, 7, [createRoundScore(1, 7)]);

      const result = buildSeries([entry]);

      expect(result.series).toHaveLength(1);
      expect(result.series[0].points).toHaveLength(1);
      expect(result.series[0].points[0]).toEqual({
        roundNumber: 1,
        cumulative: 7,
        played: true,
      });
      expect(result.domain.maxRound).toBe(1);
      expect(result.domain.maxPoints).toBe(7);
    });

    it("handles entry with zero points across all rounds", () => {
      const user = createUser("user1", "Alice");
      const entry = createEntry(user, 0, [
        createRoundScore(1, 0),
        createRoundScore(2, 0),
        createRoundScore(3, 0),
      ]);

      const result = buildSeries([entry]);

      const series = result.series[0];
      expect(series.totalPoints).toBe(0);
      expect(series.points[series.points.length - 1].cumulative).toBe(0);
      expect(result.domain.maxPoints).toBe(0);
    });
  });

  describe("multiple entries", () => {
    it("returns series for all entries in order", () => {
      const entries = [
        createEntry(createUser("user1", "Alice"), 10, [
          createRoundScore(1, 5),
          createRoundScore(2, 5),
        ]),
        createEntry(createUser("user2", "Bob"), 12, [
          createRoundScore(1, 6),
          createRoundScore(2, 6),
        ]),
      ];

      const result = buildSeries(entries);

      expect(result.series).toHaveLength(2);
      expect(result.series[0].userId).toBe("user1");
      expect(result.series[1].userId).toBe("user2");
    });

    it("domain reflects the maximum across all entries", () => {
      const entries = [
        createEntry(createUser("user1", "Alice"), 5, [
          createRoundScore(1, 3),
          createRoundScore(2, 2),
        ]),
        createEntry(createUser("user2", "Bob"), 15, [
          createRoundScore(1, 5),
          createRoundScore(2, 5),
          createRoundScore(3, 5),
        ]),
      ];

      const result = buildSeries(entries);

      expect(result.domain.maxPoints).toBeGreaterThanOrEqual(15);
      expect(result.domain.maxRound).toBe(3);
    });
  });

  describe("cumulative progression", () => {
    it("correctly builds cumulative progression from round points", () => {
      const user = createUser("user1", "Alice");
      const entry = createEntry(user, 15, [
        createRoundScore(1, 2),
        createRoundScore(2, 3),
        createRoundScore(3, 5),
        createRoundScore(4, 5),
      ]);

      const result = buildSeries([entry]);

      const series = result.series[0];
      expect(series.points[0].cumulative).toBe(2);
      expect(series.points[1].cumulative).toBe(5); // 2 + 3
      expect(series.points[2].cumulative).toBe(10); // 5 + 5
      expect(series.points[3].cumulative).toBe(15); // 10 + 5
    });

    it("handles varying point distributions", () => {
      const user = createUser("user1", "Alice");
      const entry = createEntry(user, 20, [
        createRoundScore(1, 0),
        createRoundScore(2, 10),
        createRoundScore(3, 5),
        createRoundScore(4, 3),
        createRoundScore(5, 2),
      ]);

      const result = buildSeries([entry]);

      const series = result.series[0];
      const cumulatives = series.points.map((p) => p.cumulative);
      expect(cumulatives).toEqual([0, 10, 15, 18, 20]);
    });
  });

  describe("NaN safety with zero-point inputs", () => {
    it("regression: all-zero-points input produces valid domain without NaN", () => {
      const entries = [
        createEntry(createUser("user1", "Alice"), 0, [
          createRoundScore(1, 0),
          createRoundScore(2, 0),
        ]),
        createEntry(createUser("user2", "Bob"), 0, [
          createRoundScore(1, 0),
          createRoundScore(2, 0),
        ]),
      ];

      const result = buildSeries(entries);

      // Domain should have safe fallback values (not NaN)
      expect(result.domain.maxPoints).toBe(0);
      expect(result.domain.maxRound).toBe(2);
      expect(isFinite(result.domain.maxPoints)).toBe(true);
      expect(isFinite(result.domain.maxRound)).toBe(true);

      // All series points should have finite cumulative values
      result.series.forEach((series) => {
        series.points.forEach((point) => {
          expect(isFinite(point.cumulative)).toBe(true);
          expect(typeof point.cumulative).toBe("number");
        });
      });
    });

    it("all zero points with varying round counts still produces valid domain", () => {
      const entries = [
        createEntry(createUser("user1", "Alice"), 0, [
          createRoundScore(1, 0),
          createRoundScore(2, 0),
          createRoundScore(3, 0),
        ]),
        createEntry(createUser("user2", "Bob"), 0, [
          createRoundScore(1, 0),
          createRoundScore(2, 0),
        ]),
      ];

      const result = buildSeries(entries);

      expect(result.domain.maxRound).toBe(3);
      expect(result.domain.maxPoints).toBe(0);
      expect(isFinite(result.domain.maxRound)).toBe(true);
      expect(isFinite(result.domain.maxPoints)).toBe(true);
    });
  });
});
