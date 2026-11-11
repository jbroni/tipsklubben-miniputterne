import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prismaMocks: {
    match: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    round: {
      update: vi.fn(),
    },
  },
  fetchResults: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prismaMocks,
}));

vi.mock("@/lib/football-api", () => ({
  fetchResults: mocks.fetchResults,
}));

import { setMatchCancelled, resolveResultsAuto } from "./matches";

function mockMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    roundId: "round-1",
    matchNumber: 1,
    homeTeam: "Home",
    awayTeam: "Away",
    league: "League",
    kickoff: new Date("2026-11-14T15:00:00Z"),
    oddsHome: 2,
    oddsDraw: 3,
    oddsAway: 4,
    result: null,
    externalId: "ext-1",
    cancelled: false,
    fedtHome: null,
    fedtDraw: null,
    fedtAway: null,
    ...overrides,
  };
}

describe("setMatchCancelled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets cancelled to true and returns the updated match", async () => {
    const match = mockMatch();
    mocks.prismaMocks.match.findFirst.mockResolvedValue(match);
    mocks.prismaMocks.match.update.mockResolvedValue({ ...match, cancelled: true });

    const result = await setMatchCancelled({
      roundId: "round-1",
      matchId: "m1",
      cancelled: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.cancelled).toBe(true);
      expect(result.data.id).toBe("m1");
    }
    expect(mocks.prismaMocks.match.findFirst).toHaveBeenCalledWith({
      where: { id: "m1", roundId: "round-1" },
    });
    expect(mocks.prismaMocks.match.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { cancelled: true },
    });
  });

  it("sets cancelled to false (reinstating a match)", async () => {
    const match = mockMatch({ cancelled: true });
    mocks.prismaMocks.match.findFirst.mockResolvedValue(match);
    mocks.prismaMocks.match.update.mockResolvedValue({ ...match, cancelled: false });

    const result = await setMatchCancelled({
      roundId: "round-1",
      matchId: "m1",
      cancelled: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.cancelled).toBe(false);
    }
    expect(mocks.prismaMocks.match.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { cancelled: false },
    });
  });

  it("returns UNKNOWN_MATCH when the match belongs to another round", async () => {
    mocks.prismaMocks.match.findFirst.mockResolvedValue(null);

    const result = await setMatchCancelled({
      roundId: "round-1",
      matchId: "m-other-round",
      cancelled: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNKNOWN_MATCH");
    }
    expect(mocks.prismaMocks.match.update).not.toHaveBeenCalled();
  });

  it("returns VALIDATION when cancelled is not a boolean", async () => {
    const bad = [1, 0, "true", "false", null, undefined] as unknown as boolean[];

    for (const value of bad) {
      const result = await setMatchCancelled({
        roundId: "round-1",
        matchId: "m1",
        cancelled: value,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("VALIDATION");
      }
    }
    expect(mocks.prismaMocks.match.findFirst).not.toHaveBeenCalled();
    expect(mocks.prismaMocks.match.update).not.toHaveBeenCalled();
  });
});

describe("resolveResultsAuto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prismaMocks.match.updateMany.mockResolvedValue({ count: 1 });
    mocks.prismaMocks.match.count.mockResolvedValue(1);
    mocks.prismaMocks.match.findMany.mockResolvedValue([]);
  });

  it("excludes cancelled matches when fetching candidates", async () => {
    mocks.prismaMocks.match.findMany.mockResolvedValueOnce([mockMatch()]);
    mocks.fetchResults.mockResolvedValue([]);

    await resolveResultsAuto({ roundId: "round-1" });

    const firstCall = mocks.prismaMocks.match.findMany.mock.calls[0][0];
    expect(firstCall.where).toMatchObject({
      roundId: "round-1",
      externalId: { not: null },
      result: null,
      cancelled: false,
    });
  });

  it("excludes cancelled matches from the still-unresolved query", async () => {
    mocks.prismaMocks.match.findMany
      .mockResolvedValueOnce([mockMatch()])
      .mockResolvedValueOnce([]);
    mocks.fetchResults.mockResolvedValue([{ externalId: "ext-1", result: "1" }]);

    const result = await resolveResultsAuto({ roundId: "round-1" });

    expect(result.ok).toBe(true);
    const calls = mocks.prismaMocks.match.findMany.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][0].where).toMatchObject({
      roundId: "round-1",
      result: null,
      cancelled: false,
    });
  });

  it("returns NO_MATCHES_TO_RESOLVE when every candidate is excluded", async () => {
    mocks.prismaMocks.match.findMany.mockResolvedValueOnce([]);

    const result = await resolveResultsAuto({ roundId: "round-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NO_MATCHES_TO_RESOLVE");
    }
    expect(mocks.fetchResults).not.toHaveBeenCalled();
  });
});
