import type { User, Season, Round, Match, Prediction, Pick } from "@prisma/client";

// Re-export Prisma types
export type { User, Season, Round, Match, Prediction, Pick };

// Extended types with relations
export type MatchWithPredictions = Match & {
  predictions: Prediction[];
};

export type RoundWithMatches = Round & {
  matches: Match[];
};

export type RoundFull = Round & {
  matches: (Match & { predictions: Prediction[] })[];
  predictions: Prediction[];
};

// Narrowed user type for leaderboard entries (only rendered fields)
export type LeaderboardUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

// Leaderboard
export interface LeaderboardEntry {
  user: LeaderboardUser;
  totalPoints: number;
  roundsPlayed: number;
  avgScore: number;
  seasonFedt: number;
  roundScores: {
    roundNumber: number;
    points: number;
    fedt: number;
    played: boolean;
  }[];
}

// Round scores for a user
export interface UserRoundScore {
  roundId: string;
  roundNumber: number;
  points: number;
  maxPoints: number;
  fedt: number;
  picks: {
    matchNumber: number;
    homeTeam: string;
    awayTeam: string;
    pick: Pick;
    result: Pick | null;
    correct: boolean;
    odds: number;
  }[];
}

// User stats
export interface UserStats {
  totalPoints: number;
  roundsPlayed: number;
  avgScore: number;
  bestRound: { roundNumber: number; points: number } | null;
  worstRound: { roundNumber: number; points: number } | null;
  currentStreak: number;
  seasonFedt: number;
  pickDistribution: { home: number; draw: number; away: number };
  roundHistory: UserRoundScore[];
}

// API responses
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Serialized types for passing server → client components (Decimal → number, Date → string)
export interface SerializedMatch {
  id: string;
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  result: Pick | null;
  predictions: { userId: string; userName: string; pick: Pick }[];
}

export interface SerializedRound {
  id: string;
  roundNumber: number;
  deadline: string;
  status: string;
  seasonName: string;
  matches: SerializedMatch[];
}

// Group coupon types
export interface SerializedGroupCouponMatch {
  id: string;
  matchId: string;
  matchNumber: number;
  coverage: "single" | "half" | "full";
  outcomes: ("HOME" | "DRAW" | "AWAY")[];
  baseOutcome: ("HOME" | "DRAW" | "AWAY") | null;
  reasoning: string;
  isOverridden: boolean;
  result?: ("HOME" | "DRAW" | "AWAY") | null;
  cancelled?: boolean;
}

export interface SerializedGroupCoupon {
  id: string;
  systemCode: string;
  status: "draft" | "final";
  createdAt: string;
  updatedAt: string;
  matches: SerializedGroupCouponMatch[];
}

// Extended match details for group coupon admin builder
export interface SerializedGroupCouponMatchDetails {
  id: string;
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  // Cancelled matches are decided by the tendenslodtrækning (odds-weighted draw)
  cancelled: boolean;
  fedtHome: number | null;
  fedtDraw: number | null;
  fedtAway: number | null;
}

// Submission status of the saved coupon to the official tournament site (managers only)
export interface GroupCouponSubmissionStatus {
  /** ISO week the coupon is submitted for (from the round deadline) */
  week: number;
  /** ISO-8601 time of the last successful submission */
  submittedAt: string | null;
  submissionHttpStatus: number | null;
  /** Plain-text-friendly stored reply; render as text only */
  submissionResponse: string | null;
  /** True when the coupon has changed since the last successful submission */
  isStale: boolean;
  /** True when the submission endpoint is configured on the server */
  configured: boolean;
}

// Suggestion response types (imported engine types are already JSON-serializable)
export interface GroupCouponSuggestionResponse {
  coupon: SerializedGroupCoupon | null;
  submission?: GroupCouponSubmissionStatus;
  suggestion?: {
    systems: Array<{
      system: {
        code: string;
        type: "R" | "U" | "M";
        full: number;
        half: number;
        single: number;
        rows: number;
        requiresBaseRow: boolean;
      };
      assignments: Array<{
        matchNumber: number;
        coverage: "single" | "half" | "full";
        outcomes: ("HOME" | "DRAW" | "AWAY")[];
        baseOutcome: ("HOME" | "DRAW" | "AWAY") | null;
        tally: {
          HOME: number;
          DRAW: number;
          AWAY: number;
          total: number;
        };
        idealCoverage: "single" | "half" | "full";
        reasoning: string;
      }>;
      missedOutcomes: number;
      totalCost: number;
      coverage: number;
    }>;
  };
  ballots?: Array<{
    userId: string;
    displayName: string;
    source: "current" | "carried";
    sourceRoundNumber: number;
    picks: Record<number, "HOME" | "DRAW" | "AWAY">;
  }>;
  // Admin builder: match details for rendering and re-solving
  matches?: SerializedGroupCouponMatchDetails[];
  roundNumber?: number;
  seasonName: string;
  suggestionError?: string;
  canManage: boolean;
}
