"use client";

import { PredictionForm } from "@/components/PredictionForm";

export default function PredictPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { from?: string };
}) {
  return (
    <PredictionForm
      roundId={params.id}
      backHref={searchParams.from === "rounds" ? "/rounds" : "/"}
    />
  );
}
