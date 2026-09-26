import { describe, it, expect } from "vitest";
import { radarPoint, radarPolygon, toSvgPoints, RadarPoint } from "@/lib/radar";

describe("radarPoint", () => {
  describe("4 spokes at cardinal directions", () => {
    const radius = 100;
    const cx = 0;
    const cy = 0;
    const max = 100;

    it("spoke 0 points straight up when value equals max", () => {
      const point = radarPoint(0, 4, 100, max, radius, cx, cy);
      // Spoke 0 at -90°: up = (cx, cy - radius)
      expect(point.x).toBeCloseTo(0, 2);
      expect(point.y).toBeCloseTo(-100, 2);
    });

    it("spoke 1 points right when value equals max", () => {
      const point = radarPoint(1, 4, 100, max, radius, cx, cy);
      // Spoke 1 at -90° + 90° = 0°: right = (cx + radius, cy)
      expect(point.x).toBeCloseTo(100, 2);
      expect(point.y).toBeCloseTo(0, 2);
    });

    it("spoke 2 points down when value equals max", () => {
      const point = radarPoint(2, 4, 100, max, radius, cx, cy);
      // Spoke 2 at -90° + 180° = 90°: down = (cx, cy + radius)
      expect(point.x).toBeCloseTo(0, 2);
      expect(point.y).toBeCloseTo(100, 2);
    });

    it("spoke 3 points left when value equals max", () => {
      const point = radarPoint(3, 4, 100, max, radius, cx, cy);
      // Spoke 3 at -90° + 270° = 180°: left = (cx - radius, cy)
      expect(point.x).toBeCloseTo(-100, 2);
      expect(point.y).toBeCloseTo(0, 2);
    });
  });

  describe("value scaling", () => {
    const radius = 100;
    const cx = 50;
    const cy = 50;
    const max = 100;

    it("half value gives half distance from centre", () => {
      const point = radarPoint(0, 4, 50, max, radius, cx, cy);
      // Spoke 0, half max: up at half distance
      expect(point.x).toBeCloseTo(50, 2);
      expect(point.y).toBeCloseTo(0, 2);
    });

    it("zero value returns centre point", () => {
      const point = radarPoint(0, 4, 0, max, radius, cx, cy);
      expect(point.x).toBeCloseTo(50, 2);
      expect(point.y).toBeCloseTo(50, 2);
    });

    it("value larger than max is clamped to max", () => {
      const pointAtMax = radarPoint(1, 4, 100, max, radius, cx, cy);
      const pointOverMax = radarPoint(1, 4, 150, max, radius, cx, cy);
      expect(pointOverMax.x).toBeCloseTo(pointAtMax.x, 2);
      expect(pointOverMax.y).toBeCloseTo(pointAtMax.y, 2);
    });

    it("negative value is clamped to centre", () => {
      const point = radarPoint(1, 4, -50, max, radius, cx, cy);
      expect(point.x).toBeCloseTo(50, 2);
      expect(point.y).toBeCloseTo(50, 2);
    });
  });

  describe("edge case: max <= 0", () => {
    const radius = 100;
    const cx = 75;
    const cy = 75;

    it("max = 0 returns centre point", () => {
      const point = radarPoint(0, 4, 100, 0, radius, cx, cy);
      expect(point.x).toBeCloseTo(75, 2);
      expect(point.y).toBeCloseTo(75, 2);
    });

    it("negative max returns centre point", () => {
      const point = radarPoint(1, 4, 50, -10, radius, cx, cy);
      expect(point.x).toBeCloseTo(75, 2);
      expect(point.y).toBeCloseTo(75, 2);
    });
  });

  describe("non-square spoke counts", () => {
    const radius = 100;
    const cx = 0;
    const cy = 0;
    const max = 100;

    it("3 spokes: all full-value points at distance radius from centre", () => {
      for (let i = 0; i < 3; i++) {
        const point = radarPoint(i, 3, 100, max, radius, cx, cy);
        const distance = Math.sqrt(point.x ** 2 + point.y ** 2);
        expect(distance).toBeCloseTo(100, 1);
      }
    });

    it("3 spokes: spoke 0 points straight up", () => {
      const point = radarPoint(0, 3, 100, max, radius, cx, cy);
      expect(point.x).toBeCloseTo(0, 2);
      expect(point.y).toBeCloseTo(-100, 2);
    });

    it("13 spokes: spoke 0 points straight up and all full-value points at distance radius", () => {
      // Verify spoke 0 points up
      const spoke0 = radarPoint(0, 13, 100, max, radius, cx, cy);
      expect(spoke0.x).toBeCloseTo(0, 2);
      expect(spoke0.y).toBeCloseTo(-100, 2);

      // Verify all full-value points at distance radius
      for (let i = 0; i < 13; i++) {
        const point = radarPoint(i, 13, 100, max, radius, cx, cy);
        const distance = Math.sqrt(point.x ** 2 + point.y ** 2);
        expect(distance).toBeCloseTo(100, 1);
      }
    });
  });

  describe("arbitrary centre and radius", () => {
    it("respects custom centre (cx, cy)", () => {
      const cx = 200;
      const cy = 300;
      const radius = 50;
      const point = radarPoint(0, 4, 100, 100, radius, cx, cy);
      // Spoke 0 straight up
      expect(point.x).toBeCloseTo(200, 2);
      expect(point.y).toBeCloseTo(250, 2);
    });

    it("respects custom radius", () => {
      const radius = 250;
      const point = radarPoint(1, 4, 100, 100, radius, 0, 0);
      // Spoke 1 to the right
      expect(point.x).toBeCloseTo(250, 2);
      expect(point.y).toBeCloseTo(0, 2);
    });
  });
});

