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

// Leaderboard
export interface LeaderboardEntry {
  user: User;
  totalPoints: number;
  roundsPlayed: number;
  avgScore: number;
  seasonFedt: number;
  roundScores: {
    roundNumber: number;
    points: number;
    fedt: number;
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
