import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { arePicksStillOpen, arePicksRevealed } from "./rounds";

describe("arePicksStillOpen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set fixed time: 2026-09-10 12:00:00 UTC
    vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("status open + deadline in future", () => {
    it("returns true when status is open and deadline is in future (Date)", () => {
      const result = arePicksStillOpen({
        status: "open",
        deadline: new Date("2026-09-10T13:00:00Z"), // 1 hour in future
      });
      expect(result).toBe(true);
    });

    it("returns true when status is open and deadline is in future (ISO string)", () => {
      const result = arePicksStillOpen({
        status: "open",
        deadline: "2026-09-10T13:00:00Z",
      });
      expect(result).toBe(true);
    });

    it("returns true for deeply future deadlines (Date)", () => {
      const result = arePicksStillOpen({
        status: "open",
        deadline: new Date("2026-09-20T12:00:00Z"),
      });
      expect(result).toBe(true);
    });

    it("returns true for deeply future deadlines (ISO string)", () => {
      const result = arePicksStillOpen({
        status: "open",
        deadline: "2026-09-20T12:00:00Z",
      });
      expect(result).toBe(true);
    });
  });

  describe("status open + deadline in past (the critical regression case)", () => {
    it("returns false when status is open and deadline is in past (Date)", () => {
      const result = arePicksStillOpen({
        status: "open",
        deadline: new Date("2026-09-10T11:00:00Z"), // 1 hour in past
      });
      expect(result).toBe(false);
    });

    it("returns false when status is open and deadline is in past (ISO string)", () => {
      const result = arePicksStillOpen({
        status: "open",
        deadline: "2026-09-10T11:00:00Z",
      });
      expect(result).toBe(false);
    });

    it("returns false for deeply past deadlines (Date)", () => {
      const result = arePicksStillOpen({
        status: "open",
        deadline: new Date("2026-09-01T12:00:00Z"),
      });
      expect(result).toBe(false);
    });

    it("returns false for deeply past deadlines (ISO string)", () => {
      const result = arePicksStillOpen({
        status: "open",
        deadline: "2026-09-01T12:00:00Z",
      });
      expect(result).toBe(false);
    });
  });

  describe("status open + deadline at boundary (exactly now)", () => {
    it("returns false when deadline equals current time (Date)", () => {
      const result = arePicksStillOpen({
        status: "open",
        deadline: new Date("2026-09-10T12:00:00Z"), // exactly now
      });
      expect(result).toBe(false);
    });

    it("returns false when deadline equals current time (ISO string)", () => {
      const result = arePicksStillOpen({
        status: "open",
        deadline: "2026-09-10T12:00:00Z",
      });
      expect(result).toBe(false);
    });
  });

  describe("status locked + any deadline", () => {
    it("returns false when status is locked and deadline in future", () => {
      const result = arePicksStillOpen({
        status: "locked",
        deadline: new Date("2026-09-10T13:00:00Z"),
      });
      expect(result).toBe(false);
    });

    it("returns false when status is locked and deadline in past", () => {
      const result = arePicksStillOpen({
        status: "locked",
        deadline: new Date("2026-09-10T11:00:00Z"),
      });
      expect(result).toBe(false);
    });

    it("returns false when status is locked and deadline is now", () => {
      const result = arePicksStillOpen({
        status: "locked",
        deadline: new Date("2026-09-10T12:00:00Z"),
      });
      expect(result).toBe(false);
    });
  });

  describe("status completed + any deadline", () => {
    it("returns false when status is completed and deadline in future", () => {
      const result = arePicksStillOpen({
        status: "completed",
        deadline: new Date("2026-09-10T13:00:00Z"),
      });
      expect(result).toBe(false);
    });

    it("returns false when status is completed and deadline in past", () => {
      const result = arePicksStillOpen({
        status: "completed",
        deadline: new Date("2026-09-10T11:00:00Z"),
      });
      expect(result).toBe(false);
    });

    it("returns false when status is completed and deadline is now", () => {
      const result = arePicksStillOpen({
        status: "completed",
        deadline: new Date("2026-09-10T12:00:00Z"),
      });
      expect(result).toBe(false);
    });
  });

  describe("unexpected status values", () => {
    it("returns false for unknown status values", () => {
      const result = arePicksStillOpen({
        status: "unknown",
        deadline: new Date("2026-09-10T13:00:00Z"),
      });
      expect(result).toBe(false);
    });

    it("returns false for empty status", () => {
      const result = arePicksStillOpen({
        status: "",
        deadline: new Date("2026-09-10T13:00:00Z"),
      });
      expect(result).toBe(false);
    });
  });
});

