import { describe, it, expect } from "vitest";
import {
  parseSystemCode,
  getSystem,
  SYSTEMS,
  COUPON_SIZE,
  type SystemDefinition,
} from "./coupon-systems";

describe("SYSTEMS catalogue", () => {
  it("has exactly 13 systems", () => {
    expect(SYSTEMS.length).toBe(13);
  });

  it("has no duplicate codes", () => {
    const codes = SYSTEMS.map((s) => s.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(13);
  });

  it("every system satisfies full + half + single === 13", () => {
    for (const system of SYSTEMS) {
      expect(system.full + system.half + system.single).toBe(COUPON_SIZE);
    }
  });

  it("every system has single >= 0", () => {
    for (const system of SYSTEMS) {
      expect(system.single).toBeGreaterThanOrEqual(0);
    }
  });

  it("M0-7-128 is a complete system with rows === 2^7", () => {
    const system = getSystem("M0-7-128");
    expect(system).toBeDefined();
    expect(system!.rows).toBe(Math.pow(2, 7));
  });

  it("R0-13-128 has single === 0", () => {
    const system = getSystem("R0-13-128");
    expect(system).toBeDefined();
    expect(system!.single).toBe(0);
  });

  it("all U-systems require a base row", () => {
    const uSystems = SYSTEMS.filter((s) => s.type === "U");
    expect(uSystems.length).toBe(6);
    expect(uSystems.every((s) => s.requiresBaseRow)).toBe(true);
  });

  it("all non-U systems do not require a base row", () => {
    const nonUSystems = SYSTEMS.filter((s) => s.type !== "U");
    expect(nonUSystems.every((s) => !s.requiresBaseRow)).toBe(true);
  });
});

describe("parseSystemCode", () => {
  describe("valid codes of each type", () => {
    it("parses R-type code correctly", () => {
      const system = parseSystemCode("R5-5-108");
      expect(system.type).toBe("R");
      expect(system.full).toBe(5);
      expect(system.half).toBe(5);
      expect(system.single).toBe(3);
      expect(system.rows).toBe(108);
      expect(system.code).toBe("R5-5-108");
      expect(system.requiresBaseRow).toBe(false);
    });

    it("parses U-type code correctly", () => {
      const system = parseSystemCode("U8-3-100");
      expect(system.type).toBe("U");
      expect(system.full).toBe(8);
      expect(system.half).toBe(3);
      expect(system.single).toBe(2);
      expect(system.rows).toBe(100);
      expect(system.code).toBe("U8-3-100");
      expect(system.requiresBaseRow).toBe(true);
    });

    it("parses M-type code correctly", () => {
      const system = parseSystemCode("M0-7-128");
      expect(system.type).toBe("M");
      expect(system.full).toBe(0);
      expect(system.half).toBe(7);
      expect(system.single).toBe(6);
      expect(system.rows).toBe(128);
      expect(system.code).toBe("M0-7-128");
      expect(system.requiresBaseRow).toBe(false);
    });
  });

  describe("error cases", () => {
    it("throws on garbage input", () => {
      expect(() => parseSystemCode("not-a-code")).toThrow();
    });

    it("throws on unknown letter", () => {
      expect(() => parseSystemCode("X3-4-100")).toThrow();
    });

    it("throws when full + half > 13", () => {
      expect(() => parseSystemCode("R9-9-100")).toThrow();
    });

    it("throws on malformed format with wrong separator", () => {
      expect(() => parseSystemCode("R5:5-100")).toThrow();
    });

    it("throws on missing parts", () => {
      expect(() => parseSystemCode("R5-5")).toThrow();
    });

    it("throws on non-numeric values", () => {
      expect(() => parseSystemCode("Rabc-def-ghi")).toThrow();
    });
  });
});

describe("getSystem", () => {
  it("returns the system for a known code", () => {
    const system = getSystem("U8-3-100");
    expect(system).toBeDefined();
    expect(system!.type).toBe("U");
    expect(system!.full).toBe(8);
  });

  it("returns undefined for an unknown code", () => {
    const system = getSystem("Z1-1-1");
    expect(system).toBeUndefined();
  });

  it("is case-sensitive", () => {
    const system = getSystem("u8-3-100");
    expect(system).toBeUndefined();
  });
});
