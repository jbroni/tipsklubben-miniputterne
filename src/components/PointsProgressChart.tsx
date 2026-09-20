import type { LeaderboardEntry } from "@/types";

interface PointsProgressChartProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
}

// Minimum rounds needed to render the chart (requires progression over time)
export const POINTS_PROGRESS_MIN_ROUNDS = 2;

// Categorical palette: primary brand colors + extended palette for more players
// Validated for >= 8 entries on surface #fffdf8; dark variants for dark mode
const SERIES_COLORS = [
  "#17703c", // brand green
  "#c23a2c", // signal red
  "#3a6ea5", // info blue
  "#b07c15", // gold
  "#d0598b", // magenta
  "#6b5b95", // violet
  "#2d8b9a", // teal
  "#97633a", // copper
];

// Pure geometry function: compute cumulative series from entries
export function buildSeries(entries: LeaderboardEntry[]) {
  const series = entries.map((entry, idx) => {
    let cumulativeTotal = 0;
    const cumulativePoints = entry.roundScores.map((round) => {
      cumulativeTotal += round.points;
      return {
        roundNumber: round.roundNumber,
        cumulative: cumulativeTotal,
        played: round.played,
      };
    });

    return {
      userId: entry.user.id,
      displayName: entry.user.displayName,
      firstName: entry.user.displayName.split(" ")[0],
      totalPoints: entry.totalPoints,
      points: cumulativePoints,
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
    };
  });

  // Calculate domain
  const maxRound = Math.max(...entries.flatMap((e) => e.roundScores.map((r) => r.roundNumber)), 0);
  const maxPoints = Math.max(...series.map((s) => s.totalPoints), 0);

  return { series, domain: { maxRound, maxPoints } };
}

export function PointsProgressChart({ entries, currentUserId }: PointsProgressChartProps) {
  // Return null if not enough data for a meaningful progression chart
  if (entries.length === 0 || entries[0].roundScores.length < POINTS_PROGRESS_MIN_ROUNDS) {
    return null;
  }

  const { series, domain } = buildSeries(entries);

  // SVG dimensions and padding (smaller viewBox for better mobile scaling)
  const width = 400;
  const height = 150;
  const padding = { top: 6, right: 8, bottom: 16, left: 20 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Scale functions - guard against division by zero (domain=0 when all points are 0)
  const scaleX = (roundNum: number) =>
    padding.left + (roundNum / (domain.maxRound || 1)) * plotWidth;
  const scaleY = (points: number) =>
    height - padding.bottom - (points / (domain.maxPoints || 1)) * plotHeight;

  // Grid lines and y-axis labels
  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => ({
    value: (domain.maxPoints / gridCount) * i,
    y: scaleY((domain.maxPoints / gridCount) * i),
  }));

  // X-axis labels (thin if many rounds; start at R1, not R0 baseline)
  const xLabelStep = domain.maxRound > 10 ? 2 : 1;
  const xLabels = Array.from({ length: domain.maxRound }, (_, i) => i + 1).filter(
    (i) => i % xLabelStep === 0
  );

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible"
      >
        {/* Horizontal gridlines */}
        {gridLines.map((line, idx) => (
          <g key={`gridline-${idx}`}>
            <line
              x1={padding.left}
              y1={line.y}
              x2={width - padding.right}
              y2={line.y}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              className="stroke-line-divider"
            />
            {/* Y-axis label */}
            <text
              x={padding.left - 8}
              y={line.y + 3}
              textAnchor="end"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              className="font-mono text-[10px] fill-muted"
            >
              {Math.round(line.value)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map((round) => (
          <text
            key={`xlabel-${round}`}
            x={scaleX(round)}
            y={height - 10}
            textAnchor="middle"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
            className="font-mono text-[10px] fill-muted"
          >
            R{round}
          </text>
        ))}

        {/* Data lines */}
        {series.map((s) => {
          const isCurrent = s.userId === currentUserId;
          const points = [
            { roundNumber: 0, cumulative: 0, played: true },
            ...s.points,
          ];

          // Build path
          const pathData = points
            .map(
              (p, idx) =>
                `${idx === 0 ? "M" : "L"} ${scaleX(p.roundNumber)} ${scaleY(p.cumulative)}`
            )
            .join(" ");

          return (
            <path
              key={`line-${s.userId}`}
              d={pathData}
              fill="none"
              stroke={s.color}
              strokeWidth={isCurrent ? 3 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity={0.9}
            />
          );
        })}

        {/* Current y-axis axis line */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          className="stroke-muted"
        />

        {/* Bottom axis line */}
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          className="stroke-muted"
        />
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center mt-4">
        {series.map((s) => (
          <div key={`legend-${s.userId}`} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-[12.5px] text-ink">{s.firstName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
