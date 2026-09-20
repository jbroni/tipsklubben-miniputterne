"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LeaderboardEntry } from "@/types";
import {
  buildProgress,
  computeYAxis,
  formBarWidth,
  layoutLabels,
  truncateName,
  type LabelInput,
  type PlayerShape,
} from "@/lib/point-progress";

type Mode = "cumulative" | "gap";

// Literal hex values are needed where SVG attributes cannot take Tailwind classes.
const HALO = "#fffdf8"; // surface — marker halo so overlapping shapes stay readable
const GRID = "#efe9d8"; // line-divider
const AXIS_TEXT = "#5d5849"; // ink-tertiary
const CONNECTOR = "#b6ae97"; // muted-faint
const DIM_LINE = "#ddd5c0"; // line-pick
const DIM_MARK = "#96907e"; // muted
const MINUS = "−"; // U+2212 minus sign, not a hyphen

// Chart geometry in px (1:1 coordinate system — no viewBox scaling of text)
const PLOT_LEFT = 34;
// Direct-label column. Budget at width = 360 (plotRight = 244):
// 22 (text offset) + 22.5 (3-digit bold value) + 4 (dx) + 56 (8 chars @ 7px) = 348.5 <= 360.
const RIGHT_GUTTER = 116;
const LABEL_MARKER_OFFSET = 14;
const LABEL_TEXT_OFFSET = 22;
const CHART_LABEL_NAME_CHARS = 8;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 238;
const SVG_HEIGHT = 266;
const LABEL_GAP = 15;
const DEFAULT_WIDTH = 358;
const MIN_X_LABEL_SPACING = 22;

// Standings form sparkline
const FORM_TRACK_WIDTH = 72;
const FORM_TRACK_HEIGHT = 22;
const MAX_ROUND_POINTS = 13;

/** Vertices of a regular polygon, first vertex pointing up. */
function regularPolygon(cx: number, cy: number, r: number, sides: number): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

/** Vertices of a five-pointed star, alternating outer and inner radius. */
function starPolygon(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

interface PlayerMarkerProps {
  shape: PlayerShape;
  cx: number;
  cy: number;
  fill: string;
  /** Bounding box of the glyph in px. */
  size?: number;
}

/** One marker glyph per player shape, each with a surface-coloured halo. */
function PlayerMarker({ shape, cx, cy, fill, size = 9 }: PlayerMarkerProps) {
  const h = size / 2;

  // Stroked glyphs get their halo by drawing a wider pass underneath
  if (shape === "plus" || shape === "cross") {
    const d =
      shape === "plus"
        ? `M${cx - h} ${cy} H${cx + h} M${cx} ${cy - h} V${cy + h}`
        : `M${cx - h * 0.8} ${cy - h * 0.8} L${cx + h * 0.8} ${cy + h * 0.8} M${cx + h * 0.8} ${cy - h * 0.8} L${cx - h * 0.8} ${cy + h * 0.8}`;
    return (
      <g>
        <path d={d} fill="none" stroke={HALO} strokeWidth={5.5} strokeLinecap="round" />
        <path d={d} fill="none" stroke={fill} strokeWidth={2.6} strokeLinecap="round" />
      </g>
    );
  }

  const common = { fill, stroke: HALO, strokeWidth: 1.5 } as const;

  switch (shape) {
    case "circle":
      return <circle cx={cx} cy={cy} r={h} {...common} />;
    case "square":
      return <rect x={cx - h * 0.9} y={cy - h * 0.9} width={h * 1.8} height={h * 1.8} {...common} />;
    case "triangleUp":
      return <polygon points={regularPolygon(cx, cy, h * 1.15, 3)} {...common} />;
    case "triangleDown":
      return (
        <polygon
          points={regularPolygon(cx, cy, h * 1.15, 3)}
          transform={`rotate(180 ${cx} ${cy})`}
          {...common}
        />
      );
    case "diamond":
      return <polygon points={regularPolygon(cx, cy, h * 1.1, 4)} {...common} />;
    case "hexagon":
      return <polygon points={regularPolygon(cx, cy, h * 1.05, 6)} {...common} />;
    case "pentagon":
      return <polygon points={regularPolygon(cx, cy, h * 1.1, 5)} {...common} />;
    case "star":
      return <polygon points={starPolygon(cx, cy, h * 1.2)} {...common} />;
    default:
      return <circle cx={cx} cy={cy} r={h} {...common} />;
  }
}

interface MovementProps {
  movement: number | undefined;
}

/** Rank movement since the previous round — the arrow glyph carries the meaning. */
function Movement({ movement }: MovementProps) {
  if (movement === undefined || movement === 0) {
    return <span className="text-muted-faint text-[11px]">–</span>;
  }
  if (movement > 0) {
    return <span className="text-brand text-[11px] tabular-nums">▲ {movement}</span>;
  }
  return <span className="text-signal text-[11px] tabular-nums">▼ {Math.abs(movement)}</span>;
}

interface PointProgressProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  /** Season length, used only in the subtitle text. */
  totalRounds?: number;
}