describe("radarPolygon", () => {
  it("returns array of same length as values", () => {
    const values = [50, 75, 100, 25, 0];
    const polygon = radarPolygon(values, 100, 100, 0, 0);
    expect(polygon).toHaveLength(5);
  });

  it("returns empty array for empty values", () => {
    const polygon = radarPolygon([], 100, 100, 0, 0);
    expect(polygon).toHaveLength(0);
  });

  it("each point equals radarPoint for corresponding index", () => {
    const values = [50, 75, 100, 25];
    const max = 100;
    const radius = 100;
    const cx = 50;
    const cy = 50;
    const polygon = radarPolygon(values, max, radius, cx, cy);

    for (let i = 0; i < values.length; i++) {
      const expected = radarPoint(i, values.length, values[i], max, radius, cx, cy);
      expect(polygon[i].x).toBeCloseTo(expected.x, 2);
      expect(polygon[i].y).toBeCloseTo(expected.y, 2);
    }
  });

  it("creates polygon with all points at max distance when all values equal max", () => {
    const values = [100, 100, 100, 100];
    const polygon = radarPolygon(values, 100, 100, 0, 0);

    for (const point of polygon) {
      const distance = Math.sqrt(point.x ** 2 + point.y ** 2);
      expect(distance).toBeCloseTo(100, 1);
    }
  });

  it("creates polygon with all points at centre when all values are zero", () => {
    const values = [0, 0, 0, 0];
    const polygon = radarPolygon(values, 100, 100, 75, 75);

    for (const point of polygon) {
      expect(point.x).toBeCloseTo(75, 2);
      expect(point.y).toBeCloseTo(75, 2);
    }
  });
});

