export interface RadarPoint {
  x: number;
  y: number;
}

/**
 * Point on spoke `index` of `count` spokes. Spoke 0 points straight up (12 o'clock),
 * subsequent spokes go clockwise, evenly spaced (angle = -90° + index * 360°/count).
 * Distance from centre = radius * clamp(value, 0, max) / max. If max <= 0, returns the centre.
 */
export function radarPoint(
  index: number,
  count: number,
  value: number,
  max: number,
  radius: number,
  cx: number,
  cy: number
): RadarPoint {
  if (max <= 0) {
    return { x: cx, y: cy };
  }

  // Clamp value between 0 and max
  const clampedValue = Math.max(0, Math.min(value, max));
  // Distance from center
  const distance = (radius * clampedValue) / max;

  // Angle in degrees: -90 + index * 360/count
  // Convert to radians: angle * Math.PI / 180
  const angleDegrees = -90 + (index * 360) / count;
  const angleRadians = (angleDegrees * Math.PI) / 180;

  // In SVG, y grows downward, and we're starting at 12 o'clock (-90 degrees)
  const x = cx + distance * Math.cos(angleRadians);
  const y = cy + distance * Math.sin(angleRadians);

  return { x, y };
}

/**
 * radarPoint for each value (index = array position, count = values.length).
 */
export function radarPolygon(
  values: number[],
  max: number,
  radius: number,
  cx: number,
  cy: number
): RadarPoint[] {
  return values.map((value, index) =>
    radarPoint(index, values.length, value, max, radius, cx, cy)
  );
}

/**
 * SVG `points` attribute string: "x,y x,y ...", each coordinate rounded to at most 2 decimals
 * (use Number(n.toFixed(2)) so 50 prints as "50", not "50.00"; normalise -0 to 0).
 * Empty array -> "".
 */
export function toSvgPoints(points: RadarPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point) => {
      // Round to 2 decimals and convert back to number to remove trailing zeros
      let x = Number(point.x.toFixed(2));
      let y = Number(point.y.toFixed(2));

      // Normalize -0 to 0
      x = x === 0 ? 0 : x;
      y = y === 0 ? 0 : y;

      return `${x},${y}`;
    })
    .join(" ");
}