export function PointProgress({
  entries,
  currentUserId,
  totalRounds = 12,
}: PointProgressProps) {
  const progress = useMemo(() => buildProgress(entries), [entries]);
  const { series, roundNumbers, roundCount, maxCumulative, maxGap } = progress;

  const [mode, setMode] = useState<Mode>("cumulative");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    currentUserId && progress.series.some((s) => s.userId === currentUserId) ? currentUserId : null
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((observed) => {
      const next = observed[0]?.contentRect.width ?? 0;
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const lastRoundNumber = roundNumbers.length > 0 ? roundNumbers[roundNumbers.length - 1] : 0;

  const header = (
    <div>
      <h2 className="font-display font-semibold text-ink">Pointudvikling</h2>
      <p className="font-body text-xs text-ink-tertiary mt-0.5">
        {mode === "cumulative"
          ? `Samlede rigtige efter runde ${lastRoundNumber} af ${totalRounds}`
          : `Point bag føreren efter runde ${lastRoundNumber} af ${totalRounds}`}
      </p>
    </div>
  );

  if (roundCount === 0 || series.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <p className="font-body text-sm text-ink-tertiary py-6 text-center">
          Ingen runder spillet endnu
        </p>
      </div>
    );
  }

  const plotRight = Math.max(PLOT_LEFT + 20, width - RIGHT_GUTTER);
  const plotHeight = PLOT_BOTTOM - PLOT_TOP;
  const axis = computeYAxis(mode === "cumulative" ? maxCumulative : maxGap);

  const xAt = (index: number) => PLOT_LEFT + ((plotRight - PLOT_LEFT) * index) / roundCount;
  // Cumulative grows upward from the bottom; gap grows downward from zero at the top
  const yAt = (value: number) =>
    mode === "cumulative"
      ? PLOT_BOTTOM - (value / axis.yMax) * plotHeight
      : PLOT_TOP + (value / axis.yMax) * plotHeight;

  const geometry = series.map((s) => {
    const values = [0, ...s.points.map((p) => (mode === "cumulative" ? p.cumulative : p.gap))];
    const coords = values.map((value, index) => ({ x: xAt(index), y: yAt(value) }));
    const path = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
      .join(" ");
    return { series: s, coords, path, endY: coords[coords.length - 1].y };
  });

  const labelInputs: LabelInput[] = geometry.map((g) => ({
    id: g.series.userId,
    // Shorter than series.shortName (10) so the label column fits at 360px wide
    name: truncateName(g.series.displayName, CHART_LABEL_NAME_CHARS),
    endY: g.endY,
  }));
  const placements = layoutLabels(labelInputs, LABEL_GAP, PLOT_TOP, PLOT_BOTTOM + 8);
  const byId = new Map(geometry.map((g) => [g.series.userId, g]));

  const xLabelSpacing = (plotRight - PLOT_LEFT) / roundCount;
  const labelEvery = xLabelSpacing < MIN_X_LABEL_SPACING ? 2 : 1;

  const roundWord = roundCount === 1 ? "runde" : "runder";
  const chartLabel =
    mode === "cumulative"
      ? `Pointudvikling efter ${roundCount} ${roundWord}. ${series
          .map((s) => `${s.displayName} ${s.total}`)
          .join(", ")}`
      : `Point bag føreren efter ${roundCount} ${roundWord}. ${series
          .map((s) => (s.gapToLeader === 0 ? `${s.displayName} fører` : `${s.displayName} ${s.gapToLeader} bag`))
          .join(", ")}`;

  const tickLabel = (value: number) =>
    mode === "cumulative" || value === 0 ? `${value}` : `${MINUS}${value}`;

  const barWidth = formBarWidth(roundCount);

  const toggle = (userId: string) =>
    setSelectedId((current) => (current === userId ? null : userId));

  return (
    <div className="space-y-4">
      {header}

      {/* Mode switch */}
      <div className="flex gap-1 rounded-card border border-line-card bg-paper p-1">
        {(
          [
            { value: "cumulative", label: "Samlet" },
            { value: "gap", label: "Bag føreren" },
          ] as const
        ).map((option) => {
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setMode(option.value)}
              className={`flex-1 min-h-[44px] rounded-card-sm px-3 font-body text-sm transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                active
                  ? "bg-surface border border-line-card text-brand font-semibold"
                  : "border border-transparent text-ink-tertiary"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div ref={wrapperRef} className="w-full">
        <svg
          width={width}
          height={SVG_HEIGHT}
          role="img"
          aria-label={chartLabel}
          className="block overflow-visible"
        >
          {/* Gridlines and y-axis ticks */}
          {axis.ticks.map((tick) => {
            const y = yAt(tick);
            return (
              <g key={`tick-${tick}`}>
                <line x1={PLOT_LEFT} y1={y} x2={plotRight} y2={y} stroke={GRID} strokeWidth={1} />
                <text
                  x={PLOT_LEFT - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill={AXIS_TEXT}
                  className="font-body tabular-nums"
                >
                  {tickLabel(tick)}
                </text>
              </g>
            );
          })}

          {/* X-axis round numbers */}
          {roundNumbers.map((roundNumber, i) => {
            const index = i + 1;
            // Anchored to the first round so round 1 is always labelled; the
            // last round is special-cased so it is labelled whatever the parity.
            if ((index - 1) % labelEvery !== 0 && index !== roundCount) return null;
            return (
              <text
                key={`x-${roundNumber}`}
                x={xAt(index)}
                y={PLOT_BOTTOM + 18}
                textAnchor="middle"
                fontSize={11}
                fill={AXIS_TEXT}
                className="font-body tabular-nums"
              >
                {roundNumber}
              </text>
            );
          })}
          <text
            x={4}
            y={PLOT_BOTTOM + 18}
            fontSize={10}
            fill={CONNECTOR}
            className="font-body"
          >
            Rd.
          </text>

          {/* Lines — the selected player is drawn last so it sits on top */}
          {geometry
            .filter((g) => g.series.userId !== selectedId)
            .map((g) => (
              <path
                key={`line-${g.series.userId}`}
                d={g.path}
                fill="none"
                stroke={selectedId ? DIM_LINE : g.series.style.color}
                strokeWidth={selectedId ? 1.5 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="transition-[stroke,opacity] duration-150 motion-reduce:transition-none"
              />
            ))}

          {/* End markers for the non-selected players */}
          {geometry
            .filter((g) => g.series.userId !== selectedId)
            .map((g) => {
              const end = g.coords[g.coords.length - 1];
              return (
                <PlayerMarker
                  key={`end-${g.series.userId}`}
                  shape={g.series.style.shape}
                  cx={end.x}
                  cy={end.y}
                  fill={selectedId ? DIM_MARK : g.series.style.color}
                />
              );
            })}

          {/* Selected player: thicker line plus a marker at every round */}
          {geometry
            .filter((g) => g.series.userId === selectedId)
            .map((g) => (
              <g key={`sel-${g.series.userId}`}>
                <path
                  d={g.path}
                  fill="none"
                  stroke={g.series.style.color}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="transition-[stroke,opacity] duration-150 motion-reduce:transition-none"
                />
                {g.coords.slice(1).map((c, i) => (
                  <PlayerMarker
                    key={`selmark-${i}`}
                    shape={g.series.style.shape}
                    cx={c.x}
                    cy={c.y}
                    fill={g.series.style.color}
                  />
                ))}
              </g>
            ))}

          {/* Direct labels, fanned out vertically by layoutLabels */}
          {placements.map((placement) => {
            const g = byId.get(placement.id);
            if (!g) return null;
            const isSelected = placement.id === selectedId;
            const value =
              mode === "cumulative"
                ? `${g.series.total}`
                : g.series.gapToLeader === 0
                ? "0"
                : `${MINUS}${g.series.gapToLeader}`;
            const textFill = isSelected
              ? g.series.style.color
              : selectedId
              ? AXIS_TEXT
              : "#221f18";
            return (
              <g key={`label-${placement.id}`}>
                <line
                  x1={plotRight + 3}
                  y1={placement.endY}
                  x2={plotRight + 8}
                  y2={placement.labelY}
                  stroke={CONNECTOR}
                  strokeWidth={1}
                />
                <PlayerMarker
                  shape={g.series.style.shape}
                  cx={plotRight + LABEL_MARKER_OFFSET}
                  cy={placement.labelY}
                  fill={selectedId && !isSelected ? DIM_MARK : g.series.style.color}
                />
                <text
                  x={plotRight + LABEL_TEXT_OFFSET}
                  y={placement.labelY}
                  dominantBaseline="middle"
                  fontSize={12}
                  fill={textFill}
                >
                  <tspan className="font-display tabular-nums" fontWeight={700}>
                    {value}
                  </tspan>
                  <tspan className="font-body" dx={4} fontWeight={isSelected ? 700 : 400}>
                    {placement.name}
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Text equivalent of the chart for screen readers */}
      <table className="sr-only">
        <caption>Point per runde for hver spiller</caption>
        <thead>
          <tr>
            <th scope="col">Spiller</th>
            {roundNumbers.map((roundNumber) => (
              <th key={roundNumber} scope="col">{`Runde ${roundNumber}`}</th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.userId}>
              <th scope="row">{s.displayName}</th>
              {s.points.map((point) => (
                <td key={point.roundNumber}>{point.points}</td>
              ))}
              <td>{s.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Standings */}
      <div className="space-y-2">
        <h3 className="font-display font-semibold text-sm text-ink">Stilling</h3>
        <div className="flex flex-col gap-1">
          {series.map((s) => {
            const isSelected = s.userId === selectedId;
            return (
              <button
                key={s.userId}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(s.userId)}
                style={isSelected ? { borderColor: s.style.color } : undefined}
                className={`flex w-full items-center gap-2.5 min-h-[58px] rounded-card-sm px-2 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  isSelected
                    ? "bg-white border-2"
                    : "bg-transparent border-2 border-transparent"
                }`}
              >
                <span className="font-display font-bold text-sm text-muted tabular-nums w-5 text-right shrink-0">
                  {s.rank}
                </span>
                <svg width={14} height={14} aria-hidden="true" className="shrink-0">
                  <PlayerMarker shape={s.style.shape} cx={7} cy={7} fill={s.style.color} />
                </svg>
                <span className="min-w-0 flex-1">
                  <span className="block font-body text-sm font-medium text-ink truncate">
                    {s.displayName}
                  </span>
                  <span className="block font-body text-[11px] text-ink-tertiary truncate">
                    {s.rank === 1
                      ? `+${s.latestRoundPoints} i runde ${lastRoundNumber}, fører`
                      : `+${s.latestRoundPoints} i runde ${lastRoundNumber}, ${s.gapToLeader} bag`}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="flex items-end gap-[2px] shrink-0"
                  style={{ width: FORM_TRACK_WIDTH, height: FORM_TRACK_HEIGHT }}
                >
                  {s.points.map((point) => (
                    <span
                      key={point.roundNumber}
                      className="block rounded-[1px]"
                      style={{
                        width: barWidth,
                        // Always at least a 2px stub so a 0-point round stays visible
                        height: Math.max(
                          2,
                          Math.round((point.points / MAX_ROUND_POINTS) * FORM_TRACK_HEIGHT)
                        ),
                        backgroundColor: isSelected ? s.style.color : DIM_MARK,
                      }}
                    />
                  ))}
                </span>
                <span className="flex flex-col items-end shrink-0 w-9">
                  <span className="font-display font-bold text-sm text-ink tabular-nums">
                    {s.total}
                  </span>
                  <Movement movement={s.movement} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