describe("arePicksRevealed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set fixed time: 2026-09-10 12:00:00 UTC
    vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("status locked + any deadline", () => {
    it("returns true when status is locked and deadline in future", () => {
      const result = arePicksRevealed({
        status: "locked",
        deadline: new Date("2026-09-10T13:00:00Z"),
      });
      expect(result).toBe(true);
    });

    it("returns true when status is locked and deadline in past", () => {
      const result = arePicksRevealed({
        status: "locked",
        deadline: new Date("2026-09-10T11:00:00Z"),
      });
      expect(result).toBe(true);
    });

    it("returns true when status is locked and deadline is now (Date)", () => {
      const result = arePicksRevealed({
        status: "locked",
        deadline: new Date("2026-09-10T12:00:00Z"),
      });
      expect(result).toBe(true);
    });

    it("returns true when status is locked (ISO string)", () => {
      const result = arePicksRevealed({
        status: "locked",
        deadline: "2026-09-10T13:00:00Z",
      });
      expect(result).toBe(true);
    });
  });

  describe("status completed + any deadline", () => {
    it("returns true when status is completed and deadline in future", () => {
      const result = arePicksRevealed({
        status: "completed",
        deadline: new Date("2026-09-10T13:00:00Z"),
      });
      expect(result).toBe(true);
    });

    it("returns true when status is completed and deadline in past", () => {
      const result = arePicksRevealed({
        status: "completed",
        deadline: new Date("2026-09-10T11:00:00Z"),
      });
      expect(result).toBe(true);
    });

    it("returns true when status is completed and deadline is now (Date)", () => {
      const result = arePicksRevealed({
        status: "completed",
        deadline: new Date("2026-09-10T12:00:00Z"),
      });
      expect(result).toBe(true);
    });

    it("returns true when status is completed (ISO string)", () => {
      const result = arePicksRevealed({
        status: "completed",
        deadline: "2026-09-10T13:00:00Z",
      });
      expect(result).toBe(true);
    });
  });

  describe("status open + deadline in future", () => {
    it("returns false when status is open and deadline in future (Date)", () => {
      const result = arePicksRevealed({
        status: "open",
        deadline: new Date("2026-09-10T13:00:00Z"),
      });
      expect(result).toBe(false);
    });

    it("returns false when status is open and deadline in future (ISO string)", () => {
      const result = arePicksRevealed({
        status: "open",
        deadline: "2026-09-10T13:00:00Z",
      });
      expect(result).toBe(false);
    });

    it("returns false for deeply future deadlines", () => {
      const result = arePicksRevealed({
        status: "open",
        deadline: new Date("2026-09-20T12:00:00Z"),
      });
      expect(result).toBe(false);
    });
  });

  describe("status open + deadline in past (the critical regression case)", () => {
    it("returns true when status is open and deadline in past (Date)", () => {
      const result = arePicksRevealed({
        status: "open",
        deadline: new Date("2026-09-10T11:00:00Z"),
      });
      expect(result).toBe(true);
    });

    it("returns true when status is open and deadline in past (ISO string)", () => {
      const result = arePicksRevealed({
        status: "open",
        deadline: "2026-09-10T11:00:00Z",
      });
      expect(result).toBe(true);
    });

    it("returns true for deeply past deadlines", () => {
      const result = arePicksRevealed({
        status: "open",
        deadline: new Date("2026-09-01T12:00:00Z"),
      });
      expect(result).toBe(true);
    });
  });

  describe("status open + deadline at boundary (exactly now)", () => {
    it("returns true when status is open and deadline equals current time (Date)", () => {
      const result = arePicksRevealed({
        status: "open",
        deadline: new Date("2026-09-10T12:00:00Z"),
      });
      expect(result).toBe(true);
    });

    it("returns true when status is open and deadline equals current time (ISO string)", () => {
      const result = arePicksRevealed({
        status: "open",
        deadline: "2026-09-10T12:00:00Z",
      });
      expect(result).toBe(true);
    });
  });

  describe("unexpected status values", () => {
    it("returns false for unknown status with future deadline", () => {
      const result = arePicksRevealed({
        status: "unknown",
        deadline: new Date("2026-09-10T13:00:00Z"),
      });
      expect(result).toBe(false);
    });

    it("returns true for unknown status with past deadline", () => {
      const result = arePicksRevealed({
        status: "unknown",
        deadline: new Date("2026-09-10T11:00:00Z"),
      });
      expect(result).toBe(true);
    });

    it("returns false for empty status with future deadline", () => {
      const result = arePicksRevealed({
        status: "",
        deadline: new Date("2026-09-10T13:00:00Z"),
      });
      expect(result).toBe(false);
    });

    it("returns true for empty status with past deadline", () => {
      const result = arePicksRevealed({
        status: "",
        deadline: new Date("2026-09-10T11:00:00Z"),
      });
      expect(result).toBe(true);
    });
  });
});

describe("complementary behavior of arePicksStillOpen and arePicksRevealed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("at boundary (exactly now), arePicksStillOpen is false and arePicksRevealed is true", () => {
    const round = {
      status: "open",
      deadline: new Date("2026-09-10T12:00:00Z"),
    };
    expect(arePicksStillOpen(round)).toBe(false);
    expect(arePicksRevealed(round)).toBe(true);
    // Verify they are not both true and not both false
    expect(
      arePicksStillOpen(round) === arePicksRevealed(round)
    ).toBe(false);
  });

  it("when open with future deadline, arePicksStillOpen is true and arePicksRevealed is false", () => {
    const round = {
      status: "open",
      deadline: new Date("2026-09-10T13:00:00Z"),
    };
    expect(arePicksStillOpen(round)).toBe(true);
    expect(arePicksRevealed(round)).toBe(false);
  });

  it("when locked, both return consistent results regardless of deadline", () => {
    const round = {
      status: "locked",
      deadline: new Date("2026-09-10T13:00:00Z"),
    };
    expect(arePicksStillOpen(round)).toBe(false);
    expect(arePicksRevealed(round)).toBe(true);
  });
});
