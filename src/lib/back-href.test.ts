import { describe, it, expect } from "vitest";
import { resolveRoundBackHref } from "./back-href";

describe("resolveRoundBackHref", () => {
  describe("explicit from='hjem' hint", () => {
    it("returns '/' when from='hjem' and season is active", () => {
      const result = resolveRoundBackHref("hjem", "season-1", true);
      expect(result).toBe("/");
    });

    it("returns '/' when from='hjem' and season is inactive", () => {
      const result = resolveRoundBackHref("hjem", "season-1", false);
      expect(result).toBe("/");
    });
  });

  describe("explicit from='historik' hint", () => {
    it("returns '/historik/{seasonId}' when from='historik' and season is active", () => {
      const result = resolveRoundBackHref("historik", "season-42", true);
      expect(result).toBe("/historik/season-42");
    });

    it("returns '/historik/{seasonId}' when from='historik' and season is inactive", () => {
      const result = resolveRoundBackHref("historik", "season-42", false);
      expect(result).toBe("/historik/season-42");
    });
  });

  describe("from undefined with season status", () => {
    it("returns '/rounds' when from is undefined and season is active", () => {
      const result = resolveRoundBackHref(undefined, "season-1", true);
      expect(result).toBe("/rounds");
    });

    it("returns '/historik/{seasonId}' when from is undefined and season is inactive", () => {
      const result = resolveRoundBackHref(undefined, "season-1", false);
      expect(result).toBe("/historik/season-1");
    });
  });

  describe("unrecognized from values", () => {
    it("falls through to season-based logic when from='bogus' and season is active", () => {
      const result = resolveRoundBackHref("bogus", "season-99", true);
      expect(result).toBe("/rounds");
    });

    it("falls through to season-based logic when from='bogus' and season is inactive", () => {
      const result = resolveRoundBackHref("bogus", "season-99", false);
      expect(result).toBe("/historik/season-99");
    });

    it("falls through to season-based logic for other unrecognized strings", () => {
      const result = resolveRoundBackHref("random", "season-5", true);
      expect(result).toBe("/rounds");
    });

    it("falls through to season-based logic for unrecognized strings when season is inactive", () => {
      const result = resolveRoundBackHref("unknown", "season-5", false);
      expect(result).toBe("/historik/season-5");
    });
  });

  describe("array from values (duplicated query params)", () => {
    it("falls through to season-based logic when from is array and season is active", () => {
      const result = resolveRoundBackHref(["historik", "hjem"], "season-1", true);
      expect(result).toBe("/rounds");
    });

    it("falls through to season-based logic when from is array and season is inactive", () => {
      const result = resolveRoundBackHref(["historik", "hjem"], "season-1", false);
      expect(result).toBe("/historik/season-1");
    });

    it("falls through to season-based logic for array with single element", () => {
      const result = resolveRoundBackHref(["hjem"], "season-2", true);
      expect(result).toBe("/rounds");
    });

    it("falls through to season-based logic for empty array", () => {
      const result = resolveRoundBackHref([], "season-3", true);
      expect(result).toBe("/rounds");
    });
  });

  describe("empty string from value", () => {
    it("falls through to season-based logic when from='' and season is active", () => {
      const result = resolveRoundBackHref("", "season-1", true);
      expect(result).toBe("/rounds");
    });

    it("falls through to season-based logic when from='' and season is inactive", () => {
      const result = resolveRoundBackHref("", "season-1", false);
      expect(result).toBe("/historik/season-1");
    });
  });

  describe("precedence and edge cases", () => {
    it("prioritizes from='hjem' over season status", () => {
      const result = resolveRoundBackHref("hjem", "season-1", false);
      expect(result).toBe("/");
    });

    it("prioritizes from='historik' over active season", () => {
      const result = resolveRoundBackHref("historik", "season-1", true);
      expect(result).toBe("/historik/season-1");
    });

    it("handles different seasonId formats correctly", () => {
      expect(resolveRoundBackHref(undefined, "uuid-123-456", true)).toBe("/rounds");
      expect(resolveRoundBackHref(undefined, "season-2024-01", false)).toBe(
        "/historik/season-2024-01"
      );
      expect(resolveRoundBackHref("historik", "prod-season", true)).toBe("/historik/prod-season");
    });

    it("case-sensitive matching for from hints", () => {
      // "HJEM" doesn't match "hjem" literally, so falls through to season-based logic
      // Season is inactive, so returns historik href
      expect(resolveRoundBackHref("HJEM", "season-1", false)).toBe("/historik/season-1");
      // "Historik" doesn't match "historik" literally, so falls through to season-based logic
      // Season is active, so returns /rounds
      expect(resolveRoundBackHref("Historik", "season-1", true)).toBe("/rounds");
    });
  });
});