describe("toSvgPoints", () => {
  describe("formatting", () => {
    it("converts points to SVG points string format", () => {
      const points: RadarPoint[] = [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ];
      const result = toSvgPoints(points);
      expect(result).toBe("10,20 30,40");
    });

    it("handles single point", () => {
      const points: RadarPoint[] = [{ x: 100, y: 200 }];
      const result = toSvgPoints(points);
      expect(result).toBe("100,200");
    });

    it("returns empty string for empty array", () => {
      const points: RadarPoint[] = [];
      const result = toSvgPoints(points);
      expect(result).toBe("");
    });
  });

  describe("decimal rounding", () => {
    it("rounds to 2 decimals max using toFixed(2)", () => {
      const points: RadarPoint[] = [
        { x: 10.555, y: 20.444 },
        { x: 30.126, y: 40.125 },
      ];
      const result = toSvgPoints(points);
      // 10.555 in binary FP is slightly less, so toFixed rounds to "10.55"
      // 20.444 -> "20.44"
      // 30.126 -> "30.13"
      // 40.125 in binary FP rounds to "40.13"
      expect(result).toBe("10.55,20.44 30.13,40.13");
    });

    it("removes trailing zeros after decimal point", () => {
      const points: RadarPoint[] = [
        { x: 10.5, y: 20 },
        { x: 30.1, y: 40.0 },
      ];
      const result = toSvgPoints(points);
      // 10.5 -> "10.50" -> Number() -> 10.5
      // 20 -> "20.00" -> Number() -> 20
      // 30.1 -> "30.10" -> Number() -> 30.1
      // 40.0 -> "40.00" -> Number() -> 40
      expect(result).toBe("10.5,20 30.1,40");
    });

    it("removes decimal point if no fractional part", () => {
      const points: RadarPoint[] = [
        { x: 50, y: 60 },
      ];
      const result = toSvgPoints(points);
      expect(result).toBe("50,60");
    });
  });

  describe("edge case: negative zero", () => {
    it("normalizes -0 to 0", () => {
      const points: RadarPoint[] = [
        { x: -0, y: 0 },
        { x: 10, y: -0 },
      ];
      const result = toSvgPoints(points);
      expect(result).toBe("0,0 10,0");
    });
  });

  describe("integration with radarPolygon", () => {
    it("converts radar polygon to valid SVG points string", () => {
      const values = [50, 100, 75, 25];
      const polygon = radarPolygon(values, 100, 100, 0, 0);
      const svgPoints = toSvgPoints(polygon);

      // Should have 4 comma-separated coordinate pairs
      expect(svgPoints).toMatch(/^[\d\.\-]+,[\d\.\-]+ [\d\.\-]+,[\d\.\-]+ [\d\.\-]+,[\d\.\-]+ [\d\.\-]+,[\d\.\-]+$/);
    });

    it("produces exact coordinates at non-cardinal angles", () => {
      // 3 spokes at -90°, 30°, 150° with radius 100, all values at max
      // Spoke 0 at -90°: (0, -100)
      // Spoke 1 at 30°: (100*cos(30°), 100*sin(30°)) = (86.6, 50)
      // Spoke 2 at 150°: (100*cos(150°), 100*sin(150°)) = (-86.6, 50)
      const result = toSvgPoints(radarPolygon([3, 3, 3], 3, 100, 0, 0));
      expect(result).toBe("0,-100 86.6,50 -86.6,50");
    });
  });

  describe("complex values", () => {
    it("handles very small numbers", () => {
      const points: RadarPoint[] = [
        { x: 0.001, y: 0.002 },
      ];
      const result = toSvgPoints(points);
      // 0.001 -> "0.00" -> 0
      // 0.002 -> "0.00" -> 0
      expect(result).toBe("0,0");
    });

    it("handles negative numbers", () => {
      const points: RadarPoint[] = [
        { x: -50.555, y: -25.125 },
      ];
      const result = toSvgPoints(points);
      // -50.555 in binary FP is slightly more negative, so toFixed rounds to "-50.55"
      // -25.125 in binary FP rounds to "-25.13"
      expect(result).toBe("-50.55,-25.13");
    });
  });
});

describe("geometry sanity checks", () => {
  it("scales proportionally with radius", () => {
    const values = [100, 100, 100, 100];
    const polygon1 = radarPolygon(values, 100, 50, 100, 100);
    const polygon2 = radarPolygon(values, 100, 100, 100, 100);

    // Compare distances from centre (avoids division by zero)
    for (let i = 0; i < 4; i++) {
      const dist1 = Math.sqrt((polygon1[i].x - 100) ** 2 + (polygon1[i].y - 100) ** 2);
      const dist2 = Math.sqrt((polygon2[i].x - 100) ** 2 + (polygon2[i].y - 100) ** 2);
      expect(dist2 / dist1).toBeCloseTo(2, 0);
    }
  });

  it("translates correctly with custom centre", () => {
    const values = [100, 100, 100, 100];
    const polygon1 = radarPolygon(values, 100, 100, 0, 0);
    const polygon2 = radarPolygon(values, 100, 100, 50, 50);

    for (let i = 0; i < 4; i++) {
      expect(polygon2[i].x - polygon1[i].x).toBeCloseTo(50, 2);
      expect(polygon2[i].y - polygon1[i].y).toBeCloseTo(50, 2);
    }
  });
});
