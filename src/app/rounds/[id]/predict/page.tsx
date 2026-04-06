"use client";

import { PredictionForm } from "@/components/PredictionForm";

export default function PredictPage({ params }: { params: { id: string } }) {
  return <PredictionForm roundId={params.id} />;
}
