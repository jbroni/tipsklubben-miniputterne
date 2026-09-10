import { describe, it, expect } from "vitest";
import { getLayoutWidthClass } from "./layout-width";

describe("getLayoutWidthClass", () => {
  describe("builder route", () => {
    it("returns the wide class for the group-coupon builder route", () => {
      const result = getLayoutWidthClass("/admin/rounds/1/group-coupon");
      expect(result).toBe("max-w-[1360px]");
    });

    it("returns the wide class for builder route with any numeric id", () => {
      const result = getLayoutWidthClass("/admin/rounds/123/group-coupon");
      expect(result).toBe("max-w-[1360px]");
    });

    it("returns the wide class for builder route with alphanumeric id", () => {
      const result = getLayoutWidthClass("/admin/rounds/abc-123/group-coupon");
      expect(result).toBe("max-w-[1360px]");
    });
  });

  describe("admin routes without group-coupon suffix", () => {
    it("returns the default class for /admin/rounds/:id without group-coupon suffix", () => {
      const result = getLayoutWidthClass("/admin/rounds/1");
      expect(result).toBe("max-w-4xl");
    });

    it("returns the default class for /admin/rounds without id", () => {
      const result = getLayoutWidthClass("/admin/rounds");
      expect(result).toBe("max-w-4xl");
    });

    it("returns the default class for /admin", () => {
      const result = getLayoutWidthClass("/admin");
      expect(result).toBe("max-w-4xl");
    });
  });

  describe("other routes", () => {
    it("returns the default class for /rounds", () => {
      const result = getLayoutWidthClass("/rounds");
      expect(result).toBe("max-w-4xl");
    });

    it("returns the default class for /leaderboard", () => {
      const result = getLayoutWidthClass("/leaderboard");
      expect(result).toBe("max-w-4xl");
    });

    it("returns the default class for /fedt", () => {
      const result = getLayoutWidthClass("/fedt");
      expect(result).toBe("max-w-4xl");
    });

    it("returns the default class for /profile", () => {
      const result = getLayoutWidthClass("/profile");
      expect(result).toBe("max-w-4xl");
    });

    it("returns the default class for /", () => {
      const result = getLayoutWidthClass("/");
      expect(result).toBe("max-w-4xl");
    });
  });

  describe("defensive handling of null/undefined pathname", () => {
    it("returns the default class for null pathname", () => {
      const result = getLayoutWidthClass(null);
      expect(result).toBe("max-w-4xl");
    });

    it("returns the default class for undefined pathname", () => {
      const result = getLayoutWidthClass(undefined);
      expect(result).toBe("max-w-4xl");
    });

    it("returns the default class for empty string", () => {
      const result = getLayoutWidthClass("");
      expect(result).toBe("max-w-4xl");
    });
  });
});
