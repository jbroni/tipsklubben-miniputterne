import type { RoundScore } from "@/lib/round-scores";
import { radarPoint, radarPolygon, toSvgPoints } from "@/lib/radar";

interface CorrectPicksRadarProps {
  scores: RoundScore[];
  maxPoints: number;
  currentUserId: string;
  kicker?: string;
}

export function CorrectPicksRadar({
  scores,
  maxPoints,
  currentUserId,
  kicker,
}: CorrectPicksRadarProps) {
  // Render null if fewer than 3 players or maxPoints <= 0
  if (scores.length < 3 || maxPoints <= 0) {
    return null;
  }

  // Geometry constants for proper label spacing
  const radius = 78;
  const labelRadius = 98;
  const sidePad = 82;
  const vPad = 32;
  const svgWidth = 2 * (labelRadius + sidePad); // 360
  const svgHeight = 2 * (labelRadius + vPad); // 260
  const cx = svgWidth / 2;
  const cy = svgHeight / 2;

  // Denser webs get smaller, shorter labels so neighbours don't collide
  const dense = scores.length > 8;
  const fontSize = dense ? 11 : 13;
  const maxNameChars = scores.length > 12 ? 5 : dense ? 6 : 8;
  const lineGap = 15;
  // Label block extent relative to the name baseline
  const blockTop = -0.73 * fontSize;
  const blockBottom = lineGap + 0.22 * fontSize;
  const blockHeight = blockBottom - blockTop;

  // Get the points for each player
  const dataPoints = radarPolygon(
    scores.map((s) => s.points),
    maxPoints,
    radius,
    cx,
    cy
  );

  // Grid lines: 4 concentric polygons at 25%, 50%, 75%, 100%
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const gridPolygons = gridLevels.map((level) =>
    toSvgPoints(
      radarPolygon(
        scores.map(() => maxPoints * level),
        maxPoints,
        radius,
        cx,
        cy
      )
    )
  );

  // Spoke lines from center to outer ring
  const spokeLines = scores.map((_, index) => {
    const outerPoint = radarPoint(
      index,
      scores.length,
      maxPoints,
      maxPoints,
      radius,
      cx,
      cy
    );
    return { x1: cx, y1: cy, x2: outerPoint.x, y2: outerPoint.y };
  });

  // Create aria-label summarizing the data with scale
  const ariaLabel = `Rigtige kampe pr. spiller (ud af ${maxPoints}): ${scores
    .map((s) => `${s.user.displayName} ${s.points}`)
    .join(", ")}`;

  // Truncate long names
  const truncateName = (name: string, maxChars: number) => {
    return name.length > maxChars ? name.slice(0, maxChars) + "…" : name;
  };

  // Vertex dot order: current user last so it's never hidden
  const dotOrder = scores
    .map((_, i) => i)
    .sort((a, b) => Number(scores[a].user.id === currentUserId) - Number(scores[b].user.id === currentUserId));

  return (
    <>
      {kicker && <div className="kicker mb-2.5">{kicker}</div>}
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width="100%"
        className="block mx-auto"
        role="img"
        aria-label={ariaLabel}
        style={{ maxWidth: "360px" }}
      >
        {/* Grid polygons - 25%, 50%, 75%, 100% */}
        {gridPolygons.map((points, idx) => (
          <polygon
            key={`grid-${idx}`}
            points={points}
            fill="none"
            stroke="var(--color-line-divider)"
            strokeWidth="1"
          />
        ))}

        {/* Spoke lines from center to outer ring */}
        {spokeLines.map((spoke, idx) => (
          <line
            key={`spoke-${idx}`}
            x1={spoke.x1}
            y1={spoke.y1}
            x2={spoke.x2}
            y2={spoke.y2}
            stroke="var(--color-line-divider)"
            strokeWidth="1"
          />
        ))}

        {/* Data polygon */}
        <polygon
          points={toSvgPoints(dataPoints)}
          fill="var(--color-brand)"
          fillOpacity="0.15"
          stroke="var(--color-brand)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Vertex dots; current user last so it's never hidden */}
        {dotOrder.map((idx) => {
          const point = dataPoints[idx];
          const score = scores[idx];
          const isCurrentUser = score.user.id === currentUserId;
          return (
            <g key={score.user.id}>
              <title>{`${score.user.displayName}: ${score.points} rigtige`}</title>
              <circle
                cx={point.x}
                cy={point.y}
                r={isCurrentUser ? 5 : 4}
                fill="var(--color-brand)"
                stroke="var(--color-surface)"
                strokeWidth="2"
                paintOrder="stroke"
              />
            </g>
          );
        })}

        {/* Labels at spoke tips */}
        {scores.map((score, idx) => {
          const isCurrentUser = score.user.id === currentUserId;
          const outerPoint = radarPoint(
            idx,
            scores.length,
            maxPoints,
            maxPoints,
            labelRadius, // Use labelRadius constant
            cx,
            cy
          );

          const cos = (outerPoint.x - cx) / labelRadius;
          const sin = (outerPoint.y - cy) / labelRadius;
          const textAnchor = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
          // Push the two-line block outward along the spoke so its inner edge sits at the tip
          const nameY = outerPoint.y + (sin * blockHeight) / 2 - (blockTop + blockBottom) / 2;

          return (
            <g key={score.user.id}>
              {/* Name, with the count on the line below */}
              <text
                x={outerPoint.x}
                y={nameY}
                textAnchor={textAnchor}
                fontSize={fontSize}
                className={isCurrentUser ? "fill-brand-text font-bold" : "fill-ink font-medium"}
              >
                {truncateName(score.user.displayName, maxNameChars)}
              </text>
              {/* Point count - bold mono */}
              <text
                x={outerPoint.x}
                y={nameY + lineGap}
                textAnchor={textAnchor}
                fontSize={fontSize}
                className="fill-ink font-mono font-bold"
              >
                {score.points}
              </text>
            </g>
          );
        })}
      </svg>
    </>
  );
}
