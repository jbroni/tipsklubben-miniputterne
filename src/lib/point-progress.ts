import type { LeaderboardEntry } from "@/types";
import { compareEntries, computeMovements } from "./leaderboard";

/** Marker shapes used to distinguish player lines without relying on colour alone. */
export type PlayerShape =
  | "circle"
  | "square"
  | "triangleUp"
  | "diamond"
  | "triangleDown"
  | "plus"
  | "hexagon"
  | "star"
  | "cross"
  | "pentagon";

export interface PlayerStyle {
  shape: PlayerShape;
  color: string;
}

// Fixed shape + colour table; index wraps so any number of players is supported
const PLAYER_STYLES: readonly PlayerStyle[] = [
  { shape: "circle", color: "#1d6b47" },
  { shape: "square", color: "#b8372b" },
  { shape: "triangleUp", color: "#2c5d9a" },
  { shape: "diamond", color: "#94640f" },
  { shape: "triangleDown", color: "#a8386f" },
  { shape: "plus", color: "#5a4a8c" },
  { shape: "hexagon", color: "#2d8b9a" },
  { shape: "star", color: "#97633a" },
  { shape: "cross", color: "#3f6b2b" },
  { shape: "pentagon", color: "#8a3f5d" },
];

/** Stable style by position in a fixed player order. Wraps for index >= 10. */
export function playerStyle(index: number): PlayerStyle {
  const safe =
    Number.isFinite(index) && index >= 0 ? Math.floor(index) % PLAYER_STYLES.length : 0;
  return PLAYER_STYLES[safe];
}

// Candidate y-axis steps, smallest first; at most 4 gridline intervals
const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50];

/** Pick the smallest tick step that keeps the axis at 4 intervals or fewer. */
export function chooseTickStep(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  for (const step of TICK_STEPS) {
    if (max / step <= 4) return step;
  }
  return 50;
}

