"use client";

import { PredictionForm } from "./PredictionForm";

export function HomePredictionForm({ roundId }: { roundId: string }) {
  return <PredictionForm roundId={roundId} compact />;
}