/** Compute a rounded y-axis domain and its tick values for a given data max. */
export function computeYAxis(max: number): { step: number; yMax: number; ticks: number[] } {
  const safeMax = Number.isFinite(max) ? max : 0;
  const step = chooseTickStep(safeMax);
  const yMax = Math.max(step, Math.ceil(safeMax / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= yMax; value += step) {
    ticks.push(value);
  }
  return { step, yMax, ticks };
}

export interface LabelInput {
  id: string;
  name: string;
  endY: number;
}

export interface LabelPlacement {
  id: string;
  name: string;
  endY: number;
  labelY: number;
}

/** Place direct labels at their line ends, nudging them apart to avoid overlap. */
export function layoutLabels(
  points: LabelInput[],
  gap: number,
  top: number,
  bottom: number
): LabelPlacement[] {
  if (points.length === 0) return [];

  const placed: LabelPlacement[] = points
    .map((p) => ({ id: p.id, name: p.name, endY: p.endY, labelY: p.endY }))
    .sort((a, b) => {
      if (a.endY !== b.endY) return a.endY - b.endY;
      const byName = a.name.localeCompare(b.name, "da");
      if (byName !== 0) return byName;
      return a.id.localeCompare(b.id);
    });

  // Push down: keep at least `gap` below the previous label
  for (let i = 1; i < placed.length; i++) {
    const minY = placed[i - 1].labelY + gap;
    if (placed[i].labelY < minY) placed[i].labelY = minY;
  }

  // If the stack overflows the bottom, pin the last label and push back up
  const last = placed[placed.length - 1];
  if (last.labelY > bottom) {
    last.labelY = bottom;
    for (let i = placed.length - 2; i >= 0; i--) {
      const maxY = placed[i + 1].labelY - gap;
      if (placed[i].labelY > maxY) placed[i].labelY = maxY;
    }
  }

  // Final clamp: never render above the plot area
  for (const p of placed) {
    if (p.labelY < top) p.labelY = top;
  }

  return placed;
}

/** Shorten a display name for compact labels, appending an ellipsis when cut. */
export function truncateName(name: string, maxChars = 10): string {
  if (name.length <= maxChars) return name;
  return name.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

/** Width in px of a single form bar so that a full season's bars fit the sparkline. */
export function formBarWidth(roundCount: number): number {
  if (!Number.isFinite(roundCount) || roundCount <= 0) return 1;
  return Math.max(1, Math.min(8, Math.floor(72 / roundCount) - 2));
}

export interface ProgressPoint {
  roundNumber: number;
  cumulative: number;
  gap: number;
  points: number;
  played: boolean;
}

export interface ProgressSeries {
  userId: string;
  displayName: string;
  shortName: string;
  styleIndex: number;
  style: PlayerStyle;
  points: ProgressPoint[];
  total: number;
  rank: number;
  movement: number | undefined;
  latestRoundPoints: number;
  gapToLeader: number;
  isLeader: boolean;
}

export interface Progress {
  series: ProgressSeries[];
  roundNumbers: number[];
  roundCount: number;
  maxCumulative: number;
  /**
   * Largest gap to the leader across ALL rounds and all players — the y-axis
   * domain for gap ("Bag føreren") mode. Not to be confused with
   * ProgressSeries.gapToLeader, which is that player's final-round gap only.
   */
  maxGap: number;
}

/** Build every series, ranking and domain value the point progress chart needs. */
export function buildProgress(entries: LeaderboardEntry[]): Progress {
  if (entries.length === 0) {
    return { series: [], roundNumbers: [], roundCount: 0, maxCumulative: 0, maxGap: 0 };
  }

  // Played round numbers need not be contiguous, so use the sorted union as the x-axis
  const roundNumberSet = new Set<number>();
  for (const entry of entries) {
    for (const score of entry.roundScores) {
      if (Number.isFinite(score.roundNumber)) roundNumberSet.add(score.roundNumber);
    }
  }
  const roundNumbers = Array.from(roundNumberSet).sort((a, b) => a - b);
  const roundCount = roundNumbers.length;

  // Style order is stable across rounds: derived from user id, not standings
  const styleIndexById = new Map<string, number>();
  [...entries]
    .sort((a, b) => a.user.id.localeCompare(b.user.id))
    .forEach((entry, index) => styleIndexById.set(entry.user.id, index));

  const movements = computeMovements(entries);

  // Per-entry cumulative + raw points per round (missing rounds count as 0, unplayed)
  const tracks = entries.map((entry) => {
    const byRound = new Map<number, { points: number; played: boolean }>();
    for (const score of entry.roundScores) {
      byRound.set(score.roundNumber, { points: score.points, played: score.played });
    }

    let cumulative = 0;
    const points: ProgressPoint[] = roundNumbers.map((roundNumber) => {
      const score = byRound.get(roundNumber);
      const scored = score?.points ?? 0;
      cumulative += scored;
      return {
        roundNumber,
        cumulative,
        gap: 0,
        points: scored,
        played: score?.played ?? false,
      };
    });

    return { entry, points, total: cumulative };
  });

  // Gap to the round leader, computed per round across all players
  for (let i = 0; i < roundCount; i++) {
    let leaderCumulative = 0;
    for (const track of tracks) {
      const value = track.points[i].cumulative;
      if (value > leaderCumulative) leaderCumulative = value;
    }
    for (const track of tracks) {
      track.points[i].gap = leaderCumulative - track.points[i].cumulative;
    }
  }

  const sorted = [...tracks].sort((a, b) => compareEntries(a.entry, b.entry));

  const series: ProgressSeries[] = sorted.map((track, index) => {
    // Competition ranking: equal entries share the rank of the first of them
    let rank = index + 1;
    for (let i = index - 1; i >= 0; i--) {
      if (compareEntries(sorted[i].entry, track.entry) !== 0) break;
      rank = i + 1;
    }

    const finalPoint = roundCount > 0 ? track.points[roundCount - 1] : undefined;
    const gapToLeader = finalPoint?.gap ?? 0;
    const styleIndex = styleIndexById.get(track.entry.user.id) ?? 0;

    return {
      userId: track.entry.user.id,
      displayName: track.entry.user.displayName,
      shortName: truncateName(track.entry.user.displayName, 10),
      styleIndex,
      style: playerStyle(styleIndex),
      points: track.points,
      total: track.total,
      rank,
      movement: movements[track.entry.user.id],
      latestRoundPoints: finalPoint?.points ?? 0,
      gapToLeader,
      isLeader: gapToLeader === 0,
    };
  });

  const maxCumulative = series.reduce((max, s) => (s.total > max ? s.total : max), 0);
  // Spans every round, not just the final one: a mid-season gap can exceed the closing one
  let maxGap = 0;
  for (const s of series) {
    for (const point of s.points) {
      if (point.gap > maxGap) maxGap = point.gap;
    }
  }

  return { series, roundNumbers, roundCount, maxCumulative, maxGap };
}
